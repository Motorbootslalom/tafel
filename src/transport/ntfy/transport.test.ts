import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import nacl from 'tweetnacl'
import { NtfyTransport, type NtfyTiming } from './transport'
import { createHostRoom, hostPublicOf, saveHostRoom, type HostRoom } from './room'
import { fromBase64Url, toBase64Url } from './codec'
import { openBroadcast, parseHostWire, sealBroadcast, sealFromDevice } from './wire'
import { envelope, type Envelope } from '../protocol'
import { initialState, reduce } from '../../state/reducer'
import { starters } from '../../lib/testing'
import type { AppState, DeviceGrant } from '../../types'

/**
 * Host und Geräte über einen nachgebauten ntfy-Server.
 *
 * Er verhält sich, wie der echte nachgemessen wurde: Beim Abonnieren kommt
 * zuerst ein `open`, danach nur noch Neues – nichts Altes. Was über 4096 Byte
 * geht, wird zum Anhang unter `/file/…`.
 */

const SERVER = 'https://ntfy.test'

interface Published {
  topic: string
  body: string
}

class FakeNtfy {
  sockets = new Set<FakeSocket>()
  published: Published[] = []
  files = new Map<string, string>()
  /** Statuscodes, die die nächsten Veröffentlichungen bekommen. */
  answers: number[] = []
  /** Nächste Nachricht an dieses Thema verschlucken (für dieses Gerät). */
  swallow: { topic: string; socket?: FakeSocket } | null = null
  private ids = 0

  publish(topic: string, body: string): number {
    const status = this.answers.shift() ?? 200
    if (status !== 200) return status
    this.published.push({ topic, body })
    const id = `m${++this.ids}`
    const event: Record<string, unknown> = { id, event: 'message', topic }
    if (body.length > 4096) {
      this.files.set(id, body)
      event.message = 'You received a file: attachment.txt'
      event.attachment = { name: 'attachment.txt', size: body.length, url: `${SERVER}/file/${id}.txt` }
    } else {
      event.message = body
    }
    const swallow = this.swallow && this.swallow.topic === topic ? this.swallow : null
    if (swallow) this.swallow = null
    for (const socket of this.sockets) {
      if (socket.topic !== topic) continue
      if (swallow && (!swallow.socket || swallow.socket === socket)) continue
      socket.push(JSON.stringify(event))
    }
    return 200
  }

  /** Was an ein Thema ging, ohne Anhänge aufzulösen. */
  bodies(topic: string): string[] {
    return this.published.filter((p) => p.topic === topic).map((p) => p.body)
  }
}

let ntfy: FakeNtfy

class FakeSocket {
  readyState = 0
  topic: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null

  constructor(readonly url: string) {
    const match = /^wss:\/\/ntfy\.test\/([A-Za-z0-9_-]+)\/ws$/.exec(url)
    if (!match) throw new Error(`unerwartete Adresse ${url}`)
    this.topic = match[1]
    ntfy.sockets.add(this)
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
      this.push(JSON.stringify({ event: 'open', topic: this.topic }))
    }, 0)
  }

  push(data: string): void {
    setTimeout(() => {
      if (this.readyState === 1) this.onmessage?.({ data })
    }, 0)
  }

  close(): void {
    this.readyState = 3
    ntfy.sockets.delete(this)
    setTimeout(() => this.onclose?.(), 0)
  }
}

async function fakeFetch(input: string, init?: { method?: string; body?: string }) {
  const url = String(input)
  if (init?.method === 'POST') {
    const topic = url.slice(SERVER.length + 1)
    const status = ntfy.publish(topic, init.body ?? '')
    return { ok: status >= 200 && status < 300, status, text: async () => '{}' }
  }
  const file = /\/file\/(m\d+)\.txt$/.exec(url)
  const body = file ? ntfy.files.get(file[1]) : undefined
  return body === undefined
    ? { ok: false, status: 404, text: async () => '' }
    : { ok: true, status: 200, text: async () => body }
}

