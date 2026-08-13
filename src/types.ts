/**
 * Datenmodell der Anzeigetafel.
 *
 * Zentraler Gedanke: Die **Startliste** eines Parcours ist eine flache Folge von
 * {@link StartSlot}s (Starter × Lauf). Sie wird aus der Verzahnung erzeugt, ist
 * danach aber frei bearbeitbar – ein Starter kann seinen dritten Lauf also
 * jederzeit an einer ganz anderen Stelle fahren.
 *
 * Was tatsächlich auf der Tafel stand, steht in {@link ParcoursRuntime.history}
 * (Slot-IDs in Anzeigereihenfolge). Daraus ergeben sich aktueller Starter,
 * Starter davor und die gemessenen Zeiten – unabhängig davon, wie die geplante
 * Liste zwischenzeitlich umsortiert wurde.
 */

export type ClassId = 'E' | '1' | '2' | '3' | '4' | '5' | '6' | '7'

/** Ob die Herkunft als Verein oder als Bundesland auf der Tafel steht. */
export type OriginMode = 'verein' | 'bundesland'

/** Anzahl der Spuren, über die eine Verzahnung läuft (1–4). */
export type WechselFaktor = 1 | 2 | 3 | 4

// ---------------------------------------------------------------------------
// Starter
// ---------------------------------------------------------------------------

export interface Starter {
  id: string
  /** Klassenbasierte Startnummer (E01, 312, …) – das große Feld auf der Tafel. */
  startNr: string
  vorname: string
  nachname: string
  verein: string
  bundesland: string
  klasse: ClassId
  /** Geburtsdatum ISO (YYYY-MM-DD); nur informativ, darf leer sein. */
  geburtsdatum: string
}

// ---------------------------------------------------------------------------
// Verzahnung (Spur-Anordnung je Parcours)
// ---------------------------------------------------------------------------

export interface ClassItem {
  kind: 'class'
  klasse: ClassId
}

/** Lässt eine Spur `length` Takte aussetzen – verschiebt die Verzahnung nach hinten. */
export interface PauseItem {
  kind: 'pause'
  id: string
  length: number
}

export type TrackItem = ClassItem | PauseItem

// ---------------------------------------------------------------------------
// Startliste
// ---------------------------------------------------------------------------

/**
 * Status eines geplanten Starts.
 *
 * - `pending`   – steht noch aus
 * - `done`      – ist gefahren
 * - `deferred`  – zurückgestellt (Starter kurzfristig verhindert); bleibt in der
 *                 Liste sichtbar und kann jederzeit reaktiviert werden
 */
export type SlotStatus = 'pending' | 'done' | 'deferred'

export interface StartSlot {
  id: string
  starterId: string
  /** Lauf-Nummer (1-basiert). */
  lauf: number
  status: SlotStatus
  /** Zeitpunkt (ms seit Epoch), zu dem der Slot auf die Tafel kam. */
  shownAt?: number
}

/** Freie Meldung auf der Tafel (Störung, Wartezeit, Begrüßung …). */
export interface BoardMessage {
  text: string
  kind: 'info' | 'stoerung' | 'pause'
  /** Wenn gesetzt: ab diesem Zeitpunkt (ms) verschwindet die Meldung von selbst. */
  until?: number
}

export interface Parcours {
  id: string
  /** Anzeigename, z. B. „Parcours 2 – See". */
  name: string
  /** Klassen, die auf diesem Parcours fahren. */
  classIds: ClassId[]
  wechselFaktor: WechselFaktor
  /**
   * Manuelle Spur-Anordnung (Klassen- und Pausen-Blöcke je Spur). Fehlt sie oder
   * passt sie nicht mehr zu den vorhandenen Klassen, wird automatisch verteilt.
   */
  tracks?: TrackItem[][]
}

