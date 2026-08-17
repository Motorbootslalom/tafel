import type { ClassId, Parcours, ParcoursRuntime, StartSlot, Starter, TrackItem } from '../types'
import { buildSequence, computeVerzahnung, trackOfClass } from './verzahnung'

/**
 * Erzeugt die Startliste eines Parcours: die verzahnte Reihenfolge, einmal je
 * Lauf hintereinander gehängt.
 *
 * Die Läufe kommen bewusst erst hier ins Spiel – die importierte Starterliste
 * kennt keine Lauf-Nummer. Nach dem Erzeugen ist die Liste frei bearbeitbar,
 * ein Starter kann seinen dritten Lauf also auch am Ende von Lauf 2 fahren.
 */
export function generateSlots(
  parcours: Parcours,
  starters: Starter[],
  laufCount: number,
): StartSlot[] {
  const { sequence } = computeVerzahnung(parcours, starters)
  const slots: StartSlot[] = []
  for (let lauf = 1; lauf <= Math.max(1, laufCount); lauf++) {
    sequence.forEach((s, index) => {
      // Die ID ergibt sich aus Parcours, Lauf und Position – bewusst nicht
      // zufällig. Jedes Fenster erzeugt die Startliste selbst; mit Zufall hätte
      // jedes andere Slot-IDs, und jede Änderung, die einen Start benennt
      // (vorziehen, zurückstellen, verschieben), liefe anderswo ins Leere.
      slots.push({ id: `${parcours.id}-l${lauf}-${index}`, starterId: s.id, lauf, status: 'pending' })
    })
  }
  return slots
}

export function emptyRuntime(parcoursId: string): ParcoursRuntime {
  return {
    parcoursId,
    slots: [],
    history: [],
    message: null,
    releasedLauf: 1,
    pausedClasses: [],
    pullForward: true,
  }
}

/** Nachschlag der Klasse eines Starters – überall dort nötig, wo Klassen aussetzen. */
export type KlasseOf = (starterId: string) => ClassId | null

// ---------------------------------------------------------------------------
// Abfragen
// ---------------------------------------------------------------------------

/** Slot, der gerade auf der Tafel steht (zuletzt gezeigter). */
export function currentSlot(rt: ParcoursRuntime): StartSlot | null {
  const id = rt.history[rt.history.length - 1]
  return id ? rt.slots.find((s) => s.id === id) ?? null : null
}

/** Slot, der davor auf der Tafel stand. */
export function previousSlot(rt: ParcoursRuntime): StartSlot | null {
  const id = rt.history[rt.history.length - 2]
  return id ? rt.slots.find((s) => s.id === id) ?? null : null
}

/** Noch offene Slots in geplanter Reihenfolge (ohne zurückgestellte). */
export function pendingSlots(rt: ParcoursRuntime): StartSlot[] {
  return rt.slots.filter((s) => s.status === 'pending')
}

/**
 * Offene Slots, die tatsächlich gefahren werden dürfen – also aus einem
 * freigegebenen Lauf. Genau diese Liste arbeitet das Stegpersonal ab.
 */
export function releasedSlots(rt: ParcoursRuntime): StartSlot[] {
  return pendingSlots(rt).filter((s) => isReleased(rt, s))
}

/** Ist ein Slot zum Fahren freigegeben? */
export function isReleased(rt: ParcoursRuntime, slot: StartSlot): boolean {
  return slot.lauf <= rt.releasedLauf
}

/** Zurückgestellte Slots – der Pool, aus dem reaktiviert wird. */
export function deferredSlots(rt: ParcoursRuntime): StartSlot[] {
  return rt.slots.filter((s) => s.status === 'deferred')
}

/** Setzt diese Klasse gerade aus (Boot defekt, Fahrer noch nicht am Steg)? */
export function isClassPaused(rt: ParcoursRuntime, klasse: ClassId): boolean {
  return rt.pausedClasses.includes(klasse)
}

/**
 * Setzt eine Klasse aus bzw. holt sie zurück.
 *
 * Das reine Kennzeichnen; das Wiedereinweben der offenen Starts übernimmt
 * {@link reinterleaveOpen} – dafür braucht es die Spur-Anordnung, die hier
 * bewusst nicht bekannt ist.
 */
