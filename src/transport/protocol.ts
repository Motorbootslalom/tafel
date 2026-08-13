import type { AppState, DeviceGrant, Role } from '../types'
import type { Action } from '../state/actions'
import type { PairingState } from '../lib/pairing'
import type { ConnectionStatus as RelayStatus } from './types'
import { uid } from '../lib/ids'

/**
 * Draht-Protokoll zwischen Host (der Rechner an der Tafel) und Clients
 * (Tafel-Fenster, Handys am Steg, Zuschauer-Ansicht).
 *
 * Bewusst simpel gehalten: Der **Host** ist die einzige Wahrheit. Clients
 * schicken Actions, der Host prüft die Rechte, wendet sie an und sendet den
 * neuen Gesamtzustand zurück. Ein Relais (lokales Binary oder AWS) leitet nur
 * weiter und kennt den Inhalt nicht.
 */

export const PROTOCOL_VERSION = 1

export type Message =
  /** Client meldet sich an – mit Geräte-Code oder gescanntem QR-Token. */
  | { kind: 'hello'; role: Role; name: string; token: string }
  /** Host bestätigt die Anmeldung und teilt die erteilten Rechte mit. */
  | { kind: 'welcome'; grant: DeviceGrant }
  /** Host lehnt ab (falscher/abgelaufener Code). */
  | { kind: 'denied'; reason: string }
  /** Host verteilt den aktuellen Gesamtzustand. */
  | { kind: 'state'; state: AppState }
  /** Client möchte eine Änderung – der Host entscheidet. */
  | { kind: 'action'; action: Action }
  /** Client bittet um den aktuellen Zustand (nach Reconnect). */
  | { kind: 'request-state' }
  /** Host zieht Rechte zurück; der Client fällt auf „nur ansehen" zurück. */
  | { kind: 'revoked' }
  /**
   * Ausgegebene Anmelde-Codes zwischen den Fenstern dieses Browsers abgleichen.
   *
   * Der Code wird im Verwaltungsfenster ausgegeben, die Verbindung zum Relais
   * hält aber möglicherweise ein anderes Fenster. Ohne diesen Abgleich könnte es
   * einen Code nicht prüfen, den es nie gesehen hat. Diese Nachricht geht
   * ausschließlich über den Kanal im Browser, nie über ein Relais.
   */
  | { kind: 'pairing'; pairing: PairingState }
  /**
   * Das Fenster mit der Relais-Verbindung meldet den Fenstern ohne Verbindung,
   * wie es um sie steht. Ohne das stünde in der Verwaltung „nicht verbunden",
   * obwohl die Handys längst erreichbar sind – und niemand wüsste, warum.
   * Geht nur über den Kanal im Browser.
   */
  | { kind: 'relay-status'; status: RelayStatus }
  /** Lebenszeichen, damit Relais die Verbindung nicht abräumen. */
  | { kind: 'ping' }

export interface Envelope {
  v: typeof PROTOCOL_VERSION
  /** Nachrichten-ID – die Basis-Version empfängt über mehrere Kanäle parallel. */
  id: string
  /** Absender-Geräte-ID. */
  from: string
  /** Empfänger-Geräte-ID; fehlt = an alle. */
  to?: string
  ts: number
  msg: Message
}

export function envelope(from: string, msg: Message, to?: string): Envelope {
  return { v: PROTOCOL_VERSION, id: uid('m'), from, ts: Date.now(), msg, ...(to ? { to } : {}) }
}

/**
 * Prüft eine empfangene Nachricht, bevor sie in den Store läuft. Über einen
 * offenen Kanal (BroadcastChannel, WebSocket) kann alles Mögliche ankommen.
 */
export function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object') return false
  const e = value as Partial<Envelope>
  if (e.v !== PROTOCOL_VERSION) return false
  if (typeof e.id !== 'string' || typeof e.from !== 'string' || typeof e.ts !== 'number') return false
  if (e.to !== undefined && typeof e.to !== 'string') return false
  if (!e.msg || typeof e.msg !== 'object' || typeof (e.msg as Message).kind !== 'string') return false
  return true
}

/** Ist die Nachricht für mich bestimmt? (Ohne `to` gilt sie für alle.) */
export function isForMe(env: Envelope, myDeviceId: string): boolean {
  return env.to === undefined || env.to === myDeviceId
}
