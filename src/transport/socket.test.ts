import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SocketTransport } from './socket'
import { envelope, type Envelope } from './protocol'

/**
 * Am See reißt die Verbindung ab – das ist der Normalfall, nicht die Ausnahme.
 * Geprüft wird deshalb vor allem, was dann passiert: Wird neu verbunden, gehen
 * Bedienbefehle verloren, und wird nach dem Beenden Ruhe gegeben?
 */

const OPEN = 1
const CLOSED = 3

/** Ein WebSocket, den der Test von Hand öffnet, schließt und beliefert. */
class FakeSocket {
  static instances: FakeSocket[] = []
  static OPEN = OPEN

  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(): void {
    this.readyState = CLOSED
    this.onclose?.()
  }

  // --- Steuerung aus dem Test ---
  open(): void {
    this.readyState = OPEN
    this.onopen?.()
  }

  drop(): void {
    this.readyState = CLOSED
    this.onclose?.()
  }

  deliver(env: Envelope): void {
    this.onmessage?.({ data: JSON.stringify(env) })
  }

  deliverRaw(data: unknown): void {
    this.onmessage?.({ data } as { data: string })
  }

  /** Die Nachrichten-Arten, die über diese Verbindung gingen. */
  kinds(): string[] {
    return this.sent.map((s) => (JSON.parse(s) as Envelope).msg.kind)
  }
}

const options = { url: 'ws://192.168.1.20:8080/ws', room: 'see', hostKey: 'GEHEIM', isHost: true }

function make(isHost = true) {
  return new SocketTransport('lan', 'dev_me', { ...options, isHost })
}

const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1]

describe('SocketTransport', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('nimmt Raum, Gerät und Host-Schlüssel in die Adresse auf', async () => {
    const t = make()
    await t.start()

    const url = new URL(latest().url)
    expect(url.searchParams.get('room')).toBe('see')
    expect(url.searchParams.get('device')).toBe('dev_me')
    expect(url.searchParams.get('role')).toBe('host')
    expect(url.searchParams.get('key')).toBe('GEHEIM')
    t.stop()
  })

  it('verrät den Host-Schlüssel nicht, wenn das Gerät kein Host ist', async () => {
    const t = make(false)
    await t.start()

    const url = new URL(latest().url)
    expect(url.searchParams.get('key')).toBeNull()
    expect(url.searchParams.get('role')).toBeNull()
    t.stop()
  })

  it('fordert nach dem Verbinden den aktuellen Zustand an', async () => {
    const t = make()
    await t.start()
    latest().open()

    expect(t.status.value).toBe('connected')
    expect(latest().kinds()).toContain('request-state')
    t.stop()
  })

  it('hält Bedienbefehle zurück und reicht sie beim Verbinden nach', async () => {
    const t = make()
    await t.start()

    // Noch nicht verbunden – der Befehl darf nicht verloren gehen.
    t.send({ kind: 'action', action: { type: 'UNDO', parcoursId: 'p1' } })
    expect(latest().sent).toHaveLength(0)

    latest().open()
    expect(latest().kinds()).toContain('action')
    t.stop()
  })

  it('sammelt keine Lebenszeichen an, während die Verbindung fehlt', async () => {
    const t = make()
    await t.start()

    t.send({ kind: 'ping' })
    latest().open()

    expect(latest().kinds()).not.toContain('ping')
    t.stop()
  })

  it('verbindet nach einem Abbruch mit wachsendem Abstand neu', async () => {
    const t = make()
    await t.start()
    latest().open()
    expect(FakeSocket.instances).toHaveLength(1)

    latest().drop()
    expect(t.status.value).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(500)
    expect(FakeSocket.instances).toHaveLength(2)

    // Zweiter Versuch scheitert ebenfalls – der Abstand wächst.
    latest().drop()
    await vi.advanceTimersByTimeAsync(500)
    expect(FakeSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(500)
    expect(FakeSocket.instances).toHaveLength(3)

    t.stop()
  })

  it('fordert nach dem Wiederverbinden den Zustand erneut an', async () => {
    const t = make()
    await t.start()
    latest().open()
    latest().drop()

    await vi.advanceTimersByTimeAsync(500)
    latest().open()

    expect(latest().kinds()).toContain('request-state')
    t.stop()
  })

  it('gibt nach dem Beenden Ruhe', async () => {
    const t = make()
    await t.start()
    latest().open()

    t.stop()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(FakeSocket.instances).toHaveLength(1)
    expect(t.status.value).toBe('idle')
  })

  it('reicht empfangene Nachrichten an die Anwendung weiter', async () => {
    const t = make()
    const received: Envelope[] = []
    t.onMessage((env) => received.push(env))
    await t.start()
    latest().open()

    latest().deliver(envelope('dev_phone', { kind: 'request-state' }))

    expect(received).toHaveLength(1)
    expect(received[0].from).toBe('dev_phone')
    t.stop()
  })

  it('verwirft die eigene Nachricht und alles Protokollfremde', async () => {
    const t = make()
    const received: Envelope[] = []
    t.onMessage((env) => received.push(env))
    await t.start()
    latest().open()

    latest().deliver(envelope('dev_me', { kind: 'request-state' }))
    latest().deliverRaw('kein json')
    latest().deliverRaw('{}')
    latest().deliverRaw(42)
    latest().deliverRaw(JSON.stringify({ v: 99, id: 'a', from: 'b', ts: 0, msg: { kind: 'x' } }))

    expect(received).toHaveLength(0)
    t.stop()
  })
})