export function setClassPaused(
  rt: ParcoursRuntime,
  klasse: ClassId,
  paused: boolean,
): ParcoursRuntime {
  if (isClassPaused(rt, klasse) === paused) return rt
  const pausedClasses = paused
    ? [...rt.pausedClasses, klasse]
    : rt.pausedClasses.filter((k) => k !== klasse)
  return { ...rt, pausedClasses }
}

/**
 * Offene Slots, die **jetzt** gefahren werden können: freigegeben und nicht aus
 * einer ausgesetzten Klasse. Genau diese Folge arbeitet der Steg ab.
 *
 * Übersprungen wird immer – ein fehlendes Boot fährt nicht, gleich wie der
 * Parcours eingestellt ist. Ob die übrigen Klassen dabei auf die freigewordenen
 * Plätze **aufrücken**, entscheidet `pullForward`; das ist eine Umsortierung der
 * Liste und steckt in {@link reinterleaveOpen}.
 */
export function startableSlots(rt: ParcoursRuntime, klasseOf?: KlasseOf): StartSlot[] {
  const released = releasedSlots(rt)
  if (!klasseOf || !rt.pausedClasses.length) return released
  return released.filter((s) => {
    const klasse = klasseOf(s.starterId)
    return !klasse || !isClassPaused(rt, klasse)
  })
}

/** Der Slot, der als nächstes an der Reihe wäre – nie aus einem gesperrten Lauf. */
export function nextSlot(rt: ParcoursRuntime, klasseOf?: KlasseOf): StartSlot | null {
  return startableSlots(rt, klasseOf)[0] ?? null
}

/**
 * Ist der freigegebene Lauf durch?
 *
 * Bewusst ohne Rücksicht auf ausgesetzte Klassen: Deren Starts stehen noch aus,
 * der Lauf ist also nicht fertig – er stockt nur. Das ist am Steg ein anderer
 * Hinweis als „Lauf ist durch“.
 */
export function laufComplete(rt: ParcoursRuntime): boolean {
  return releasedSlots(rt).length === 0
}

/** Der nächste Lauf, für den es noch offene Starts gibt – oder `null`. */
export function nextReleasableLauf(rt: ParcoursRuntime): number | null {
  const offen = pendingSlots(rt)
    .map((s) => s.lauf)
    .filter((lauf) => lauf > rt.releasedLauf)
  return offen.length ? Math.min(...offen) : null
}

/**
 * Gibt einen Lauf zum Fahren frei. Zurücknehmen ist erlaubt (Fehlbedienung),
 * aber nie unter Lauf 1.
 */
export function releaseLauf(rt: ParcoursRuntime, lauf: number): ParcoursRuntime {
  return { ...rt, releasedLauf: Math.max(1, lauf) }
}

// ---------------------------------------------------------------------------
// Änderungen (rein, liefern jeweils eine neue Runtime)
// ---------------------------------------------------------------------------

function withSlots(rt: ParcoursRuntime, slots: StartSlot[]): ParcoursRuntime {
  return { ...rt, slots }
}

function patchSlot(slots: StartSlot[], id: string, patch: Partial<StartSlot>): StartSlot[] {
  return slots.map((s) => (s.id === id ? { ...s, ...patch } : s))
}

/**
 * Zeigt einen bestimmten Slot auf der Tafel. Der Slot wird als gefahren
 * markiert, ans Ende der Historie gehängt und – falls er nicht ohnehin schon
 * dort stand – direkt hinter den zuletzt gezeigten Slot einsortiert, damit die
 * geplante Liste die tatsächliche Reihenfolge widerspiegelt.
 */
export function showSlot(rt: ParcoursRuntime, slotId: string, now: number): ParcoursRuntime {
  const slot = rt.slots.find((s) => s.id === slotId)
  if (!slot) return rt

  const rest = rt.slots.filter((s) => s.id !== slotId)
  const shown: StartSlot = { ...slot, status: 'done', shownAt: now }

  // Einfügeposition: hinter dem zuletzt gezeigten Slot, sonst ganz vorn.
  const lastShownId = rt.history[rt.history.length - 1]
  const at = lastShownId ? rest.findIndex((s) => s.id === lastShownId) + 1 : 0
  const slots = [...rest.slice(0, at), shown, ...rest.slice(at)]

  return { ...rt, slots, history: [...rt.history, slotId] }
}

