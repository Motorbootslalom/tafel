import type { Ref } from 'vue'
import type { Envelope, Message } from './protocol'

/**
 * Wie Geräte miteinander sprechen.
 *
 * - `local` – zwei Fenster desselben Browsers (Basis-Version, kein Server)
 * - `lan`   – über das lokale Mini-Binary im WLAN/Hotspot am Wettkampfort
 * - `cloud` – über ein Relais im Internet, wenn die Geräte nicht im selben
 *             Netz hängen. An welchen Anbieter, entscheidet allein die Adresse.
 */
export type TransportKind = 'local' | 'lan' | 'cloud'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface Transport {
  readonly kind: TransportKind
  readonly status: Ref<ConnectionStatus>
  /** Letzter Fehler in Klartext, für die Statuszeile. */
  readonly error: Ref<string | null>
  /** Verbindung aufbauen. Mehrfachaufrufe sind unschädlich. */
  start(): Promise<void>
  stop(): void
  /** Nachricht senden; `to` adressiert ein einzelnes Gerät. */
  send(msg: Message, to?: string): void
  /** Empfangs-Handler registrieren; liefert die Abmeldefunktion. */
  onMessage(fn: (env: Envelope) => void): () => void
}

export const KIND_LABEL: Record<TransportKind, string> = {
  local: 'Dieser Rechner',
  lan: 'Lokales Netz',
  cloud: 'Internet (Cloud)',
}
