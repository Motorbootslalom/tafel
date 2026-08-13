import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalTransport } from './local'
import { isEnvelope, type Envelope } from './protocol'

/**
 * Die Basis-Version verbindet zwei Fenster ohne jeden Server. Weil keiner der
 * drei Wege überall funktioniert, laufen sie parallel – und genau daraus
 * entsteht das Risiko, das hier geprüft wird: dieselbe Nachricht darf nicht
 * mehrfach ankommen, und die eigene darf nicht zurückkommen.
 */

function waitFor(fn: () => boolean, timeout = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (fn()) return resolve()
      if (Date.now() - started > timeout) return reject(new Error('Zeitüberschreitung'))
      setTimeout(tick, 5)
    }
    tick()
  })
}

describe('LocalTransport', () => {
  let a: LocalTransport
  let b: LocalTransport

  beforeEach(async () => {
    localStorage.clear()
    a = new LocalTransport('dev_a')
    b = new LocalTransport('dev_b')
    await a.start()
    await b.start()
  })

  afterEach(() => {
    a.stop()
    b.stop()
  })

  it('meldet sich nach dem Start als verbunden', () => {
    expect(a.status.value).toBe('connected')
  })

  it('stellt eine Nachricht beim anderen Fenster genau einmal zu', async () => {
    const received: Envelope[] = []
    b.onMessage((env) => received.push(env))

    a.send({ kind: 'request-state' })

    await waitFor(() => received.length > 0)
    // Kurz warten, ob über einen zweiten Weg dasselbe noch einmal ankommt.
    await new Promise((r) => setTimeout(r, 60))

    expect(received).toHaveLength(1)
    expect(received[0].from).toBe('dev_a')
    expect(received[0].msg.kind).toBe('request-state')
  })

  it('stellt die eigene Nachricht nicht sich selbst zu', async () => {
    const received: Envelope[] = []
    a.onMessage((env) => received.push(env))

    a.send({ kind: 'request-state' })
    await new Promise((r) => setTimeout(r, 80))

    expect(received).toHaveLength(0)
  })

  it('nimmt einen abgemeldeten Empfänger nicht mehr mit', async () => {
    const received: Envelope[] = []
    const off = b.onMessage((env) => received.push(env))
    off()

    a.send({ kind: 'request-state' })
    await new Promise((r) => setTimeout(r, 80))

    expect(received).toHaveLength(0)
  })

  it('erreicht ein per „Tafel öffnen" gestartetes Fenster direkt', async () => {
    // Unter file:// tragen weder BroadcastChannel noch localStorage zuverlässig –
    // dann bleibt die Fenster-Referenz der einzige Weg.
    const posted: unknown[] = []
    const peer = { closed: false, postMessage: (data: unknown) => posted.push(data) }
    a.addPeerWindow(peer as unknown as Window)

    a.send({ kind: 'ping' })

    expect(posted).toHaveLength(1)
    const payload = (posted[0] as { __tafel: string }).__tafel
    expect(isEnvelope(JSON.parse(payload))).toBe(true)
  })

  it('vergisst ein geschlossenes Fenster', () => {
    const peer = { closed: true, postMessage: vi.fn() }
    a.addPeerWindow(peer as unknown as Window)

    a.send({ kind: 'ping' })

    expect(peer.postMessage).not.toHaveBeenCalled()
  })

  it('verwirft alles, was nicht dem Protokoll entspricht', async () => {
    const received: Envelope[] = []
    b.onMessage((env) => received.push(env))

    // So etwas kann über einen offenen Kanal jederzeit hereinkommen.
    for (const junk of ['kein json', '{}', '{"v":99,"id":"x","from":"y","ts":0,"msg":{"kind":"a"}}']) {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'tafel:bus:relay', newValue: junk }),
      )
    }
    await new Promise((r) => setTimeout(r, 60))

    expect(received).toHaveLength(0)
  })
})