/** Schaltet auf den nächsten offenen Starter weiter. */
export function advance(rt: ParcoursRuntime, now: number, klasseOf?: KlasseOf): ParcoursRuntime {
  const next = nextSlot(rt, klasseOf)
  return next ? showSlot(rt, next.id, now) : rt
}

/**
 * Nimmt den letzten Schritt zurück (Fehlbedienung). Der Slot wird wieder offen
 * und rutscht an den Anfang der offenen Liste.
 */
export function undoLast(rt: ParcoursRuntime): ParcoursRuntime {
  const lastId = rt.history[rt.history.length - 1]
  if (!lastId) return rt
  const slots = patchSlot(rt.slots, lastId, { status: 'pending', shownAt: undefined })
  return { ...rt, slots, history: rt.history.slice(0, -1) }
}

/**
 * Stellt einen Starter zurück (kurzfristig verhindert). Er bleibt in der Liste
 * sichtbar und kann jederzeit reaktiviert werden.
 */
export function deferSlot(rt: ParcoursRuntime, slotId: string): ParcoursRuntime {
  return withSlots(rt, patchSlot(rt.slots, slotId, { status: 'deferred' }))
}

/**
 * Aktiviert einen zurückgestellten Starter wieder – entweder als nächsten oder
 * am Ende seines Laufs.
 */
export function reactivateSlot(
  rt: ParcoursRuntime,
  slotId: string,
  where: 'next' | 'end',
): ParcoursRuntime {
  const slot = rt.slots.find((s) => s.id === slotId)
  if (!slot) return rt

  const revived: StartSlot = { ...slot, status: 'pending' }
  const rest = rt.slots.filter((s) => s.id !== slotId)

  if (where === 'end') {
    // Hinter den letzten offenen Slot desselben Laufs.
    let at = rest.length
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i].lauf === slot.lauf) {
        at = i + 1
        break
      }
    }
    return withSlots(rt, [...rest.slice(0, at), revived, ...rest.slice(at)])
  }

  const firstPending = rest.findIndex((s) => s.status === 'pending')
  const at = firstPending < 0 ? rest.length : firstPending
  return withSlots(rt, [...rest.slice(0, at), revived, ...rest.slice(at)])
}

/**
 * Wie ein Start umgesetzt wird.
 *
 * Die Startliste ist ein Reißverschluss aus mehreren Spuren: Position 1 gehört
 * Spur 1, Position 2 Spur 2, und so weiter. Nimmt man einen Starter einfach
 * heraus und setzt ihn woanders ein, geht dieses Muster kaputt – an zwei
 * Stellen stehen dann Starter derselben Klasse hintereinander, und am Steg
 * fehlt genau dort die Zeit für den Bootswechsel.
 *
 * Mit `keepInterleave` rutscht deshalb die **ganze Spur** mit: Der Starter
 * bekommt einen Platz, der ohnehin seiner Spur gehört, und die übrigen Starter
 * derselben Spur rücken entsprechend nach. Alle anderen Spuren bleiben
 * unberührt, das Muster bleibt erhalten.
 */
export interface MoveOptions {
  /** Verzahnung erhalten (Standard im Betrieb). */
  keepInterleave: boolean
  /** Spur eines Starters – aus der Verzahnung des Parcours. */
  trackOf: (starterId: string) => number | null
}

/** Offene Slots einer Spur samt ihrer Plätze in der Gesamtliste. */
function trackStream(
  slots: StartSlot[],
  track: number,
  trackOf: (starterId: string) => number | null,
): { positions: number[]; stream: StartSlot[] } {
  const positions: number[] = []
  slots.forEach((s, i) => {
    if (s.status !== 'done' && trackOf(s.starterId) === track) positions.push(i)
  })
  return { positions, stream: positions.map((i) => slots[i]) }
}

/** Schreibt eine neu geordnete Spur auf ihre bisherigen Plätze zurück. */
function writeStream(slots: StartSlot[], positions: number[], stream: StartSlot[]): StartSlot[] {
  const next = [...slots]
  positions.forEach((pos, i) => {
    next[pos] = stream[i]
  })
  return next
}

/**
 * Setzt einen Start so um, dass die Verzahnung erhalten bleibt: Er landet auf
 * dem Platz seiner Spur, der dem Ziel am nächsten liegt.
 *
 * `targetIndex` zählt in der Liste **ohne** den bewegten Start – das ist die
 * Stelle, an der er eingefügt würde.
 */
