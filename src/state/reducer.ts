import type { AppState, ClassId, Parcours, ParcoursRuntime, Starter } from '../types'
import { CLASS_IDS } from '../lib/classes'
import { fillMissingStartNumbers } from '../lib/startnumbers'
import {
  advance,
  deferSlot,
  emptyRuntime,
  generateSlots,
  insertSlot,
  moveSlot,
  moveSlotToAnchor,
  moveSlotToIndex,
  moveClassBefore,
  pruneSlots,
  reactivateSlot,
  reinterleaveOpen,
  releaseLauf,
  removeSlot,
  setClassPaused,
  showSlot,
  undoLast,
  type MoveOptions,
} from '../lib/startlist'
import { computeVerzahnung, trackOfClass } from '../lib/verzahnung'
import { defaultTimings } from '../data/timings'
import { classStats, statsToPresets } from '../lib/timing'
import type { Action } from './actions'

/** Standard-Aufteilung der Klassen auf zwei Parcours (See/Land). */
const DEFAULT_SPLIT: ClassId[][] = [
  ['E', '1', '2', '3'],
  ['4', '5', '6', '7'],
]

/**
 * Feste IDs, bewusst **nicht** zufällig.
 *
 * In der Basis-Version führt jedes Fenster dieselbe Änderung selbst aus. Würfelte
 * jedes seine eigenen IDs, hätten zwei Fenster, die beide mit leerem Speicher
 * starten, unterschiedliche Parcours – und jede Änderung, die einen Parcours
 * benennt, liefe im anderen Fenster ins Leere. Genau daran ist es gescheitert:
 * Die Kopfzeile (ohne ID) kam an, der Parcours-Name und der nächste Starter
 * nicht.
 */
function defaultParcours(count: number): Parcours[] {
  if (count <= 1) {
    return [{ id: 'par1', name: 'Parcours 1', classIds: [...CLASS_IDS], wechselFaktor: 2 }]
  }
  return Array.from({ length: count }, (_, i) => ({
    id: `par${i + 1}`,
    name: `Parcours ${i + 1}`,
    classIds: DEFAULT_SPLIT[i] ?? [],
    wechselFaktor: 2 as const,
  }))
}

export function initialState(): AppState {
  const parcoursList = defaultParcours(2)
  return {
    version: 1,
    eventName: 'Motorbootslalom',
    eventJahr: new Date().getFullYear(),
    laufCount: 3,
    keepInterleave: true,
    starters: [],
    parcoursList,
    runtimes: parcoursList.map((p) => emptyRuntime(p.id)),
    // Vorgabewerte aus der DM 2025 – damit die Wartezeit-Prognose schon vor dem
    // ersten gemessenen Start etwas Vernünftiges sagt.
    timings: defaultTimings(),
    board: {
      kopfzeile: '',
      logoDataUrl: '',
      originMode: 'verein',
      showPrevious: true,
      showParcoursName: true,
      showVorname: true,
      scale: 1,
    },
    devices: [],
    initialized: false,
  }
}

/** Klassen-Nachschlag über die aktuelle Starterliste. */
export function klasseLookup(starters: Starter[]): (starterId: string) => ClassId | null {
  const map = new Map(starters.map((s) => [s.id, s.klasse]))
  return (id) => map.get(id) ?? null
}

/**
 * Ordnet jedem Starter seine Spur in der Verzahnung zu und liefert daraus die
 * Vorgaben fürs Umsortieren. Nur so kann beim Verschieben die ganze Spur
 * mitwandern und das Wechselmuster erhalten bleiben.
 */
function moveOptions(state: AppState, parcoursId: string): MoveOptions {
  const parcours = state.parcoursList.find((p) => p.id === parcoursId)
  if (!parcours || !state.keepInterleave) {
    return { keepInterleave: false, trackOf: () => null }
  }

  const spurVon = trackOfClass(computeVerzahnung(parcours, state.starters).tracks)
  const klasseOf = klasseLookup(state.starters)
  return {
    keepInterleave: true,
    trackOf: (starterId) => {
      const klasse = klasseOf(starterId)
      if (!klasse) return null
      return spurVon.get(klasse) ?? null
    },
  }
}