const FAST: Partial<NtfyTiming> = {
  stateGapMs: 0,
  retryMs: [20],
  rateLimitMs: 30,
  reconnectMs: [10],
  stateRequestGapMs: 0,
}

async function until(condition: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('Zeit abgelaufen')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

function bigState(): AppState {
  const list = starters({ E: 20, '1': 20, '2': 20, '3': 18, '4': 20, '5': 18, '6': 18, '7': 16 })
  let state = initialState()
  state = reduce(state, { type: 'SET_EVENT', eventName: 'DM', eventJahr: 2026, laufCount: 3 })
  state = reduce(state, { type: 'IMPORT_STARTERS', starters: list, mode: 'replace' })
  return reduce(state, { type: 'GENERATE_ALL_STARTLISTS' })
}

const grant = (deviceId: string): DeviceGrant => ({
  deviceId,
  name: deviceId,
  role: 'steg',
  parcoursIds: ['par1'],
  lastSeen: 0,
})

/** Der Host mit dem, was der Store bei Anmeldung und Nachfrage täte. */
function startHost(room: HostRoom, timing: Partial<NtfyTiming> = FAST) {
  const host = new NtfyTransport('dev_host', { server: SERVER, topic: room.topic, isHost: true, timing })
  const got: Envelope[] = []
  let state = bigState()
  let approve = (_env: Envelope) => true
  host.onMessage((env) => {
    got.push(env)
    if (env.msg.kind === 'hello') {
      if (!approve(env)) {
        host.send({ kind: 'denied', reason: 'nein' }, env.from)
        return
      }
      host.send({ kind: 'welcome', grant: grant(env.from) }, env.from)
      host.send({ kind: 'state', state }, env.from)
    }
    if (env.msg.kind === 'request-state') host.send({ kind: 'state', state }, env.from)
  })
  return {
    host,
    got,
    get state() {
      return state
    },
    /** Eine Änderung beim Host – wie `relayEffects` im Store. */
    change(next: AppState) {
      state = next
      host.send({ kind: 'state', state: JSON.parse(JSON.stringify(state)) as AppState })
    },
    approveIf(rule: (env: Envelope) => boolean) {
      approve = rule
    },
  }
}

function startDevice(id: string, room: HostRoom) {
  const device = new NtfyTransport(id, {
    server: SERVER,
    topic: room.topic,
    hostPublic: hostPublicOf(room),
    isHost: false,
    timing: FAST,
  })
  const got: Envelope[] = []
  device.onMessage((env) => got.push(env))
  const states = () => got.filter((e) => e.msg.kind === 'state').map((e) => (e.msg as { state: AppState }).state)
  return { device, got, states, last: () => states()[states().length - 1] }
}

async function pairedDevice(id: string, room: HostRoom) {
  const d = startDevice(id, room)
  await d.device.start()
  d.device.send({ kind: 'hello', role: 'steg', name: id, token: 'CODE' })
  await until(() => d.states().length > 0)
  return d
}

describe('NtfyTransport', () => {
  let room: HostRoom

  beforeEach(() => {
    localStorage.clear()
    ntfy = new FakeNtfy()
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.stubGlobal('fetch', fakeFetch)
    room = createHostRoom()
    saveHostRoom(room)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('meldet ein Gerät an und hält es danach mit kleinen Änderungen aktuell', async () => {
    const h = startHost(room)
    await h.host.start()
    const d = await pairedDevice('dev_a', room)

    expect(d.got.map((e) => e.msg.kind)).toEqual(['welcome', 'state'])
    expect(d.last()).toEqual(h.state)
    // Die Anmeldung kam an, mit dem Hinweis, dass der Schlüssel neu ist.
    expect(h.got[0].msg.kind).toBe('hello')
    expect(h.got[0].keyUnknown).toBe(true)

    const before = ntfy.bodies(`${room.topic}-h`).length
    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_000_000 }))
    await until(() => d.states().length === 2)
    expect(d.last()).toEqual(h.state)

    // Die Änderung ging als eine kleine Nachricht, kein Anhang.
    const sent = ntfy.bodies(`${room.topic}-h`).slice(before)
    expect(sent).toHaveLength(1)
    expect(sent[0].length).toBeLessThan(4096)
  })

  it('wartet mit dem Senden, bis das Abo steht', async () => {
    const h = startHost(room)
    await h.host.start()
    const d = startDevice('dev_a', room)
    await d.device.start()
    // Sofort nach dem Start: Das Abo steht noch nicht, also ist nichts draußen.
    d.device.send({ kind: 'hello', role: 'steg', name: 'a', token: 'CODE' })
    expect(ntfy.bodies(`${room.topic}-g`)).toHaveLength(0)
    await until(() => d.states().length > 0)
  })

  it('erkennt ein freigeschaltetes Gerät beim Wiederkommen am Schlüssel', async () => {
    const h = startHost(room)
    await h.host.start()
    const d = await pairedDevice('dev_a', room)
    d.device.send({ kind: 'hello', role: 'steg', name: 'a', token: '' })
    await until(() => h.got.length === 2)
    expect(h.got[1].keyUnknown).toBeUndefined()
  })

  it('nimmt von einem nicht freigeschalteten Gerät nur die Anmeldung an', async () => {
    const h = startHost(room)
    h.approveIf(() => false)
    await h.host.start()
    const d = startDevice('dev_x', room)
    await d.device.start()
    d.device.send({ kind: 'action', action: { type: 'ADVANCE', parcoursId: 'par1', now: 1 } })
    d.device.send({ kind: 'hello', role: 'steg', name: 'x', token: 'FALSCH' })
    await until(() => d.got.some((e) => e.msg.kind === 'denied'))
    await settle()
    expect(h.got.map((e) => e.msg.kind)).toEqual(['hello'])
  })

  it('lässt ein fremdes Gerät nicht unter einer bekannten ID durch', async () => {
    const h = startHost(room)
    await h.host.start()
    const echt = await pairedDevice('dev_a', room)

    // Dieselbe ID, aber ein anderer Schlüssel: Der Host erfährt, dass er neu ist.
    localStorage.removeItem('tafel:ntfy:geraet:dev_a')
    h.approveIf((env) => !env.keyUnknown)
    const fremd = startDevice('dev_a', room)
    await fremd.device.start()
    fremd.device.send({ kind: 'action', action: { type: 'ADVANCE', parcoursId: 'par1', now: 1 } })
    fremd.device.send({ kind: 'hello', role: 'steg', name: 'a', token: '' })
    await until(() => h.got.length === 2)
    await settle()
    expect(h.got[1].msg.kind).toBe('hello')
    expect(h.got[1].keyUnknown).toBe(true)

    // Die Ablehnung trifft nur den Fremden – das echte Gerät bleibt drin.
    echt.got.length = 0
    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 2_000_000 }))
    await until(() => echt.states().length === 1)
    expect(echt.got.some((e) => e.msg.kind === 'denied')).toBe(false)
  })

  it('verwirft eine Nachricht an alle, die nicht vom Host signiert ist', async () => {
    const h = startHost(room)
    await h.host.start()
    const d = await pairedDevice('dev_a', room)
    const count = d.got.length

    // Ein Zuschauer kennt den Raumschlüssel, aber nicht den Signaturschlüssel.
    const forger = nacl.sign.keyPair()
    const forged = await sealBroadcast(
      { t: Date.now() + 10_000_000, env: envelope('dev_host', { kind: 'reload' }) },
      { epoch: room.epoch, roomKey: nacl.randomBytes(32), signSecret: forger.secretKey },
    )
    ntfy.publish(`${room.topic}-h`, forged)
    const stored = JSON.parse(localStorage.getItem(`tafel:ntfy:host:${room.topic}`)!) as HostRoom
    const withRoomKey = await sealBroadcast(
      { t: Date.now() + 10_000_000, env: envelope('dev_host', { kind: 'reload' }) },
      {
        epoch: stored.epoch,
        roomKey: fromBase64Url(stored.roomKey)!,
        signSecret: forger.secretKey,
      },
    )
    ntfy.publish(`${room.topic}-h`, withRoomKey)
    await settle()
    expect(d.got).toHaveLength(count)
  })

  it('verwirft wiederholte Nachrichten – in beide Richtungen', async () => {
    const h = startHost(room)
    await h.host.start()
    const d = await pairedDevice('dev_a', room)

    // Host → Gerät: eine Änderung noch einmal einspielen.
    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_000_000 }))
    await until(() => d.states().length === 2)
    const hostBodies = ntfy.bodies(`${room.topic}-h`)
    ntfy.publish(`${room.topic}-h`, hostBodies[hostBodies.length - 1])

    // Gerät → Host: eine Änderung noch einmal einspielen.
    d.device.send({ kind: 'action', action: { type: 'ADVANCE', parcoursId: 'par1', now: 5 } })
    await until(() => h.got.some((e) => e.msg.kind === 'action'))
    const deviceBodies = ntfy.bodies(`${room.topic}-g`)
    ntfy.publish(`${room.topic}-g`, deviceBodies[deviceBodies.length - 1])

    await settle()
    expect(d.states()).toHaveLength(2)
    expect(h.got.filter((e) => e.msg.kind === 'action')).toHaveLength(1)
  })

  it('wechselt beim Entzug den Raumschlüssel – das entzogene Gerät liest nicht mehr mit', async () => {
    const h = startHost(room)
    await h.host.start()
    const a = await pairedDevice('dev_a', room)
    const b = await pairedDevice('dev_b', room)

    // Ein manipuliertes Gerät hält sich nicht an den Entzug und hebt den
    // Raumschlüssel auf.
    const kept = JSON.parse(localStorage.getItem(`tafel:ntfy:raum:${room.topic}:dev_a`)!) as {
      roomKey: string
    }
    const keptKey = fromBase64Url(kept.roomKey)!

    h.host.send({ kind: 'revoked' }, 'dev_a')
    await until(() => a.got.some((e) => e.msg.kind === 'revoked'))

    const aBefore = a.states().length
    const bBefore = b.states().length
    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par2', now: 3_000_000 }))
    await until(() => b.states().length > bBefore)
    expect(b.last()).toEqual(h.state)
    await settle()
    expect(a.states()).toHaveLength(aBefore)

    // Auch mit dem aufgehobenen Schlüssel geht die neue Nachricht nicht auf.
    const latest = parseHostWire(ntfy.bodies(`${room.topic}-h`).at(-1)!)!
    expect(latest.to).toBeUndefined()
    expect(await openBroadcast(latest, keptKey)).toBeNull()

    // Und es kann auch nichts mehr bewirken.
    a.device.send({ kind: 'action', action: { type: 'ADVANCE', parcoursId: 'par1', now: 9 } })
    await settle()
    expect(h.got.some((e) => e.from === 'dev_a' && e.msg.kind === 'action')).toBe(false)
  })

  it('fordert bei einer Lücke den vollen Stand an', async () => {
    const h = startHost(room)
    await h.host.start()
    const d = await pairedDevice('dev_a', room)

    // Eine Änderung geht verloren …
    ntfy.swallow = { topic: `${room.topic}-h` }
    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_000_000 }))
    await settle()
    expect(d.states()).toHaveLength(1)

    // … die nächste passt nicht – das Gerät fragt nach und ist danach aktuell.
    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_060_000 }))
    await until(() => h.got.some((e) => e.msg.kind === 'request-state'))
    await until(() => JSON.stringify(d.last()) === JSON.stringify(h.state))

    // Und es geht danach mit kleinen Änderungen weiter.
    const count = d.states().length
    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_120_000 }))
    await until(() => d.states().length === count + 1)
    expect(d.last()).toEqual(h.state)
  })

  it('fasst schnelle Änderungen zusammen', async () => {
    const h = startHost(room, { ...FAST, stateGapMs: 300 })
    await h.host.start()
    const d = await pairedDevice('dev_a', room)

    const before = ntfy.bodies(`${room.topic}-h`).length
    let state = h.state
    for (let i = 0; i < 10; i++) {
      state = reduce(state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_000_000 + i * 1000 })
      h.change(state)
    }
    await until(() => JSON.stringify(d.last()) === JSON.stringify(state), 4000)
    expect(ntfy.bodies(`${room.topic}-h`).length - before).toBeLessThanOrEqual(3)
  })

  it('wartet bei „zu viele Anfragen" und schickt dann den neuesten Stand', async () => {
    const h = startHost(room)
    await h.host.start()
    const d = await pairedDevice('dev_a', room)

    ntfy.answers = [429, 429]
    const next = reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_000_000 })
    h.change(next)
    await until(() => JSON.stringify(d.last()) === JSON.stringify(next))
    expect(h.host.error.value).toBeNull()
  })

  it('holt einen großen Zustand als Anhang – aber nur vom eigenen Server', async () => {
    const h = startHost(room)
    h.change(reduce(h.state, { type: 'SET_BOARD', patch: { logoDataUrl: 'data:image/png;base64,' + 'Q'.repeat(30_000) } }))
    await h.host.start()
    const d = await pairedDevice('dev_a', room)
    expect(d.last().board.logoDataUrl).toHaveLength(30_022)
    expect(ntfy.files.size).toBeGreaterThan(0)

    // Ein Anhang, der woandershin zeigt, wird nicht geladen.
    const spy = vi.fn(fakeFetch)
    vi.stubGlobal('fetch', spy)
    const socket = [...ntfy.sockets].find((s) => s.topic === `${room.topic}-h`)!
    socket.push(
      JSON.stringify({ event: 'message', attachment: { url: 'https://boese.example/file/x.txt', size: 10 } }),
    )
    await settle()
    expect(spy.mock.calls.some(([url]) => String(url).includes('boese'))).toBe(false)
  })

  it('schickt die Bitte um Neuladen vor einem wartenden Zustand', async () => {
    const h = startHost(room, { ...FAST, stateGapMs: 500 })
    await h.host.start()
    const d = await pairedDevice('dev_a', room)

    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_000_000 }))
    h.change(reduce(h.state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_060_000 }))
    h.host.send({ kind: 'reload' })
    await until(() => d.got.some((e) => e.msg.kind === 'reload'), 400)
  })

  it('meldet, was fehlt, statt still nichts zu tun', async () => {
    const ohneRaum = new NtfyTransport('dev_host', { server: SERVER, topic: 'unbekannterRaum', isHost: true })
    await ohneRaum.start()
    expect(ohneRaum.status.value).toBe('error')
    expect(ohneRaum.error.value).toMatch(/neuen Raum/)

    const ohneSchluessel = new NtfyTransport('dev_a', { server: SERVER, topic: room.topic, isHost: false })
    await ohneSchluessel.start()
    expect(ohneSchluessel.error.value).toMatch(/QR-Code/)
  })

  it('verwirft eine Anmeldung, die nicht an diesen Host verschlüsselt ist', async () => {
    const h = startHost(room)
    await h.host.start()
    await until(() => h.host.status.value === 'connected')
    const device = nacl.box.keyPair()
    const otherHost = nacl.box.keyPair()
    const text = await sealFromDevice(
      { t: 1, env: envelope('dev_z', { kind: 'hello', role: 'steg', name: 'z', token: 'X' }) },
      'dev_z',
      device,
      otherHost.publicKey,
    )
    ntfy.publish(`${room.topic}-g`, text)
    // Absender und Umschlag passen nicht zusammen.
    const mismatch = await sealFromDevice(
      { t: 2, env: envelope('dev_y', { kind: 'hello', role: 'steg', name: 'y', token: 'X' }) },
      'dev_z',
      device,
      nacl.box.keyPair.fromSecretKey(fromBase64Url(room.boxSecret)!).publicKey,
    )
    ntfy.publish(`${room.topic}-g`, mismatch)
    await settle()
    expect(h.got).toHaveLength(0)
    expect(toBase64Url(device.publicKey)).toHaveLength(43)
  })
})