function placeKeepingInterleave(
  rt: ParcoursRuntime,
  slot: StartSlot,
  targetIndex: number,
  trackOf: (starterId: string) => number | null,
): ParcoursRuntime | null {
  const track = trackOf(slot.starterId)
  if (track === null) return null

  const { positions, stream } = trackStream(rt.slots, track, trackOf)
  const from = stream.findIndex((s) => s.id === slot.id)
  if (from < 0) return null

  // Wie viele Plätze dieser Spur liegen vor dem Ziel? Das ist die Ordnungszahl,
  // die der Starter innerhalb seiner Spur bekommen soll. Lag er selbst davor,
  // zählt er nach dem Herausnehmen nicht mehr mit.
  const restIndexOf = (fullIndex: number) => fullIndex - (fullIndex > positions[from] ? 1 : 0)
  let to = positions.filter((p) => restIndexOf(p) < targetIndex && p !== positions[from]).length
  to = Math.max(0, Math.min(stream.length - 1, to))
  if (to === from) return rt

  const next = [...stream]
  next.splice(from, 1)
  next.splice(to, 0, slot)
  return withSlots(rt, writeStream(rt.slots, positions, next))
}

/** Einfaches Umsetzen ohne Rücksicht auf die Verzahnung. */
function placeRaw(rt: ParcoursRuntime, slot: StartSlot, targetIndex: number): ParcoursRuntime {
  const rest = rt.slots.filter((s) => s.id !== slot.id)
  const at = Math.max(firstOpenIndex(rest), Math.min(rest.length, targetIndex))
  return withSlots(rt, [...rest.slice(0, at), slot, ...rest.slice(at)])
}

/**
 * Setzt einen Start an eine Position der Liste – das Ergebnis eines Zuges.
 * `index` zählt in der Liste ohne den bewegten Start.
 */
export function moveSlotToIndex(
  rt: ParcoursRuntime,
  slotId: string,
  index: number,
  options?: MoveOptions,
): ParcoursRuntime {
  const slot = rt.slots.find((s) => s.id === slotId)
  if (!slot || slot.status === 'done') return rt

  if (options?.keepInterleave) {
    const kept = placeKeepingInterleave(rt, slot, index, options.trackOf)
    if (kept) return kept
  }
  return placeRaw(rt, slot, index)
}

/**
 * Bezugspunkt zum Verschieben eines Starts an eine Lauf-Grenze.
 *
 * `beforeLauf` und `afterLauf` sind nicht dasselbe: „am Ende von Lauf 2" und
 * „vor dem Beginn von Lauf 3" fallen nur zusammen, solange die Läufe lückenlos
 * aufeinander folgen. Sobald nachgetragen oder umsortiert wurde, sind es zwei
 * verschiedene Stellen – und genau diese beiden Fälle kommen im Betrieb vor.
 */
export type LaufAnchor =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'beforeLauf'; lauf: number }
  | { kind: 'afterLauf'; lauf: number }

/** Erste Position hinter allen bereits gefahrenen Starts. */
function firstOpenIndex(slots: StartSlot[]): number {
  let index = 0
  slots.forEach((s, i) => {
    if (s.status === 'done') index = i + 1
  })
  return index
}

/**
 * Verschiebt einen Start an eine Lauf-Grenze – etwa den dritten Lauf ans Ende
 * von Lauf 2 oder den zweiten vor den Beginn von Lauf 3.
 *
 * Bereits gefahrene Starts bleiben unangetastet, und kein Start rutscht vor
 * sie: Die Liste soll die tatsächliche Reihenfolge widerspiegeln.
 */