/** Die Spur-Anordnung eines Parcours – Grundlage jeder Neu-Verzahnung. */
function tracksOf(state: AppState, parcoursId: string) {
  const parcours = state.parcoursList.find((p) => p.id === parcoursId)
  return parcours ? computeVerzahnung(parcours, state.starters).tracks : null
}

/** Wendet eine Änderung auf die Runtime genau eines Parcours an. */
function mapRuntime(
  state: AppState,
  parcoursId: string,
  fn: (rt: ParcoursRuntime) => ParcoursRuntime,
): AppState {
  let touched = false
  const runtimes = state.runtimes.map((rt) => {
    if (rt.parcoursId !== parcoursId) return rt
    touched = true
    return fn(rt)
  })
  return touched ? { ...state, runtimes } : state
}

/** Stellt sicher, dass zu jedem Parcours genau eine Runtime existiert. */
function syncRuntimes(state: AppState): AppState {
  const byId = new Map(state.runtimes.map((rt) => [rt.parcoursId, rt]))
  const runtimes = state.parcoursList.map((p) => {
    const existing = byId.get(p.id)
    if (!existing) return emptyRuntime(p.id)
    // Felder, die eine ältere Fassung noch nicht kannte, auffüllen.
    const ergaenzt: ParcoursRuntime = {
      ...existing,
      pausedClasses: existing.pausedClasses ?? [],
      pullForward: existing.pullForward ?? true,
    }

    // Die Lauf-Freigabe kam später dazu. Was bereits gefahren wurde, gilt als
    // freigegeben – sonst stünde eine laufende Veranstaltung plötzlich still.
    if (typeof ergaenzt.releasedLauf === 'number') return ergaenzt
    const gefahren = ergaenzt.slots.filter((s) => s.status === 'done').map((s) => s.lauf)
    return { ...ergaenzt, releasedLauf: gefahren.length ? Math.max(...gefahren) : 1 }
  })
  return { ...state, runtimes }
}

/**
 * Der Reducer: eine reine Funktion `(Zustand, Action) → Zustand`. Host und
 * Clients führen sie identisch aus.
 *
 * Er muss dabei **deterministisch** sein: Zwischen den Fenstern eines Browsers
 * wird nicht der Zustand übertragen, sondern die Änderung selbst – jedes Fenster
 * führt sie eigenständig aus und muss zum exakt gleichen Ergebnis kommen.
 * Deshalb darf hier nichts entstehen, was vom Gerät oder vom Zufall abhängt:
 *
 * - keine Zeitstempel aus `Date.now()` – die Zeit kommt in der Action mit,
 * - keine zufälligen IDs – sie kommen in der Action mit oder stehen fest,
 * - keine DOM-Zugriffe.
 *
 * Wird das verletzt, sehen zwei Fenster gleich aus, benennen dieselben Dinge
 * aber unterschiedlich – und jede folgende Änderung, die etwas benennt, läuft im
 * anderen Fenster lautlos ins Leere. Festgehalten in `determinismus.test.ts`.
 */
