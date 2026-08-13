import { ref } from 'vue'
import { envelope, isEnvelope, type Envelope, type Message } from './protocol'
import type { ConnectionStatus, Transport, TransportKind } from './types'

/** Abstände der Wiederverbindungsversuche (ms) – erst schnell, dann geduldig. */
const BACKOFF_MS = [500, 1000, 2000, 5000, 10000, 15000]
const PING_INTERVAL_MS = 25_000

export interface SocketOptions {
  /** WebSocket-URL des Relais, z. B. `ws://192.168.1.20:8080/ws`. */
  url: string
  /** Raum-/Veranstaltungs-Kennung, damit mehrere Wettkämpfe sich nicht stören. */
  room: string
  /** Nur der Host kennt diesen Schlüssel – er darf den Zustand verteilen. */
  hostKey?: string
  /** true, wenn dieses Gerät der Host ist. */
  isHost: boolean
}

/**
 * Transport über ein Relais – identisch für das lokale Mini-Binary (`lan`) und
 * für AWS API Gateway (`cloud`); nur die URL unterscheidet sich.
 *
 * Das Relais leitet ausschließlich weiter. Rechte prüft der Host, deshalb ist
 * das Relais auch dann unkritisch, wenn es in der Cloud steht.
 *
 * Bei Verbindungsabbruch – am See der Normalfall – wird mit wachsendem Abstand
 * neu verbunden und danach der Zustand neu angefordert.
 */
export class SocketTransport implements Transport {
  readonly status = ref<ConnectionStatus>('idle')
  readonly error = ref<string | null>(null)

  private socket: WebSocket | null = null
  private handlers = new Set<(env: Envelope) => void>()
  private queue: string[] = []
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private stopped = false

  constructor(
    readonly kind: Exclude<TransportKind, 'local'>,
    private readonly deviceId: string,
    private readonly options: SocketOptions,
  ) {}

  /** Vollständige Verbindungs-URL inklusive Raum und Rolle. */
  private connectUrl(): string {
    const url = new URL(this.options.url)
    url.searchParams.set('room', this.options.room)
    url.searchParams.set('device', this.deviceId)
    if (this.options.isHost) {
      url.searchParams.set('role', 'host')
      if (this.options.hostKey) url.searchParams.set('key', this.options.hostKey)
    }
    return url.toString()
  }

  async start(): Promise<void> {
    this.stopped = false
    this.open()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.reconnectTimer = null
    this.pingTimer = null
    this.socket?.close()
    this.socket = null
    this.status.value = 'idle'
  }

  private open(): void {
    if (this.stopped) return
    this.status.value = this.attempt === 0 ? 'connecting' : 'reconnecting'

    let socket: WebSocket
    try {
      socket = new WebSocket(this.connectUrl())
    } catch (err) {
      this.error.value = err instanceof Error ? err.message : 'Verbindung nicht möglich'
      this.status.value = 'error'
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.onopen = () => {
      this.attempt = 0
      this.error.value = null
      this.status.value = 'connected'
      for (const payload of this.queue.splice(0)) socket.send(payload)
      // Nach einem Reconnect kann der Zustand veraltet sein.
      this.send({ kind: 'request-state' })
      this.pingTimer = setInterval(() => this.send({ kind: 'ping' }), PING_INTERVAL_MS)
    }

    socket.onmessage = (ev) => this.receive(ev.data)

    socket.onerror = () => {
      this.error.value = 'Verbindung gestört'
    }

    socket.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = null
      this.socket = null
      if (this.stopped) return
      this.status.value = 'reconnecting'
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  send(msg: Message, to?: string): void {
    const payload = JSON.stringify(envelope(this.deviceId, msg, to))
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload)
      return
    }
    // Offline: Bedienbefehle nachreichen, sobald die Verbindung wieder steht.
    // Pings sind dann bedeutungslos.
    if (msg.kind !== 'ping') this.queue.push(payload)
  }

  onMessage(fn: (env: Envelope) => void): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
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
    for (const fn of this.handlers) fn(parsed)
  }
}