export function moveSlotToAnchor(
  rt: ParcoursRuntime,
  slotId: string,
  anchor: LaufAnchor,
  options?: MoveOptions,
): ParcoursRuntime {
  const slot = rt.slots.find((s) => s.id === slotId)
  if (!slot || slot.status === 'done') return rt

  const rest = rt.slots.filter((s) => s.id !== slotId)

  /** Fällt der gesuchte Lauf aus, gilt der Beginn des nächsthöheren. */
  const startOfNextLauf = (lauf: number): number => {
    const at = rest.findIndex((s) => s.lauf > lauf)
    return at >= 0 ? at : rest.length
  }

  let at: number
  switch (anchor.kind) {
    case 'start':
      at = 0
      break
    case 'end':
      at = rest.length
      break
    case 'beforeLauf': {
      const first = rest.findIndex((s) => s.lauf === anchor.lauf)
      at = first >= 0 ? first : startOfNextLauf(anchor.lauf)
      break
    }
    case 'afterLauf': {
      let last = -1
      for (let i = rest.length - 1; i >= 0; i--) {
        if (rest[i].lauf === anchor.lauf) {
          last = i
          break
        }
      }
      at = last >= 0 ? last + 1 : startOfNextLauf(anchor.lauf)
      break
    }
  }

  at = Math.max(at, firstOpenIndex(rest))
  return moveSlotToIndex(rt, slotId, at, options)
}

/** Die Läufe, für die es noch Einträge gibt – aufsteigend. */
export function laeufeOf(rt: ParcoursRuntime): number[] {
  return [...new Set(rt.slots.map((s) => s.lauf))].sort((a, b) => a - b)
}

/**
 * Verschiebt einen Start schrittweise.
 *
 * Mit erhaltener Verzahnung zählt ein Schritt **innerhalb der eigenen Spur** –
 * in der Gesamtliste sind das je nach Spurzahl mehrere Plätze. Ein Schritt um
 * genau eine Listenposition wäre hier sinnlos: Der Nachbarplatz gehört einer
 * anderen Spur, der Starter bliebe also stehen.
 */
export function moveSlot(
  rt: ParcoursRuntime,
  slotId: string,
  delta: number,
  options?: MoveOptions,
): ParcoursRuntime {
  if (delta === 0) return rt
  const slot = rt.slots.find((s) => s.id === slotId)
  if (!slot) return rt

  if (options?.keepInterleave && slot.status !== 'done') {
    const track = options.trackOf(slot.starterId)
    if (track !== null) {
      const { positions, stream } = trackStream(rt.slots, track, options.trackOf)
      const from = stream.findIndex((s) => s.id === slotId)
      if (from >= 0) {
        const to = Math.max(0, Math.min(stream.length - 1, from + delta))
        if (to === from) return rt
        const next = [...stream]
        next.splice(from, 1)
        next.splice(to, 0, slot)
        return withSlots(rt, writeStream(rt.slots, positions, next))
      }
    }
  }

  const from = rt.slots.findIndex((s) => s.id === slotId)
  if (from < 0) return rt
  const slots = [...rt.slots]
  const [item] = slots.splice(from, 1)
  const to = Math.max(0, Math.min(slots.length, from + delta))
  slots.splice(to, 0, item)
  return withSlots(rt, slots)
}

/**
 * Verzahnt die noch offenen Starts eines freigegebenen Laufs neu – **ohne** die
 * gerade ausgesetzten Klassen.
 *
 * Der Fall dahinter: Das Boot einer Klasse fällt aus. Ihre Plätze in der
 * Startfolge werden frei, und die nächste Klasse **derselben Spur** soll darauf
 * aufrücken. Nur so bleibt der Wechsel zwischen den Spuren erhalten und am Steg
 * die Zeit für den Bootswechsel:
 *
 * ```
 * E 2 E 2 1 2 1 2 1 2 1 2 1 6 1 6 3   Spur 1: E,1,3 · Spur 2: 2,6
 * E 6 E 6 1 1 1 1 1 1 3               Klasse 2 setzt aus – Klasse 6 rückt auf
 * ```
 *
 * Die Starts der ausgesetzten Klassen wandern dabei ans **Ende ihres Laufs**.
 * Sie zwischen den anderen stehen zu lassen wäre irreführend: Die Startliste
 * zeigte dann eine Reihenfolge, in der sie nie fahren, und es sähe aus, als sei
 * die falsche Klasse herausgenommen worden. Kommt das Boot zurück, werden sie
 * beim nächsten Weben wieder eingereiht.
 *
 * Gerechnet wird mit derselben Verzahnung wie in der Verwaltung, angewandt aber
 * nur auf den **Rest** des jeweiligen Laufs. Bereits gefahrene Starts, gesperrte
 * Läufe und zurückgestellte Starter bleiben unangetastet; jeder Lauf wird für
 * sich gewoben, damit sich die Läufe nicht vermischen.
 *
 * Pausen aus der Spur-Anordnung bleiben außen vor: Sie versetzen den **Beginn**
 * eines Laufs und sind mitten im Lauf längst verbraucht.
 */