export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_EVENT':
      return {
        ...state,
        eventName: action.eventName,
        eventJahr: action.eventJahr,
        laufCount: Math.max(1, action.laufCount),
        initialized: true,
      }

    case 'IMPORT_STARTERS': {
      const starters =
        action.mode === 'replace' ? [...action.starters] : [...state.starters, ...action.starters]
      fillMissingStartNumbers(starters)
      const known = new Set(starters.map((s) => s.id))
      return {
        ...state,
        starters,
        runtimes: state.runtimes.map((rt) => pruneSlots(rt, known)),
        initialized: true,
      }
    }

    case 'REMOVE_STARTER': {
      const starters = state.starters.filter((s) => s.id !== action.starterId)
      const known = new Set(starters.map((s) => s.id))
      return { ...state, starters, runtimes: state.runtimes.map((rt) => pruneSlots(rt, known)) }
    }

    case 'SET_PARCOURS_COUNT': {
      const count = Math.max(1, Math.min(2, action.count))
      if (count === state.parcoursList.length) return state

      if (count < state.parcoursList.length) {
        // Beim Verkleinern die Klassen des entfallenden Parcours retten.
        const kept = state.parcoursList.slice(0, count)
        const dropped = state.parcoursList.slice(count)
        const orphans = dropped.flatMap((p) => p.classIds)
        const last = kept[kept.length - 1]
        const merged = [...kept.slice(0, -1), { ...last, classIds: [...last.classIds, ...orphans] }]
        return syncRuntimes({ ...state, parcoursList: merged })
      }

      const additions = defaultParcours(count).slice(state.parcoursList.length)
      return syncRuntimes({ ...state, parcoursList: [...state.parcoursList, ...additions] })
    }

    case 'UPDATE_PARCOURS':
      return {
        ...state,
        parcoursList: state.parcoursList.map((p) =>
          p.id === action.parcoursId ? { ...p, ...action.patch } : p,
        ),
      }

    case 'SET_TRACKS':
      return {
        ...state,
        parcoursList: state.parcoursList.map((p) =>
          p.id === action.parcoursId ? { ...p, tracks: action.tracks } : p,
        ),
      }

    case 'GENERATE_STARTLIST': {
      const parcours = state.parcoursList.find((p) => p.id === action.parcoursId)
      if (!parcours) return state
      return mapRuntime(state, action.parcoursId, () => ({
        ...emptyRuntime(action.parcoursId),
        slots: generateSlots(parcours, state.starters, state.laufCount),
      }))
    }

    case 'GENERATE_ALL_STARTLISTS':
      return {
        ...state,
        runtimes: state.parcoursList.map((p) => ({
          ...emptyRuntime(p.id),
          slots: generateSlots(p, state.starters, state.laufCount),
        })),
      }

    case 'ADVANCE': {
      const klasseOf = klasseLookup(state.starters)
      return mapRuntime(state, action.parcoursId, (rt) => advance(rt, action.now, klasseOf))
    }

    case 'SHOW_SLOT':
      return mapRuntime(state, action.parcoursId, (rt) => showSlot(rt, action.slotId, action.now))

    case 'UNDO':
      return mapRuntime(state, action.parcoursId, undoLast)

    case 'DEFER_SLOT':
      return mapRuntime(state, action.parcoursId, (rt) => deferSlot(rt, action.slotId))

    case 'REACTIVATE_SLOT':
      return mapRuntime(state, action.parcoursId, (rt) =>
        reactivateSlot(rt, action.slotId, action.where),
      )

    case 'MOVE_SLOT':
      return mapRuntime(state, action.parcoursId, (rt) =>
        moveSlot(rt, action.slotId, action.delta, moveOptions(state, action.parcoursId)),
      )

    case 'MOVE_SLOT_TO_INDEX':
      return mapRuntime(state, action.parcoursId, (rt) =>
        moveSlotToIndex(rt, action.slotId, action.index, moveOptions(state, action.parcoursId)),
      )

    case 'MOVE_SLOT_TO_ANCHOR':
      return mapRuntime(state, action.parcoursId, (rt) =>
        moveSlotToAnchor(rt, action.slotId, action.anchor, moveOptions(state, action.parcoursId)),
      )

    case 'SET_KEEP_INTERLEAVE':
      return { ...state, keepInterleave: action.keepInterleave }

    case 'REMOVE_SLOT':
      return mapRuntime(state, action.parcoursId, (rt) => removeSlot(rt, action.slotId))

    case 'INSERT_SLOT':
      return mapRuntime(state, action.parcoursId, (rt) =>
        insertSlot(rt, action.slotId, action.starterId, action.lauf, action.where),
      )

    case 'SET_CLASS_PAUSED': {
      const klasseOf = klasseLookup(state.starters)
      const tracks = tracksOf(state, action.parcoursId)
      return mapRuntime(state, action.parcoursId, (rt) => {
        const next = setClassPaused(rt, action.klasse, action.paused)
        // Ohne „vorziehen" bleibt die geplante Reihenfolge stehen; die Lücken
        // schließen sich beim Weiterschalten von selbst.
        if (next === rt || !next.pullForward || !tracks) return next
        return reinterleaveOpen(next, tracks, klasseOf)
      })
    }

    case 'MOVE_CLASS_BEFORE': {
      const klasseOf = klasseLookup(state.starters)
      const tracks = tracksOf(state, action.parcoursId)
      if (!tracks) return state
      return mapRuntime(state, action.parcoursId, (rt) =>
        moveClassBefore(rt, action.klasse, action.before, tracks, klasseOf),
      )
    }

    case 'SET_PULL_FORWARD': {
      const klasseOf = klasseLookup(state.starters)
      const tracks = tracksOf(state, action.parcoursId)
      return mapRuntime(state, action.parcoursId, (rt) => {
        if (rt.pullForward === action.pullForward) return rt
        const next = { ...rt, pullForward: action.pullForward }
        // Einschalten wirkt sofort auf den Rest des Laufs. Ausschalten lässt die
        // bereits umsortierte Liste stehen – zurückgerechnet wird nicht, sonst
        // spränge am Steg die Reihenfolge unter den Händen weg.
        return action.pullForward && tracks ? reinterleaveOpen(next, tracks, klasseOf) : next
      })
    }

    case 'RELEASE_LAUF':
      return mapRuntime(state, action.parcoursId, (rt) => releaseLauf(rt, action.lauf))

    case 'SET_MESSAGE':
      return mapRuntime(state, action.parcoursId, (rt) => ({ ...rt, message: action.message }))

    case 'SET_BOARD':
      return { ...state, board: { ...state.board, ...action.patch } }

    case 'SET_TIMINGS':
      return { ...state, timings: action.timings }

    case 'ADOPT_MEASURED_TIMINGS': {
      const stats = classStats(state.runtimes, klasseLookup(state.starters))
      return { ...state, timings: statsToPresets(stats, state.timings) }
    }

    case 'UPSERT_DEVICE': {
      const exists = state.devices.some((d) => d.deviceId === action.grant.deviceId)
      const devices = exists
        ? state.devices.map((d) => (d.deviceId === action.grant.deviceId ? action.grant : d))
        : [...state.devices, action.grant]
      return { ...state, devices }
    }

    case 'REMOVE_DEVICE':
      return { ...state, devices: state.devices.filter((d) => d.deviceId !== action.deviceId) }

    case 'LOAD_STATE':
      // Über `migrate`, damit auch eine Sicherung aus einer älteren Fassung
      // vollständig ankommt und nichts fehlt.
      return migrate(action.state)

    case 'RESET':
      return initialState()
  }
}

/**
 * Ergänzt einen geladenen Zustand um Felder, die eine ältere Fassung noch nicht
 * kannte. Lieber großzügig auffüllen als beim Wettkampf mit einer leeren Tafel
 * dastehen.
 */
export function migrate(loaded: AppState): AppState {
  const base = initialState()
  const state: AppState = {
    ...base,
    ...loaded,
    board: { ...base.board, ...(loaded.board ?? {}) },
    keepInterleave: loaded.keepInterleave ?? true,
    // Eine bestehende Tabelle bleibt, wie sie ist – auch eine leere: Wer die
    // Vorgaben bewusst gelöscht hat, soll sie nicht beim nächsten Laden
    // zurückbekommen. Über „Werte der DM 2025 einsetzen" sind sie erreichbar.
    timings: loaded.timings ?? defaultTimings(),
    devices: loaded.devices ?? [],
    runtimes: loaded.runtimes ?? [],
  }
  return syncRuntimes(state)
}
