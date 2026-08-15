import type {
  AppState,
  BoardConfig,
  BoardMessage,
  ClassId,
  DeviceGrant,
  Parcours,
  Starter,
  TimingTable,
  TrackItem,
} from '../types'
import type { LaufAnchor } from '../lib/startlist'

/**
 * Alle Zustandsänderungen laufen über diese Actions. Sie sind serialisierbar,
 * damit ein Handy am Steg exakt dieselbe Änderung auslösen kann wie das
 * Admin-Fenster – der Reducer ist an beiden Enden derselbe.
 */
export type Action =
  // --- Einrichtung -------------------------------------------------------
  | { type: 'SET_EVENT'; eventName: string; eventJahr: number; laufCount: number }
  | { type: 'IMPORT_STARTERS'; starters: Starter[]; mode: 'replace' | 'append' }
  | { type: 'REMOVE_STARTER'; starterId: string }
  | { type: 'SET_PARCOURS_COUNT'; count: number }
  | { type: 'UPDATE_PARCOURS'; parcoursId: string; patch: Partial<Omit<Parcours, 'id'>> }
  | { type: 'SET_TRACKS'; parcoursId: string; tracks: TrackItem[][] | undefined }
  | { type: 'GENERATE_STARTLIST'; parcoursId: string }
  | { type: 'GENERATE_ALL_STARTLISTS' }

  // --- Betrieb -----------------------------------------------------------
  | { type: 'ADVANCE'; parcoursId: string; now: number }
  | { type: 'SHOW_SLOT'; parcoursId: string; slotId: string; now: number }
  | { type: 'UNDO'; parcoursId: string }
  | { type: 'DEFER_SLOT'; parcoursId: string; slotId: string }
  | { type: 'REACTIVATE_SLOT'; parcoursId: string; slotId: string; where: 'next' | 'end' }
  | { type: 'MOVE_SLOT'; parcoursId: string; slotId: string; delta: number }
  | { type: 'MOVE_SLOT_TO_INDEX'; parcoursId: string; slotId: string; index: number }
  | { type: 'MOVE_SLOT_TO_ANCHOR'; parcoursId: string; slotId: string; anchor: LaufAnchor }
  | { type: 'REMOVE_SLOT'; parcoursId: string; slotId: string }
  /**
   * Einen Lauf nachtragen. Die `slotId` kommt von der Oberfläche, damit alle
   * Fenster denselben Eintrag erzeugen – der Reducer darf nicht würfeln.
   */
  | {
      type: 'INSERT_SLOT'
      parcoursId: string
      slotId: string
      starterId: string
      lauf: number
      where: 'next' | 'end'
    }
  | { type: 'SHIFT_CLASS'; parcoursId: string; klasse: ClassId; steps: number }
  | { type: 'RELEASE_LAUF'; parcoursId: string; lauf: number }
  | { type: 'SET_MESSAGE'; parcoursId: string; message: BoardMessage | null }

  // --- Darstellung und Stammdaten ---------------------------------------
  | { type: 'SET_KEEP_INTERLEAVE'; keepInterleave: boolean }
  | { type: 'SET_BOARD'; patch: Partial<BoardConfig> }
  | { type: 'SET_TIMINGS'; timings: TimingTable }
  | { type: 'ADOPT_MEASURED_TIMINGS' }
  | { type: 'UPSERT_DEVICE'; grant: DeviceGrant }
  | { type: 'REMOVE_DEVICE'; deviceId: string }
  /** Eine Sicherung einspielen – ersetzt den gesamten Zustand. */
  | { type: 'LOAD_STATE'; state: AppState }
  | { type: 'RESET' }

export type ActionType = Action['type']

/** Actions, die nur die Anzeige/den Betrieb eines Parcours betreffen. */
export const OPERATOR_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  'ADVANCE',
  'SHOW_SLOT',
  'UNDO',
  'DEFER_SLOT',
  'REACTIVATE_SLOT',
  'MOVE_SLOT',
  'MOVE_SLOT_TO_INDEX',
  'MOVE_SLOT_TO_ANCHOR',
  'REMOVE_SLOT',
  'INSERT_SLOT',
  'SHIFT_CLASS',
  'RELEASE_LAUF',
  'SET_MESSAGE',
])

/** Der Parcours, auf den sich eine Action bezieht (falls überhaupt einer). */
export function actionParcoursId(action: Action): string | null {
  return 'parcoursId' in action ? action.parcoursId : null
}
