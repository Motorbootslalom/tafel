import { ref } from 'vue'
import { envelope, isEnvelope, type Envelope, type Message } from './protocol'
import type { ConnectionStatus, Transport } from './types'

const CHANNEL_NAME = 'tafel:bus'
const RELAY_KEY = 'tafel:bus:relay'
/** So viele Nachrichten-IDs merken wir uns, um Doppel-Zustellungen zu filtern. */
const SEEN_LIMIT = 200

/**
 * Verbindung zwischen zwei Fenstern desselben Rechners – ohne jeden Server.
 *
 * Drei Kanäle laufen parallel, weil keiner davon überall zuverlässig ist:
 *
 * 1. **BroadcastChannel** – der saubere Weg, funktioniert aber nicht, wenn die
 *    Seite als einzelne Datei über `file://` geöffnet wurde (die Fenster haben
 *    dann je nach Browser keine gemeinsame Herkunft).
 * 2. **localStorage-`storage`-Event** – greift auch dort, wo BroadcastChannel
 *    passt, ist aber auf gleiche Herkunft angewiesen.
 * 3. **`postMessage` über die Fenster-Referenz** – wenn das Tafel-Fenster per
 *    „Tafel öffnen" aus dem Admin-Fenster gestartet wurde, besteht eine direkte
 *    Verbindung, die selbst unter `file://` trägt.
 *
 * Jede Nachricht trägt eine ID; Mehrfachzustellungen werden verworfen.
 */
export class LocalTransport implements Transport {
  readonly kind = 'local' as const
  readonly status = ref<ConnectionStatus>('idle')
  readonly error = ref<string | null>(null)

  private channel: BroadcastChannel | null = null
  private handlers = new Set<(env: Envelope) => void>()
  private seen: string[] = []
  private seenSet = new Set<string>()
  private peers = new Set<Window>()
  private started = false

  private readonly onStorage = (ev: StorageEvent) => {
    if (ev.key !== RELAY_KEY || !ev.newValue) return
    this.receive(ev.newValue)
  }

  private readonly onWindowMessage = (ev: MessageEvent) => {
    const data = ev.data as { __tafel?: string } | undefined
    if (!data || typeof data.__tafel !== 'string') return
    // Gegenstelle für spätere Antworten merken.
    if (ev.source && ev.source !== window) this.peers.add(ev.source as Window)
    this.receive(data.__tafel)
  }

  constructor(private readonly deviceId: string) {}

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (ev) => this.receive(ev.data)
    } catch {
      // Ohne BroadcastChannel tragen die beiden anderen Kanäle.
      this.channel = null
    }

    window.addEventListener('storage', this.onStorage)
    window.addEventListener('message', this.onWindowMessage)

    // Öffnendes Fenster als Gegenstelle registrieren (Fall 3).
    if (window.opener && window.opener !== window) this.peers.add(window.opener as Window)

    this.status.value = 'connected'
  }

  stop(): void {
    this.started = false
    this.channel?.close()
    this.channel = null
    window.removeEventListener('storage', this.onStorage)
    window.removeEventListener('message', this.onWindowMessage)
    this.peers.clear()
    this.status.value = 'idle'
  }

  /**
   * Meldet ein per `window.open` gestartetes Fenster als Gegenstelle an – damit
   * die Verbindung auch unter `file://` steht.
   */
  addPeerWindow(win: Window): void {
    this.peers.add(win)
  }

  send(msg: Message, to?: string): void {
    const env = envelope(this.deviceId, msg, to)
    const payload = JSON.stringify(env)
    this.remember(env.id)

    try {
      this.channel?.postMessage(payload)
    } catch {
      // Kanal geschlossen – die anderen Wege bleiben.
    }

    try {
      // Der Schlüsselwechsel ist das Signal; der Inhalt wird direkt gelesen.
      localStorage.setItem(RELAY_KEY, payload)
    } catch {
      // Kein Speicher verfügbar.
    }

    for (const peer of [...this.peers]) {
      try {
        if (peer.closed) {
          this.peers.delete(peer)
          continue
        }
        peer.postMessage({ __tafel: payload }, '*')
      } catch {
        this.peers.delete(peer)
      }
    }
  }

  onMessage(fn: (env: Envelope) => void): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  private remember(id: string): void {
    this.seen.push(id)
    this.seenSet.add(id)
    while (this.seen.length > SEEN_LIMIT) {
      const dropped = this.seen.shift()
      if (dropped) this.seenSet.delete(dropped)
    }
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (!isEnvelope(parsed)) return
    if (parsed.from === this.deviceId) return
    if (this.seenSet.has(parsed.id)) return
    this.remember(parsed.id)

    for (const fn of this.handlers) fn(parsed)
  }
}
