import { windowId } from '../lib/ids'
import { LocalTransport } from './local'
import { SocketTransport, type SocketOptions } from './socket'
import type { Transport, TransportKind } from './types'

export * from './types'
export * from './protocol'
export { LocalTransport } from './local'
export { SocketTransport } from './socket'

export interface TransportConfig {
  kind: TransportKind
  /** Für `lan`/`cloud`: WebSocket-URL des Relais. */
  url?: string
  room?: string
  hostKey?: string
  isHost: boolean
}

const CONFIG_KEY = 'tafel:transport'

export function loadTransportConfig(): TransportConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TransportConfig
      if (parsed && (parsed.kind === 'local' || parsed.kind === 'lan' || parsed.kind === 'cloud')) {
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

  const options: SocketOptions = {
    url: config.url ?? '',
    room: config.room ?? 'default',
    hostKey: config.hostKey,
    isHost: config.isHost,
  }
  return new SocketTransport(config.kind, deviceId, options)
}
