import type { ClassId, ParcoursRuntime, StartSlot, TimingTable } from '../types'
import { CLASS_IDS } from './classes'
import { startableSlots } from './startlist'

/**
 * Startabstände messen und Wartezeiten prognostizieren.
 *
 * Gemessen wird der Abstand zwischen zwei aufeinanderfolgenden Starts, und zwar
 * dem **vorherigen** Starter zugeschlagen: Die Zeit von seinem Erscheinen auf
 * der Tafel bis zum Erscheinen des nächsten ist die Zeit, die sein Lauf gekostet
 * hat. Die Mittelwerte gelten je Klasse (Klasse E braucht länger als Klasse 7).
 */

/**
 * Abstände oberhalb dieser Grenze zählen nicht als normaler Start, sondern als
 * Pause, Störung oder Mittagspause – sie würden den Schnitt verfälschen.
 */
export const MAX_PLAUSIBLE_GAP_S = 300

/**
 * Abstände unterhalb dieser Grenze sind nie ein echter Lauf: Sie entstehen beim
 * Durchklicken, beim Zurücknehmen eines Fehlklicks oder beim Nachtragen. Zählten
 * sie mit, sackte der Schnitt auf wenige Sekunden – und die Startliste versprach
 * zwanzig Startern hintereinander „gleich".
 */
export const MIN_PLAUSIBLE_GAP_S = 30

/** Fallback, solange weder Messung noch Vorgabewert existiert. */
export const DEFAULT_INTERVAL_S = 90

export interface Measurement {
  klasse: ClassId
  seconds: number
}

export interface ClassStat {
  klasse: ClassId
  avg: number
  samples: number
  /** Letzter gemessener Abstand – zeigt den aktuellen Rhythmus. */
  last: number | null
}

/**
 * Liest die gemessenen Startabstände aus der Historie eines Parcours.
 * Unplausible Abstände – zu lang (siehe {@link MAX_PLAUSIBLE_GAP_S}) wie zu kurz
 * (siehe {@link MIN_PLAUSIBLE_GAP_S}) – werden verworfen.
 */
export function measurements(
  rt: ParcoursRuntime,
  klasseOf: (starterId: string) => ClassId | null,
): Measurement[] {
  const byId = new Map<string, StartSlot>(rt.slots.map((s) => [s.id, s]))
  const shown = rt.history
    .map((id) => byId.get(id))
    .filter((s): s is StartSlot => !!s && typeof s.shownAt === 'number')

  const out: Measurement[] = []
  for (let i = 1; i < shown.length; i++) {
    const prev = shown[i - 1]
    const seconds = (shown[i].shownAt! - prev.shownAt!) / 1000
    if (seconds < MIN_PLAUSIBLE_GAP_S || seconds > MAX_PLAUSIBLE_GAP_S) continue
    const klasse = klasseOf(prev.starterId)
    if (klasse) out.push({ klasse, seconds })
  }
  return out
}

/** Mittelwerte je Klasse über alle Parcours. */
export function classStats(
  runtimes: ParcoursRuntime[],
  klasseOf: (starterId: string) => ClassId | null,
): Map<ClassId, ClassStat> {
  const sums = new Map<ClassId, { total: number; n: number; last: number }>()
  for (const rt of runtimes) {
    for (const m of measurements(rt, klasseOf)) {
      const acc = sums.get(m.klasse) ?? { total: 0, n: 0, last: 0 }
      acc.total += m.seconds
      acc.n += 1
      acc.last = m.seconds
      sums.set(m.klasse, acc)
    }
  }

  const out = new Map<ClassId, ClassStat>()
  for (const [klasse, acc] of sums) {
    out.set(klasse, { klasse, avg: acc.total / acc.n, samples: acc.n, last: acc.last })
  }
  return out
}

/**
 * Liefert den anzunehmenden Startabstand je Klasse: gemessener Schnitt, sobald
 * genügend Messungen vorliegen, sonst der vorkonfigurierte Wert, sonst der
 * allgemeine Fallback.
 */