export interface ReinterleaveOptions {
  /**
   * Gewünschte Klassen-Reihenfolge. Die **Spuren bleiben dabei erhalten** – die
   * Klassen werden nur innerhalb ihrer eigenen Spur umsortiert. Alles andere
   * hübe den Wechsel-Faktor auf: Bei zwei Spuren liefen dann acht Klassen im
   * Reigen durch, statt zwischen zwei Spuren zu wechseln.
   */
  order?: ClassId[]
  /** Nur diesen einen Lauf anfassen (statt aller freigegebenen). */
  nurLauf?: number
}

export function reinterleaveOpen(
  rt: ParcoursRuntime,
  tracks: TrackItem[][],
  klasseOf: KlasseOf,
  options: ReinterleaveOptions = {},
): ParcoursRuntime {
  const faehrt = (klasse: ClassId) => !isClassPaused(rt, klasse)
  const order = options.order
  const rang = (klasse: ClassId) => {
    const i = order?.indexOf(klasse) ?? -1
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }

  const nurKlassen = tracks.map((track) => {
    const klassen = track.filter(
      (i): i is Extract<TrackItem, { kind: 'class' }> => i.kind === 'class' && faehrt(i.klasse),
    )
    return order ? [...klassen].sort((a, b) => rang(a.klasse) - rang(b.klasse)) : klassen
  })
  if (!nurKlassen.some((track) => track.length)) return rt

  // Wo der Reigen einsetzt. Ohne Vorgabe: hinter der Spur des zuletzt gezeigten
  // Starters, sonst stünden an der Nahtstelle zwei Starter derselben Spur. Mit
  // Vorgabe: bei der Spur der Klasse, die vorn stehen soll – nur so kommt sie
  // auch wirklich als Nächste dran.
  //
  // Bewusst aus der **vollständigen** Anordnung: Der letzte Starter kann aus der
  // Klasse stammen, die gerade ausgesetzt wurde.
  const spurVon = trackOfClass(tracks)
  const laufend = currentSlot(rt)
  const laufendeKlasse = laufend ? klasseOf(laufend.starterId) : null
  const startTrack = order
    ? spurVon.get(order[0]) ?? 0
    : laufendeKlasse !== null && spurVon.has(laufendeKlasse)
      ? spurVon.get(laufendeKlasse)! + 1
      : 0

  let slots = rt.slots
  for (const lauf of laeufeOf(rt)) {
    if (lauf > rt.releasedLauf) continue
    if (options.nurLauf !== undefined && lauf !== options.nurLauf) continue

    const positions: number[] = []
    const byClass = new Map<ClassId, StartSlot[]>()
    const ohneKlasse: StartSlot[] = []
    const ausgesetzt: StartSlot[] = []

    slots.forEach((slot, i) => {
      if (slot.status !== 'pending' || slot.lauf !== lauf) return
      positions.push(i)
      const klasse = klasseOf(slot.starterId)
      if (klasse && !faehrt(klasse)) {
        ausgesetzt.push(slot)
        return
      }
      if (!klasse) {
        ohneKlasse.push(slot)
        return
      }
      const list = byClass.get(klasse) ?? []
      list.push(slot)
      byClass.set(klasse, list)
    })
    if (positions.length < 2) continue

    // Starter aus Klassen, die gar nicht in der Anordnung stehen, gingen beim
    // Weben verloren. Lieber gar nicht anfassen als jemanden verlieren.
    const gewoben = [
      ...buildSequence(nurKlassen, byClass, startTrack),
      ...ohneKlasse,
      // Ans Ende: Bis das Boot zurück ist, fahren sie nicht.
      ...ausgesetzt,
    ]
    if (gewoben.length !== positions.length) continue

    const next = [...slots]
    positions.forEach((pos, i) => {
      next[pos] = gewoben[i]
    })
    slots = next
  }

  return slots === rt.slots ? rt : withSlots(rt, slots)
}

