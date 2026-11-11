import { windowId } from '../lib/ids'
import { LocalTransport } from './local'
import { SocketTransport, type SocketOptions } from './socket'
import { NtfyTransport } from './ntfy/transport'
import type { Transport, TransportKind } from './types'

export * from './types'
export * from './protocol'
export { LocalTransport } from './local'
export { SocketTransport } from './socket'
export { NtfyTransport } from './ntfy/transport'

export interface TransportConfig {
  kind: TransportKind
  /** Für `lan`/`cloud`: WebSocket-URL des Relais. Für `ntfy`: Adresse des Servers. */
  url?: string
  /** Für `ntfy`: das Thema des Raums. */
  room?: string
  hostKey?: string
  /**
   * Nur `ntfy`: die öffentlichen Schlüssel des Hosts. Ein Gerät bekommt sie aus
   * QR-Code oder Raum-Link; der Host trägt sie für eben diesen QR-Code mit.
   */
  hostPublic?: string
  isHost: boolean
}

const CONFIG_KEY = 'tafel:transport'

export function loadTransportConfig(): TransportConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TransportConfig
      const kinds: string[] = ['local', 'lan', 'ntfy', 'cloud']
      if (parsed && kinds.includes(parsed.kind)) {
        return parsed
      }
    }
  } catch {
    // Fällt unten auf die Basis-Version zurück.
  }
  return { kind: 'local', isHost: true }
}

export function saveTransportConfig(config: TransportConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // Ohne Persistenz gilt die Einstellung nur für diese Sitzung.
  }
}

/**
 * Erzeugt den zur Konfiguration passenden Transport.
 *
 * Wichtig ist die Absender-Kennung: Innerhalb eines Browsers spricht **Fenster
 * mit Fenster**, deshalb zählt dort die Fenster-ID. Über ein Relais spricht
 * dagegen **Gerät mit Gerät**, und die Rechte hängen an der Geräte-ID.
 */
export function createTransport(deviceId: string, config: TransportConfig): Transport {
  if (config.kind === 'local') return new LocalTransport(windowId())

  if (config.kind === 'ntfy') {
    return new NtfyTransport(deviceId, {
      server: config.url ?? '',
      topic: config.room ?? '',
      hostPublic: config.hostPublic,
      isHost: config.isHost,
    })
  }

  const options: SocketOptions = {
    url: config.url ?? '',
    room: config.room ?? 'default',
    hostKey: config.hostKey,
    isHost: config.isHost,
  }
  return new SocketTransport(config.kind, deviceId, options)
}
