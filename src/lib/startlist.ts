import type { ClassId, Parcours, ParcoursRuntime, StartSlot, Starter } from '../types'
import { computeVerzahnung } from './verzahnung'

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
  return { parcoursId, slots: [], history: [], message: null, releasedLauf: 1 }
}

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
  return pendingSlots(rt).filter((s) => s.lauf <= rt.releasedLauf)
}

/** Ist ein Slot zum Fahren freigegeben? */
export function isReleased(rt: ParcoursRuntime, slot: StartSlot): boolean {
  return slot.lauf <= rt.releasedLauf
}

/** Zurückgestellte Slots – der Pool, aus dem reaktiviert wird. */
export function deferredSlots(rt: ParcoursRuntime): StartSlot[] {
  return rt.slots.filter((s) => s.status === 'deferred')
}

/** Der Slot, der als nächstes an der Reihe wäre – nie aus einem gesperrten Lauf. */
export function nextSlot(rt: ParcoursRuntime): StartSlot | null {
  return releasedSlots(rt)[0] ?? null
}

/** Ist der freigegebene Lauf durch? */
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
export function advance(rt: ParcoursRuntime, now: number): ParcoursRuntime {
  const next = nextSlot(rt)
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
 * Verschiebt eine ganze Klasse in der Verzahnung nach hinten (`steps > 0`) oder
 * nach vorn (`steps < 0`).
 *
 * Genau das braucht das Stegpersonal, wenn das Boot einer Klasse defekt ist:
 * Die Klasse setzt aus, eine andere springt ein, und sobald das Boot wieder da
 * ist, läuft die Verzahnung mit dem neuen Versatz weiter. Nur offene Slots
 * werden bewegt; bereits gefahrene bleiben, wo sie sind.
 */
export function shiftClass(
  rt: ParcoursRuntime,
  klasse: ClassId,
  klasseOf: (starterId: string) => ClassId | null,
  steps: number,
): ParcoursRuntime {
  if (steps === 0) return rt

  // Nur der freigegebene Lauf wird umsortiert – ein späterer Lauf hat mit dem
  // ausgefallenen Boot von jetzt nichts zu tun.
  const pendingIdx: number[] = []
  rt.slots.forEach((s, i) => {
    if (s.status === 'pending' && isReleased(rt, s)) pendingIdx.push(i)
  })

  // Die offenen Slots als eigene Sequenz umsortieren und danach zurückschreiben.
  const pending = pendingIdx.map((i) => rt.slots[i])
  const isTarget = (s: StartSlot) => klasseOf(s.starterId) === klasse

  // Zwei Ströme: die Klasse und alle anderen. Die anderen behalten ihre
  // Reihenfolge; die Klasse rutscht um `steps` Positionen weiter. Rekonstruiert
  // wird Position für Position – so bleibt der Versatz auch dann korrekt, wenn
  // mehrere Slots derselben Klasse hintereinander liegen.
  const targets: StartSlot[] = []
  const others: StartSlot[] = []
  const wantedAt: number[] = []
  pending.forEach((s, i) => {
    if (isTarget(s)) {
      targets.push(s)
      wantedAt.push(i + steps)
    } else {
      others.push(s)
    }
  })

  const reordered: StartSlot[] = []
  let ti = 0
  let oi = 0
  for (let pos = 0; pos < pending.length; pos++) {
    const targetWantsHere = ti < targets.length && wantedAt[ti] <= pos
    const othersExhausted = oi >= others.length
    if (ti < targets.length && (targetWantsHere || othersExhausted)) reordered.push(targets[ti++])
    else reordered.push(others[oi++])
  }

  const slots = [...rt.slots]
  pendingIdx.forEach((slotIndex, i) => {
    slots[slotIndex] = reordered[i]
  })
  return withSlots(rt, slots)
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