/**
 * Die Klassen in der Reihenfolge, in der sie im Rest des Laufs drankommen –
 * maßgeblich ist der jeweils **nächste** Start einer Klasse.
 *
 * Bewusst nicht kanonisch (E, 1, 2 …) sortiert: Am Steg zählt, was als Nächstes
 * kommt. Verzahnt springt die Folge ohnehin zwischen den Klassen hin und her;
 * diese Liste zieht daraus je Klasse den ersten Auftritt heraus.
 */
export function classesByNextStart(rt: ParcoursRuntime, klasseOf: KlasseOf): ClassId[] {
  const seen: ClassId[] = []
  for (const slot of releasedSlots(rt)) {
    const klasse = klasseOf(slot.starterId)
    if (klasse && !seen.includes(klasse)) seen.push(klasse)
  }
  return seen
}

/**
 * Zieht eine Klasse in der Startfolge vor bzw. schiebt sie zurück: Sie kommt
 * künftig dort an die Reihe, wo bisher `before` an der Reihe war. `before`
 * gleich `null` heißt „als Letzte".
 *
 * Der Griff für den Fall, dass eine Klasse am Steg früher oder später bereit ist
 * als geplant – etwa weil ein Boot noch getankt wird.
 *
 * Die **Spuren bleiben dabei erhalten**: Umsortiert werden die Klassen nur
 * innerhalb ihrer eigenen Spur, der Wechsel-Faktor gilt weiter. Eine Klasse, die
 * allein auf ihrer Spur liegt, lässt sich deshalb auch nicht verschieben – ihre
 * Plätze gehören ihr ohnehin schon alle.
 *
 * Angefasst wird nur der Lauf, der gerade gefahren wird. Ausgesetzte Klassen
 * bleiben außen vor; sie fahren ohnehin nicht.
 */
export function moveClassBefore(
  rt: ParcoursRuntime,
  klasse: ClassId,
  before: ClassId | null,
  tracks: TrackItem[][],
  klasseOf: KlasseOf,
): ParcoursRuntime {
  if (klasse === before) return rt

  const lauf = startableSlots(rt, klasseOf)[0]?.lauf
  if (lauf === undefined) return rt

  const order = classesByNextStart(rt, klasseOf).filter((k) => !isClassPaused(rt, k))
  if (!order.includes(klasse)) return rt

  const rest = order.filter((k) => k !== klasse)
  const at = before === null ? rest.length : rest.indexOf(before)
  if (at < 0) return rt

  const neu = [...rest.slice(0, at), klasse, ...rest.slice(at)]
  if (neu.every((k, i) => k === order[i])) return rt

  return reinterleaveOpen(rt, tracks, klasseOf, { order: neu, nurLauf: lauf })
}

/**
 * Fügt einen zusätzlichen Lauf für einen Starter ein – etwa wenn jemand seinen
 * zweiten Lauf vor dem Beginn von Lauf 3 nachholt.
 */
export function insertSlot(
  rt: ParcoursRuntime,
  slotId: string,
  starterId: string,
  lauf: number,
  where: 'next' | 'end',
): ParcoursRuntime {
  // Die ID kommt von außen: Sie muss in allen Fenstern dieselbe sein, darf hier
  // also nicht gewürfelt werden.
  const slot: StartSlot = { id: slotId, starterId, lauf, status: 'pending' }
  if (where === 'end') return withSlots(rt, [...rt.slots, slot])
  const firstPending = rt.slots.findIndex((s) => s.status === 'pending')
  const at = firstPending < 0 ? rt.slots.length : firstPending
  return withSlots(rt, [...rt.slots.slice(0, at), slot, ...rt.slots.slice(at)])
}

/** Entfernt einen geplanten Start (nur solange er noch offen ist). */
export function removeSlot(rt: ParcoursRuntime, slotId: string): ParcoursRuntime {
  if (rt.history.includes(slotId)) return rt
  return withSlots(rt, rt.slots.filter((s) => s.id !== slotId))
}

/**
 * Entfernt alle Slots von Startern, die es nicht mehr gibt (z. B. nach einem
 * erneuten Import). Bereits gefahrene Slots bleiben für die Historie erhalten.
 */
export function pruneSlots(rt: ParcoursRuntime, knownStarterIds: Set<string>): ParcoursRuntime {
  const slots = rt.slots.filter((s) => knownStarterIds.has(s.starterId) || s.status === 'done')
  const keep = new Set(slots.map((s) => s.id))
  return { ...rt, slots, history: rt.history.filter((id) => keep.has(id)) }
}