export function estimator(
  presets: TimingTable,
  stats: Map<ClassId, ClassStat>,
  minSamples = 3,
): (klasse: ClassId) => number {
  return (klasse) => {
    const stat = stats.get(klasse)
    if (stat && stat.samples >= minSamples) return stat.avg
    const preset = presets[klasse]
    if (preset && preset.avg > 0) {
      // Wenige Messungen: Vorgabe und Messung mischen, damit der Wert schon
      // mitläuft, ohne bei einem Ausreißer komplett zu kippen.
      if (stat && stat.samples > 0) {
        const w = stat.samples / minSamples
        return preset.avg * (1 - w) + stat.avg * w
      }
      return preset.avg
    }
    return stat?.avg ?? DEFAULT_INTERVAL_S
  }
}

export interface WaitEstimate {
  slotId: string
  /** Sekunden ab jetzt bis zum Start. */
  seconds: number
}

/**
 * Prognostiziert für jeden offenen Slot, wie lange es noch bis zu seinem Start
 * dauert. Die Restzeit des gerade laufenden Starters wird mitgerechnet, damit
 * die Anzeige nicht springt, wenn ein Lauf länger dauert.
 *
 * Gerechnet wird **nur für den Lauf, der gerade gefahren wird**. Für jeden
 * anderen ist der Beginn schlicht unbekannt: Zwischen Lauf 1 und 2 liegt die
 * Mittagspause, zwischen 2 und 3 eine Nacht. Solche Starts bekommen deshalb
 * keinen Eintrag – die Oberfläche zeigt dort keine Zeit an, statt eine
 * hochgerechnete Zahl zu erfinden.
 *
 * Ebenfalls ohne Eintrag: Starts einer Klasse, die gerade aussetzt. Wann ihr
 * Boot zurück ist, weiß niemand.
 */
export function waitEstimates(
  rt: ParcoursRuntime,
  klasseOf: (starterId: string) => ClassId | null,
  estimate: (klasse: ClassId) => number,
  now: number,
): WaitEstimate[] {
  const currentId = rt.history[rt.history.length - 1]
  const current = currentId ? rt.slots.find((s) => s.id === currentId) : undefined

  const offen = startableSlots(rt, klasseOf)
  const laufendeRunde = offen[0]?.lauf
  if (laufendeRunde === undefined) return []

  let acc = 0
  if (current && typeof current.shownAt === 'number') {
    const klasse = klasseOf(current.starterId)
    const expected = klasse ? estimate(klasse) : DEFAULT_INTERVAL_S
    const elapsed = (now - current.shownAt) / 1000
    acc = Math.max(0, expected - elapsed)
  }

  const out: WaitEstimate[] = []
  for (const slot of offen) {
    if (slot.lauf !== laufendeRunde) continue
    out.push({ slotId: slot.id, seconds: acc })
    const klasse = klasseOf(slot.starterId)
    acc += klasse ? estimate(klasse) : DEFAULT_INTERVAL_S
  }
  return out
}

/** „in 12 min" / „in 1:23 h" / „gleich" – kompakt für die Zuschauer-Liste. */
export function formatWait(seconds: number): string {
  if (seconds < 60) return 'gleich'
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return `${h}:${rest.toString().padStart(2, '0')} h`
}

/** mm:ss – für die gemessenen Startabstände im Admin. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * Baut aus den Messungen einer Veranstaltung die Vorgabewerte für die nächste.
 * Klassen ohne Messung behalten ihren bisherigen Vorgabewert.
 */
export function statsToPresets(
  stats: Map<ClassId, ClassStat>,
  current: TimingTable,
): TimingTable {
  const out: TimingTable = { ...current }
  for (const klasse of CLASS_IDS) {
    const stat = stats.get(klasse)
    if (stat && stat.samples > 0) out[klasse] = { avg: stat.avg, samples: stat.samples }
  }
  return out
}
