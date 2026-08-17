import type { ClassId, Parcours, Starter, TrackItem } from '../types'
import { classOrder } from './classes'
import { sortedByStartNr } from './startnumbers'

/**
 * Verzahnung: Die Klassen eines Parcours werden auf `wechselFaktor` Spuren
 * verteilt und im Round-Robin abgearbeitet. Dadurch wechselt zwischen zwei
 * Starts möglichst die Klasse – nur so kann das Stegpersonal das Boot tauschen,
 * während der andere Starter fährt.
 *
 * Übernommen aus dem Verzahnungs-Prototyp und auf das hier nötige Maß gekürzt
 * (ohne Boot-Budget, dafür mit Pausen als Versatz-Mittel).
 */

/** Eindeutige ID eines Spur-Elements (Klasse: die Klassen-ID, Pause: die Pause-ID). */
export function itemDragId(item: TrackItem): string {
  return item.kind === 'class' ? item.klasse : item.id
}

/** Anzahl Starter je Klasse. */
export function classCounts(starters: Starter[]): Map<ClassId, number> {
  const m = new Map<ClassId, number>()
  for (const s of starters) m.set(s.klasse, (m.get(s.klasse) ?? 0) + 1)
  return m
}

/** Starter je Klasse, jeweils nach Startnummer sortiert. */
export function startersByClass(starters: Starter[]): Map<ClassId, Starter[]> {
  const m = new Map<ClassId, Starter[]>()
  for (const s of starters) {
    const list = m.get(s.klasse) ?? []
    list.push(s)
    m.set(s.klasse, list)
  }
  for (const [k, list] of m) m.set(k, sortedByStartNr(list))
  return m
}

/** Klassen eines Parcours, die tatsächlich Starter haben, kanonisch sortiert. */
export function presentClasses(parcours: Parcours, starters: Starter[]): ClassId[] {
  const counts = classCounts(starters)
  return parcours.classIds
    .filter((c) => (counts.get(c) ?? 0) > 0)
    .sort((a, b) => classOrder(a) - classOrder(b))
}

/** Klassen-Gruppen (je Spur) in kanonisch sortierte Klassen-Blöcke umwandeln. */
function bucketsToTracks(buckets: ClassId[][]): TrackItem[][] {
  return buckets.map((b) =>
    [...b]
      .sort((a, c) => classOrder(a) - classOrder(c))
      .map((klasse) => ({ kind: 'class' as const, klasse })),
  )
}

/**
 * Exakt ausgeglichene 2-Spur-Aufteilung. Bei Faktor 2 bestimmt genau die
 * Differenz der Starterzahlen die Länge des un-verzahnten End-Blocks, deshalb
 * lohnt sich hier die vollständige Suche (nie mehr als 8 Klassen).
 */
function twoWayBalanced(classes: ClassId[], counts: Map<ClassId, number>): TrackItem[][] {
  const n = classes.length
  const cnt = (c: ClassId) => counts.get(c) ?? 0
  const total = classes.reduce((s, c) => s + cnt(c), 0)

  let bestMask = 0
  let bestDiff = Infinity
  for (let mask = 0; mask < 1 << n; mask++) {
    let sum = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += cnt(classes[i])
    const diff = Math.abs(total - 2 * sum)
    if (diff < bestDiff) {
      bestDiff = diff
      bestMask = mask
    }
  }

  const groupA: ClassId[] = []
  const groupB: ClassId[] = []
  for (let i = 0; i < n; i++) (bestMask & (1 << i) ? groupA : groupB).push(classes[i])

  // Größere Spur zuerst: der Rest am Ende bleibt dadurch kürzer.
  const sum = (g: ClassId[]) => g.reduce((s, c) => s + cnt(c), 0)
  return bucketsToTracks([groupA, groupB].sort((a, b) => sum(b) - sum(a)))
}