export interface ParcoursRuntime {
  parcoursId: string
  /** Geplante Startfolge. Frei umsortierbar. */
  slots: StartSlot[]
  /** Slot-IDs in der Reihenfolge, in der sie tatsächlich auf der Tafel standen. */
  history: string[]
  /** Aktuelle Meldung; verdrängt die Starter-Anzeige, wenn `kind !== 'info'`. */
  message: BoardMessage | null
  /**
   * Bis einschließlich diesem Lauf ist der Start freigegeben.
   *
   * Läufe folgen nicht unmittelbar aufeinander: Lauf 2 ist üblicherweise am
   * Nachmittag, Lauf 3 am nächsten Tag. Ohne diese Grenze würde nach dem
   * letzten Starter von Lauf 1 sofort Lauf 2 auf der Tafel stehen. Der nächste
   * Lauf wird deshalb ausdrücklich freigegeben.
   *
   * Maßgeblich ist die **Lauf-Nummer**, nicht die Position: Ein Starter, dessen
   * Lauf 1 nach hinten vor den Beginn von Lauf 2 verschoben wurde, bleibt damit
   * freigegeben und taucht in der Liste für Lauf 2 an seiner Stelle auf.
   */
  releasedLauf: number
}

// ---------------------------------------------------------------------------
// Zeiten
// ---------------------------------------------------------------------------

/**
 * Gemessene bzw. vorkonfigurierte Startabstände je Klasse (in Sekunden).
 * `samples` zählt die Messungen, aus denen `avg` gemittelt wurde – bei 0 ist
 * `avg` ein reiner Vorgabewert aus einer früheren Veranstaltung.
 */
export interface ClassTiming {
  avg: number
  samples: number
}

export type TimingTable = Partial<Record<ClassId, ClassTiming>>

// ---------------------------------------------------------------------------
// Darstellung
// ---------------------------------------------------------------------------

export interface BoardConfig {
  /** Kopfzeile über beiden Parcours (Veranstaltungsname). Leer = ausgeblendet. */
  kopfzeile: string
  /** Logo als Data-URL; leer = kein Logo. */
  logoDataUrl: string
  /** Herkunft auf der Tafel: Verein oder Bundesland. */
  originMode: OriginMode
  /** „Starter davor" mit anzeigen. */
  showPrevious: boolean
  /**
   * Den Namen des Parcours auf der Tafel anzeigen. Bei zwei Parcours ist das
   * die Zuordnung, welcher Block zu welchem See-Bereich gehört; bei einem
   * Parcours mit Kopfzeile ist er oft überflüssig.
   */
  showParcoursName: boolean
  /** Vor- und Nachname anzeigen (sonst nur Nachname). */
  showVorname: boolean
  /** Feinjustage der Schriftgröße auf der Tafel (1 = Standard). */
  scale: number
}

// ---------------------------------------------------------------------------
// Pro-Version: Geräte und Rechte
// ---------------------------------------------------------------------------

/**
 * Rolle eines verbundenen Geräts.
 *
 * - `admin`  – darf alles (Starterliste, Konfiguration, Geräte)
 * - `steg`   – darf die ihm zugewiesenen Parcours weiterschalten und melden
 * - `board`  – reine Anzeige (Tafel-Fenster)
 * - `viewer` – reine Startlisten-Ansicht für Zuschauer
 */
export type Role = 'admin' | 'steg' | 'board' | 'viewer'

export interface DeviceGrant {
  deviceId: string
  /** Vom Stegpersonal vergebener bzw. vom Admin gesetzter Klarname. */
  name: string
  role: Role
  /**
   * Parcours, die dieses Gerät bedienen darf. Leer = keine. Für `admin`
   * bedeutungslos (darf immer alle).
   */
  parcoursIds: string[]
  /** Zeitpunkt der letzten Aktivität (ms), für die Geräteliste im Admin. */
  lastSeen: number
}

// ---------------------------------------------------------------------------
// Gesamtzustand
// ---------------------------------------------------------------------------

export interface AppState {
  /** Schema-Version für Migrationen. */
  version: 1
  eventName: string
  eventJahr: number
  /** Anzahl Läufe, die geplant werden (typisch 3). */
  laufCount: number
  /**
   * Beim Umsortieren der Startliste die Verzahnung erhalten: Wird ein Starter
   * verschoben, rutscht seine ganze Spur mit, damit nie zwei Starter derselben
   * Klasse hintereinander stehen. Abschaltbar, wenn eine Reihenfolge bewusst
   * genau so gewollt ist.
   */
  keepInterleave: boolean
  starters: Starter[]
  parcoursList: Parcours[]
  runtimes: ParcoursRuntime[]
  timings: TimingTable
  board: BoardConfig
  /** Erteilte Geräte-Berechtigungen (nur in der Pro-Version genutzt). */
  devices: DeviceGrant[]
  /** true, sobald das erste Setup abgeschlossen ist. */
  initialized: boolean
}
