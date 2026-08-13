import type { AppState, ClassId, Parcours, ParcoursRuntime, Starter } from '../types'
import { CLASS_IDS } from '../lib/classes'
import { uid } from '../lib/ids'
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
  pruneSlots,
  reactivateSlot,
  releaseLauf,
  removeSlot,
  shiftClass,
  showSlot,
  undoLast,
  type MoveOptions,
} from '../lib/startlist'
import { computeVerzahnung } from '../lib/verzahnung'
import { classStats, statsToPresets } from '../lib/timing'
import type { Action } from './actions'

/** Standard-Aufteilung der Klassen auf zwei Parcours (See/Land). */
const DEFAULT_SPLIT: ClassId[][] = [
  ['E', '1', '2', '3'],
  ['4', '5', '6', '7'],
]

function defaultParcours(count: number): Parcours[] {
  if (count <= 1) {
    return [{ id: uid('par'), name: 'Parcours 1', classIds: [...CLASS_IDS], wechselFaktor: 2 }]
  }
  return Array.from({ length: count }, (_, i) => ({
    id: uid('par'),
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
    timings: {},
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

  const { tracks } = computeVerzahnung(parcours, state.starters)
  const trackOfClass = new Map<ClassId, number>()
  tracks.forEach((track, index) => {
    for (const item of track) if (item.kind === 'class') trackOfClass.set(item.klasse, index)
  })

  const klasseOf = klasseLookup(state.starters)
  return {
    keepInterleave: true,
    trackOf: (starterId) => {
      const klasse = klasseOf(starterId)
      if (!klasse) return null
      return trackOfClass.get(klasse) ?? null
    },
  }
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
    // Zustände aus einer älteren Fassung kennen die Lauf-Freigabe noch nicht.
    // Was bereits gefahren wurde, gilt als freigegeben – sonst stünde eine
    // laufende Veranstaltung plötzlich still.
    if (typeof existing.releasedLauf === 'number') return existing
    const gefahren = existing.slots.filter((s) => s.status === 'done').map((s) => s.lauf)
    return { ...existing, releasedLauf: gefahren.length ? Math.max(...gefahren) : 1 }
  })
  return { ...state, runtimes }
}

/**
 * Der Reducer: eine reine Funktion `(Zustand, Action) → Zustand`. Host und
 * Clients führen sie identisch aus, deshalb darf hier nichts passieren, was vom
 * Gerät abhängt (keine Zeitstempel aus `Date.now()`, keine DOM-Zugriffe – die
 * aktuelle Zeit kommt als Teil der Action herein).
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

    case 'ADVANCE':
      return mapRuntime(state, action.parcoursId, (rt) => advance(rt, action.now))

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
        insertSlot(rt, action.starterId, action.lauf, action.where),
      )

    case 'SHIFT_CLASS': {
      const klasseOf = klasseLookup(state.starters)
      return mapRuntime(state, action.parcoursId, (rt) =>
        shiftClass(rt, action.klasse, klasseOf, action.steps),
      )
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
    timings: loaded.timings ?? {},
    devices: loaded.devices ?? [],
    runtimes: loaded.runtimes ?? [],
  }
  return syncRuntimes(state)
}