/** Greedy: größte Klassen zuerst, jeweils in die aktuell kleinste Spur. */
function greedyDistribute(
  classes: ClassId[],
  counts: Map<ClassId, number>,
  n: number,
): TrackItem[][] {
  const buckets: ClassId[][] = Array.from({ length: n }, () => [])
  const sums = new Array<number>(n).fill(0)

  const sorted = [...classes].sort((a, b) => {
    const d = (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
    return d !== 0 ? d : classOrder(a) - classOrder(b)
  })

  for (const c of sorted) {
    let best = 0
    for (let i = 1; i < n; i++) if (sums[i] < sums[best]) best = i
    buckets[best].push(c)
    sums[best] += counts.get(c) ?? 0
  }

  return bucketsToTracks(buckets)
}

/** Verteilt die Klassen möglichst gleichmäßig (nach Starterzahl) auf N Spuren. */
export function autoDistribute(
  classes: ClassId[],
  counts: Map<ClassId, number>,
  n: number,
): TrackItem[][] {
  if (n <= 1) return bucketsToTracks([classes])
  if (n === 2) return twoWayBalanced(classes, counts)
  return greedyDistribute(classes, counts, n)
}

function classesInTracks(tracks: TrackItem[][]): ClassId[] {
  return tracks.flatMap((t) =>
    t.filter((i): i is Extract<TrackItem, { kind: 'class' }> => i.kind === 'class').map((i) => i.klasse),
  )
}

/** Altes/unbekanntes Format in TrackItem[][] überführen; sonst undefined. */
function normalizeTracks(raw: unknown): TrackItem[][] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: TrackItem[][] = []
  for (const track of raw) {
    if (!Array.isArray(track)) return undefined
    const items: TrackItem[] = []
    for (const it of track) {
      if (typeof it === 'string') items.push({ kind: 'class', klasse: it as ClassId })
      else if (it && typeof it === 'object' && (it as TrackItem).kind === 'class')
        items.push({ kind: 'class', klasse: (it as { klasse: ClassId }).klasse })
      else if (it && typeof it === 'object' && (it as TrackItem).kind === 'pause')
        items.push({
          kind: 'pause',
          id: (it as { id: string }).id,
          length: (it as { length: number }).length,
        })
      else return undefined
    }
    out.push(items)
  }
  return out
}

/** Prüft, ob eine manuelle Anordnung genau die vorhandenen Klassen abdeckt. */
export function tracksMatch(
  tracks: TrackItem[][] | undefined,
  classes: ClassId[],
  n: number,
): boolean {
  if (!tracks || tracks.length !== n) return false
  const flat = classesInTracks(tracks)
  if (flat.length !== classes.length) return false
  const set = new Set(flat)
  if (set.size !== flat.length) return false
  return classes.every((c) => set.has(c))
}

type Step<T> = { kind: 'item'; value: T } | { kind: 'pause' }

/**
 * Baut die verzahnte Reihenfolge aus einer Spur-Anordnung: Round-Robin über die
 * Spuren. Eine Pause verbraucht einen Takt ihrer Spur, ohne einen Starter zu
 * erzeugen – die nachfolgende Klasse setzt dadurch später ein, ohne dass eine
 * Lücke in der Startliste entsteht.
 *
 * Bewusst über einen freien Typ: Beim Erzeugen der Startliste werden Starter
 * verzahnt, beim Wiedereinsteigen einer ausgesetzten Klasse dagegen die noch
 * offenen Slots des laufenden Laufs (siehe `startlist.reinterleaveOpen`).
 *
 * `startTrack` gibt an, bei welcher Spur der Reigen beginnt. Beim Neuaufbau
 * mitten im Lauf steht dort die Spur, die nach dem zuletzt gezeigten Starter an
 * der Reihe wäre – sonst stünden an der Nahtstelle zwei Starter derselben Spur
 * hintereinander.
 */
export function buildSequence<T>(
  tracks: TrackItem[][],
  byClass: Map<ClassId, T[]>,
  startTrack = 0,
): T[] {
  const stepTracks: Step<T>[][] = tracks.map((track) => {
    const steps: Step<T>[] = []
    for (const item of track) {
      if (item.kind === 'pause') {
        for (let i = 0; i < Math.max(0, item.length); i++) steps.push({ kind: 'pause' })
      } else {
        for (const value of byClass.get(item.klasse) ?? []) steps.push({ kind: 'item', value })
      }
    }
    return steps
  })

  const pos = stepTracks.map(() => 0)
  const sequence: T[] = []
  const n = stepTracks.length
  let idx = n > 0 ? ((startTrack % n) + n) % n : 0

  const remaining = () =>
    stepTracks.reduce(
      (sum, steps, i) => sum + steps.slice(pos[i]).filter((s) => s.kind === 'item').length,
      0,
    )

  while (n > 0 && remaining() > 0) {
    let skipped = 0
    while (skipped < n && pos[idx % n] >= stepTracks[idx % n].length) {
      idx++
      skipped++
    }
    if (skipped >= n) break

    const t = idx % n
    const step = stepTracks[t][pos[t]]
    pos[t]++
    idx++
    if (step.kind === 'item') sequence.push(step.value)
  }

  return sequence
}

/** Spur-Nummer je Klasse – wer nicht vorkommt, fehlt in der Anordnung. */
export function trackOfClass(tracks: TrackItem[][]): Map<ClassId, number> {
  const m = new Map<ClassId, number>()
  tracks.forEach((track, index) => {
    for (const item of track) if (item.kind === 'class') m.set(item.klasse, index)
  })
  return m
}

export interface SequenceAnalysis {
  total: number
  /** Benachbarte Paare mit Klassenwechsel (Bootswechsel möglich). */
  wechsel: number
  /** Benachbarte Paare derselben Klasse (kein Wechsel möglich). */
  nonWechsel: number
  /** Klasse des un-verzahnten End-Blocks. */
  trailingKlasse: ClassId | null
  /** Länge des End-Blocks derselben Klasse – die Kennzahl, die es zu drücken gilt. */
  trailingRun: number
}

export function analyzeSequence(sequence: Starter[]): SequenceAnalysis {
  const total = sequence.length
  let wechsel = 0
  let nonWechsel = 0
  for (let i = 1; i < total; i++) {
    if (sequence[i].klasse === sequence[i - 1].klasse) nonWechsel++
    else wechsel++
  }

  let trailingKlasse: ClassId | null = null
  let trailingRun = 0
  if (total > 0) {
    trailingKlasse = sequence[total - 1].klasse
    trailingRun = 1
    for (let i = total - 2; i >= 0 && sequence[i].klasse === trailingKlasse; i--) trailingRun++
  }

  return { total, wechsel, nonWechsel, trailingKlasse, trailingRun }
}

export interface VerzahnungResult {
  tracks: TrackItem[][]
  sequence: Starter[]
  /** true, wenn die manuelle Anordnung genutzt wurde. */
  manual: boolean
}

/**
 * Verzahnung eines Parcours für **einen** Lauf. Nutzt die manuelle
 * Spur-Anordnung, falls sie zur aktuellen Klassen-/Faktor-Situation passt,
 * sonst die automatische Verteilung.
 */
export function computeVerzahnung(parcours: Parcours, allStarters: Starter[]): VerzahnungResult {
  const starters = allStarters.filter((s) => parcours.classIds.includes(s.klasse))
  const classes = presentClasses(parcours, starters)
  const counts = classCounts(starters)
  const byClass = startersByClass(starters)
  const n = parcours.wechselFaktor

  const normalized = normalizeTracks(parcours.tracks)
  const manual = tracksMatch(normalized, classes, n)
  const tracks = manual ? normalized! : autoDistribute(classes, counts, n)

  return { tracks, sequence: buildSequence(tracks, byClass), manual }
}
