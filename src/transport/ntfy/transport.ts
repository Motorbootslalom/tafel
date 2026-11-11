import { ref } from 'vue'
import nacl from 'tweetnacl'
import type { AppState } from '../../types'
import { envelope, type Envelope, type Message } from '../protocol'
import type { ConnectionStatus, Transport } from '../types'
import { canCompress, fingerprint, fromBase64Url, nextTick, toBase64Url } from './codec'
import { applyPatch, diff, equal, type Json } from './patch'
import {
  deviceKeys,
  isTopic,
  loadDeviceRoom,
  loadHostRoom,
  normalizeServer,
  parseHostPublic,
  saveDeviceRoom,
  saveHostRoom,
  topicsOf,
  type DeviceKeys,
  type DeviceRoom,
  type HostPublic,
  type HostRoom,
} from './room'
import {
  openBroadcast,
  openDirect,
  openFromDevice,
  parseDeviceWire,
  parseHostWire,
  sealBroadcast,
  sealDirect,
  sealFromDevice,
  verifyBroadcast,
  type FullState,
  type HostPlain,
  type StatePatch,
} from './wire'

/**
 * Transport über einen ntfy-Server – ohne eigenes Relais.
 *
 * Für den Store sieht er aus wie jeder andere Transport: Nachrichten gehen
 * hinaus, Umschläge kommen herein, mit der Geräte-ID des Absenders. Was das
 * Relais an Regeln durchsetzt, übernimmt hier die Kryptografie (siehe `wire.ts`):
 *
 * - Ein Gerät glaubt nur, was der Host signiert oder an seinen Schlüssel
 *   verschlüsselt hat.
 * - Der Host nimmt von einem Gerät nur dann mehr als eine Anmeldung an, wenn es
 *   mit dem Schlüssel spricht, mit dem es freigeschaltet wurde.
 * - Wer etwas Altes erneut einspielt, scheitert am Zeitstempel.
 *
 * Den Zustand verteilt der Host als **Änderung** gegenüber dem zuletzt
 * verteilten Stand, mit fortlaufender Nummer – der volle Zustand passt nie in
 * eine ntfy-Nachricht. Fehlt einem Gerät eine Nummer, fordert es den vollen
 * Stand an.
 */

export interface NtfyTiming {
  /** Mindestabstand zweier Zustands-Nachrichten; was dazwischen kommt, wird zusammengefasst. */
  stateGapMs: number
  /** Wartezeiten nach einem gescheiterten Senden. */
  retryMs: number[]
  /** Wartezeit nach „zu viele Anfragen" (429). */
  rateLimitMs: number
  /** Wiederverbinden nach einem Abbruch. */
  reconnectMs: number[]
  /** So lange ohne jedes Lebenszeichen von ntfy gilt die Verbindung als tot. */
  watchdogMs: number
  /** Mindestabstand, in dem ein Gerät den vollen Zustand nachfordert. */
  stateRequestGapMs: number
}

const DEFAULT_TIMING: NtfyTiming = {
  stateGapMs: 1000,
  retryMs: [1000, 2000, 5000, 10_000, 30_000],
  rateLimitMs: 5000,
  reconnectMs: [500, 1000, 2000, 5000, 10_000, 15_000],
  // ntfy schickt alle 45 Sekunden ein Lebenszeichen.
  watchdogMs: 100_000,
  stateRequestGapMs: 3000,
}

/** Wird eine Änderung größer als dieser Anteil des vollen Zustands, geht der volle. */
const PATCH_SHARE = 0.5
/** Anhänge, die größer sind, lädt niemand – das Logo ist auf 400 kB begrenzt. */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
/** So viele offene Anmeldungen merkt sich der Host höchstens. */
const MAX_PENDING = 64

export interface NtfyOptions {
  /** Adresse des ntfy-Servers, z. B. `https://ntfy.adminforge.de`. */
  server: string
  /** Thema des Raums. */
  topic: string
  /** Öffentliche Schlüssel des Hosts – für Geräte aus QR-Code oder Raum-Link. */
  hostPublic?: string
  isHost: boolean
  timing?: Partial<NtfyTiming>
}

type Job =
  | { type: 'state'; n: number; base: Baseline | null; state: Json; sending: boolean }
  | { type: 'broadcast'; env: Envelope; sending: boolean }
  | { type: 'direct'; to: string; key: string; env?: Envelope; full?: FullState; sending: boolean }
  | { type: 'device'; env: Envelope; sending: boolean }

interface Baseline {
  n: number
  state: Json
}

interface NtfyEvent {
  event?: string
  message?: unknown
  attachment?: { url?: unknown; size?: unknown }
}

type PostResult = 'ok' | 'retry' | 'limit' | 'drop'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export class NtfyTransport implements Transport {
  readonly kind = 'ntfy' as const
  readonly status = ref<ConnectionStatus>('idle')
  readonly error = ref<string | null>(null)

  private readonly server: string
  private readonly topics: { host: string; devices: string }
  private readonly timing: NtfyTiming
  private handlers = new Set<(env: Envelope) => void>()

  private socket: WebSocket | null = null
  private stopped = true
  /** Steht das Abo? Erst dann wird gesendet – sonst ginge die Antwort ins Leere. */
  private subscribed = false
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private watchdogTimer: ReturnType<typeof setInterval> | null = null
  private lastFrameAt = 0
  /** Eingehendes wird der Reihe nach verarbeitet – Entschlüsseln ist asynchron. */
  private inbox: Promise<void> = Promise.resolve()

  private outbox: Job[] = []
  private pumping = false
  private failures = 0
  private lastStateSentAt = 0
  private wake: (() => void) | null = null
  /** Laufende Wartezeiten – `stop()` beendet sie alle. */
  private sleepers = new Set<() => void>()
  /** Stammt die aktuelle Fehlermeldung vom Senden? Dann verschwindet sie beim nächsten Erfolg. */
  private publishError = false

  // --- Host ---
  private room: HostRoom | null = null
  private boxSecret: Uint8Array | null = null
  private signSecret: Uint8Array | null = null
  /** Schlüssel (und Zeitstempel), mit denen sich Geräte zuletzt angemeldet haben. */
  private pending = new Map<string, { key: string; t: number }>()
  /** Der zuletzt eingereihte Zustand – Grundlage der nächsten Änderung. */
  private head: Baseline | null = null

  // --- Gerät ---
  private keys: DeviceKeys | null = null
  private hostPublic: HostPublic | null = null
  private deviceRoom: DeviceRoom | null = null
  /** Der zuletzt vom Host übernommene Zustand – darauf beziehen sich seine Änderungen. */
  private baseline: Baseline | null = null
  private lastStateRequest = Number.NEGATIVE_INFINITY

  constructor(
    private readonly deviceId: string,
    private readonly options: NtfyOptions,
  ) {
    this.server = normalizeServer(options.server) ?? ''
    this.topics = topicsOf(options.topic)
    this.timing = { ...DEFAULT_TIMING, ...options.timing }
  }

  // -------------------------------------------------------------------------
  // Verbindung
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (!this.stopped) return
    const problem = this.prepare()
    if (problem) {
      this.error.value = problem
      this.status.value = 'error'
      return
    }
    this.stopped = false
    this.open()
  }

  stop(): void {
    this.stopped = true
    this.subscribed = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.watchdogTimer) clearInterval(this.watchdogTimer)
    this.reconnectTimer = null
    this.watchdogTimer = null
    for (const done of [...this.sleepers]) done()
    this.outbox = []
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.status.value = 'idle'
  }

  /** Lädt Raum und Schlüssel. Liefert den Grund, wenn es nicht geht. */
  private prepare(): string | null {
    if (!canCompress()) {
      return 'Dieser Browser ist für ntfy zu alt (ab Safari 16.4, Chrome 80, Firefox 113).'
    }
    if (!this.server) return 'Die Adresse des ntfy-Servers ist ungültig.'
    if (!isTopic(this.options.topic)) return 'Kein Raum eingetragen.'

    if (this.options.isHost) {
      const room = loadHostRoom(this.options.topic)
      if (!room) {
        return 'Die Schlüssel dieses Raums fehlen auf diesem Rechner – unter „Verbindung" einen neuen Raum anlegen.'
      }
      this.room = room
      this.boxSecret = fromBase64Url(room.boxSecret)
      this.signSecret = fromBase64Url(room.signSecret)
      return null
    }

    const hostPublic = parseHostPublic(this.options.hostPublic)
    if (!hostPublic) return 'Für ntfy braucht dieses Gerät den QR-Code oder den Raum-Link.'
    this.hostPublic = hostPublic
    this.keys = deviceKeys(this.deviceId)
    this.deviceRoom = loadDeviceRoom(this.options.topic, this.deviceId)
    return null
  }

  private open(): void {
    if (this.stopped) return
    this.status.value = this.attempt === 0 ? 'connecting' : 'reconnecting'

    // Der Host liest, was die Geräte schreiben – und umgekehrt.
    const topic = this.options.isHost ? this.topics.devices : this.topics.host
    let socket: WebSocket
    try {
      socket = new WebSocket(`${this.server.replace(/^http/, 'ws')}/${topic}/ws`)
    } catch (err) {
      this.error.value = err instanceof Error ? err.message : 'Verbindung zu ntfy nicht möglich'
      this.status.value = 'error'
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    this.lastFrameAt = Date.now()

    socket.onmessage = (ev: MessageEvent) => this.onFrame(ev.data)
    socket.onerror = () => {
      this.error.value = 'Verbindung zu ntfy gestört'
      this.publishError = false
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      this.subscribed = false
      if (this.watchdogTimer) clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
      if (this.stopped) return
      this.status.value = 'reconnecting'
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const steps = this.timing.reconnectMs
    const delay = steps[Math.min(this.attempt, steps.length - 1)]
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  /** ntfy meldet mit `open`, dass das Abo steht. */
  private onSubscribed(): void {
    this.subscribed = true
    this.attempt = 0
    this.error.value = null
    this.publishError = false
    this.status.value = 'connected'
    if (this.watchdogTimer) clearInterval(this.watchdogTimer)
    this.watchdogTimer = setInterval(() => {
      if (Date.now() - this.lastFrameAt > this.timing.watchdogMs) this.socket?.close()
    }, Math.max(1000, this.timing.watchdogMs / 4))
    this.kick()
  }

  private onFrame(raw: unknown): void {
    this.lastFrameAt = Date.now()
    if (typeof raw !== 'string') return
    let event: NtfyEvent
    try {
      event = JSON.parse(raw) as NtfyEvent
    } catch {
      return
    }
    if (!event || typeof event !== 'object') return
    if (event.event === 'open') {
      this.onSubscribed()
      return
    }
    if (event.event !== 'message') return
    this.inbox = this.inbox.then(() => this.receive(event)).catch(() => {})
  }

  onMessage(fn: (env: Envelope) => void): () => void {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  private deliver(env: Envelope): void {
    for (const fn of this.handlers) fn(env)
  }

  // -------------------------------------------------------------------------
  // Empfangen
  // -------------------------------------------------------------------------

  private async receive(event: NtfyEvent): Promise<void> {
    if (this.stopped) return
    // Über 4096 Byte legt ntfy die Nachricht als Anhang ab.
    const text = event.attachment
      ? await this.fetchAttachment(event.attachment)
      : typeof event.message === 'string'
        ? event.message
        : null
    if (text === null || this.stopped) return
    if (this.options.isHost) await this.receiveAsHost(text)
    else await this.receiveAsDevice(text)
  }

  /**
   * Anhänge nur vom eigenen Server. ntfy lässt Absender einen Anhang auch per
   * fremder Adresse angeben – die Geräte sollen nicht irgendwohin laden.
   */
  private async fetchAttachment(attachment: { url?: unknown; size?: unknown }): Promise<string | null> {
    const url = typeof attachment.url === 'string' ? attachment.url : ''
    if (!url.startsWith(`${this.server}/file/`)) return null
    if (typeof attachment.size === 'number' && attachment.size > MAX_ATTACHMENT_BYTES) return null
    try {
      const response = await fetch(url)
      return response.ok ? await response.text() : null
    } catch {
      return null
    }
  }

  private async receiveAsHost(text: string): Promise<void> {
    const room = this.room
    const wire = parseDeviceWire(text)
    if (!room || !this.boxSecret || !wire) return

    const plain = await openFromDevice(wire, this.boxSecret)
    if (!plain || plain.env.from !== wire.from) return

    const env: Envelope = { ...plain.env }
    delete env.keyUnknown
    delete env.to

    const bound = room.devices[wire.from]
    if (bound && bound.key === wire.pk) {
      // Ein freigeschaltetes Gerät mit seinem Schlüssel – nur nichts Altes.
      if (plain.t <= bound.seen) return
      bound.seen = plain.t
      this.saveRoom()
      if (env.msg.kind === 'hello') this.rememberPending(wire.from, wire.pk, plain.t)
      this.deliver(env)
      return
    }

    // Unbekannter Schlüssel: nur die Anmeldung, und die zählt nur mit Code.
    if (env.msg.kind !== 'hello') return
    this.rememberPending(wire.from, wire.pk, plain.t)
    this.deliver({ ...env, keyUnknown: true })
  }

  private rememberPending(deviceId: string, key: string, t: number): void {
    this.pending.delete(deviceId)
    this.pending.set(deviceId, { key, t })
    if (this.pending.size > MAX_PENDING) {
      const oldest = this.pending.keys().next().value
      if (oldest !== undefined) this.pending.delete(oldest)
    }
  }

  private async receiveAsDevice(text: string): Promise<void> {
    const room = this.deviceRoom
    const hostPublic = this.hostPublic
    const keys = this.keys
    const wire = parseHostWire(text)
    if (!room || !hostPublic || !keys || !wire) return

    let plain: HostPlain | null
    if (wire.to !== undefined) {
      if (wire.to !== this.deviceId) return
      plain = await openDirect(wire, hostPublic.box, keys.secretKey)
    } else {
      if (!verifyBroadcast(wire, hostPublic.sign)) return
      const roomKey = room.roomKey ? fromBase64Url(room.roomKey) : null
      if (!roomKey || wire.e !== room.epoch) {
        // Neuer Raumschlüssel, den dieses Gerät verpasst hat: Er kommt mit dem
        // vollen Zustand.
        if (roomKey && wire.e! > room.epoch) this.requestState()
        return
      }
      plain = await openBroadcast(wire, roomKey)
    }
    if (!plain || plain.t <= room.seen || this.stopped) return

    room.seen = plain.t
    if (plain.key && plain.key.e >= room.epoch) {
      room.epoch = plain.key.e
      room.roomKey = plain.key.k
    }
    const kind = plain.env?.msg.kind
    if (kind === 'revoked' || kind === 'denied') {
      room.roomKey = null
      this.baseline = null
    }
    saveDeviceRoom(this.options.topic, this.deviceId, room)

    if (plain.full) this.acceptFull(plain.full)
    else if (plain.patch) this.acceptPatch(plain.patch)
    if (plain.env) this.deliver(plain.env)
  }

  private acceptFull(full: FullState): void {
    this.baseline = { n: full.n, state: full.state as unknown as Json }
    this.deliverState(this.baseline.state)
  }

  private acceptPatch(patch: StatePatch): void {
    const base = this.baseline
    if (base && patch.n <= base.n) return
    if (!base || patch.base !== base.n) {
      this.requestState()
      return
    }
    let next: Json
    try {
      next = applyPatch(base.state, patch.ops)
    } catch {
      this.baseline = null
      this.requestState()
      return
    }
    // Der Fingerabdruck fängt alles ab, was beim Nachziehen schiefgehen könnte.
    if (fingerprint(next) !== patch.h) {
      this.baseline = null
      this.requestState()
      return
    }
    this.baseline = { n: patch.n, state: next }
    this.deliverState(next)
  }

  /** Der Store bekommt eine eigene Kopie – die Grundlage wird beim nächsten Mal verändert. */
  private deliverState(state: Json): void {
    this.deliver(envelope('host', { kind: 'state', state: clone(state) as unknown as AppState }))
  }

  private requestState(): void {
    if (!this.deviceRoom?.roomKey) return
    const now = Date.now()
    if (now - this.lastStateRequest < this.timing.stateRequestGapMs) return
    this.lastStateRequest = now
    this.sendAsDevice({ kind: 'request-state' })
  }

  // -------------------------------------------------------------------------
  // Senden
  // -------------------------------------------------------------------------

  send(msg: Message, to?: string): void {
    if (this.stopped) return
    if (this.options.isHost) this.sendAsHost(msg, to)
    else this.sendAsDevice(msg)
  }

  private sendAsDevice(msg: Message): void {
    if (!this.deviceRoom) return
    // Anmeldung und Bitte um den Zustand nur einmal in der Schlange – der Store
    // meldet sich nach jedem Verbinden an, und eine Antwort reicht.
    if (msg.kind === 'hello' || msg.kind === 'request-state') {
      const queued = this.outbox.find(
        (job) => job.type === 'device' && !job.sending && job.env.msg.kind === msg.kind,
      )
      if (queued && queued.type === 'device') {
        queued.env = envelope(this.deviceId, msg)
        return
      }
    }
    this.enqueue({ type: 'device', env: envelope(this.deviceId, msg), sending: false })
  }

  private sendAsHost(msg: Message, to?: string): void {
    const room = this.room
    if (!room) return

    if (to === undefined) {
      if (msg.kind === 'state') {
        this.queueState(msg.state as unknown as Json)
      } else if (msg.kind === 'reload') {
        // Das Fenster lädt sich gleich selbst neu – der Befehl darf nicht hinter
        // einem Zustand warten.
        this.enqueue({ type: 'broadcast', env: envelope(this.deviceId, msg), sending: false }, true)
      } else {
        this.enqueue({ type: 'broadcast', env: envelope(this.deviceId, msg), sending: false })
      }
      return
    }

    const bound = room.devices[to]?.key
    const request = this.pending.get(to)
    const pending = request?.key
    const env = envelope(this.deviceId, msg, to)

    switch (msg.kind) {
      case 'welcome': {
        const key = pending ?? bound
        if (!key) return
        this.pending.delete(to)
        // Ab der Anmeldung zählt der Zeitstempel – auch sie lässt sich so nicht
        // wiederholen.
        const seen = Math.max(key === bound ? room.devices[to].seen : 0, key === pending ? request!.t : 0)
        room.devices[to] = { key, seen }
        this.saveRoom()
        this.direct(to, key, { env })
        return
      }

      case 'denied': {
        const key = pending ?? bound
        if (!key) return
        this.pending.delete(to)
        this.direct(to, key, { env })
        // Galt die Ablehnung dem freigeschalteten Schlüssel selbst, ist das Gerät
        // draußen. Galt sie einem fremden Schlüssel unter derselben ID, bleibt
        // das echte Gerät, wie es ist.
        if (key === bound) this.unbind(to)
        return
      }

      case 'revoked': {
        const key = bound ?? pending
        if (!key) return
        this.pending.delete(to)
        this.direct(to, key, { env })
        if (bound) this.unbind(to)
        return
      }

      case 'state': {
        if (!bound) return
        const state = msg.state as unknown as Json
        if (!this.head) {
          // Eine Nummer vergeben, ohne an alle zu senden. Wer eine ältere hat,
          // bemerkt die Lücke bei der nächsten Änderung und fragt nach.
          room.counter += 1
          this.saveRoom()
          this.head = { n: room.counter, state }
        } else if (!equal(this.head.state, state)) {
          // Etwa ein neu freigeschaltetes Gerät: Erst erfahren es alle, dann
          // bekommt dieses den vollen Stand mit derselben Nummer.
          this.queueState(state)
        }
        this.direct(to, bound, { full: { n: this.head!.n, state: state as unknown as AppState } })
        return
      }

      default:
        if (bound) this.direct(to, bound, { env })
    }
  }

  /**
   * Einen Zustand an alle einreihen. Wartet der vorige noch in der Schlange,
   * wird er ersetzt – beim Umsortieren der Startliste ist jedes Ziehen eine
   * Änderung, und nur der letzte Stand zählt.
   */
  private queueState(state: Json): void {
    const room = this.room!
    if (this.head && equal(this.head.state, state)) return
    const last = this.outbox[this.outbox.length - 1]
    if (last && last.type === 'state' && !last.sending) {
      last.state = state
      this.head = { n: last.n, state }
      return
    }
    room.counter += 1
    this.saveRoom()
    this.enqueue({ type: 'state', n: room.counter, base: this.head, state, sending: false })
    this.head = { n: room.counter, state }
  }

  private direct(to: string, key: string, payload: { env?: Envelope; full?: FullState }): void {
    this.enqueue({ type: 'direct', to, key, ...payload, sending: false })
  }

  /**
   * Ein Gerät verliert die Freigabe. Es kennt den Raumschlüssel aber weiterhin –
   * deshalb gibt es einen neuen, und die übrigen Geräte bekommen ihn einzeln.
   * Er geht ihnen vor allem anderen zu, damit sie die nächste Nachricht an alle
   * schon lesen können.
   */
  private unbind(deviceId: string): void {
    const room = this.room!
    delete room.devices[deviceId]
    room.epoch += 1
    room.roomKey = toBase64Url(nacl.randomBytes(nacl.secretbox.keyLength))
    this.saveRoom()
    const keyJobs: Job[] = Object.entries(room.devices).map(([to, d]) => ({
      type: 'direct',
      to,
      key: d.key,
      sending: false,
    }))
    const at = this.outbox[0]?.sending ? 1 : 0
    this.outbox.splice(at, 0, ...keyJobs)
    this.kick()
  }

  private saveRoom(): void {
    if (this.room) saveHostRoom(this.room)
  }

  private enqueue(job: Job, urgent = false): void {
    if (urgent) {
      const at = this.outbox[0]?.sending ? 1 : 0
      this.outbox.splice(at, 0, job)
    } else {
      this.outbox.push(job)
    }
    this.kick()
  }

  // -------------------------------------------------------------------------
  // Die Schlange abarbeiten
  // -------------------------------------------------------------------------

  private kick(): void {
    if (this.pumping) {
      this.wake?.()
      return
    }
    void this.pump()
  }

  /**
   * Schickt eine Nachricht nach der anderen – die Reihenfolge ist Teil des
   * Protokolls: Änderungen bauen aufeinander auf, und die Zeitstempel müssen in
   * der Reihenfolge ankommen, in der sie vergeben wurden.
   */
  private async pump(): Promise<void> {
    this.pumping = true
    try {
      while (!this.stopped && this.subscribed && this.outbox.length > 0) {
        const job = this.outbox[0]

        if (job.type === 'state') {
          const wait = this.lastStateSentAt + this.timing.stateGapMs - Date.now()
          if (wait > 0) {
            // In dieser Zeit wird der Zustand noch ersetzt, wenn ein neuer kommt.
            await this.sleep(wait, true)
            continue
          }
        }

        job.sending = true
        let body: string | null
        try {
          body = await this.seal(job)
        } catch {
          body = null
        }
        if (this.stopped) return
        if (body === null) {
          this.outbox.shift()
          continue
        }

        const result = await this.post(this.options.isHost ? this.topics.host : this.topics.devices, body)
        if (this.stopped) return

        if (result === 'ok' || result === 'drop') {
          this.outbox.shift()
          this.failures = 0
          if (job.type === 'state') this.lastStateSentAt = Date.now()
          continue
        }

        job.sending = false
        const steps = this.timing.retryMs
        const delay = steps[Math.min(this.failures, steps.length - 1)]
        this.failures += 1
        await this.sleep(result === 'limit' ? Math.max(delay, this.timing.rateLimitMs) : delay, false)
      }
    } finally {
      this.pumping = false
    }
  }

  /** Warten; `wakeable` lässt sich von neuen Nachrichten unterbrechen. */
  private sleep(ms: number, wakeable: boolean): Promise<void> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined = undefined
      const done = (): void => {
        clearTimeout(timer)
        this.sleepers.delete(done)
        if (this.wake === done) this.wake = null
        resolve()
      }
      timer = setTimeout(done, ms)
      this.sleepers.add(done)
      if (wakeable) this.wake = done
    })
  }

  private async seal(job: Job): Promise<string | null> {
    if (job.type === 'device') {
      const room = this.deviceRoom!
      room.clock = nextTick(room.clock)
      saveDeviceRoom(this.options.topic, this.deviceId, room)
      return sealFromDevice({ t: room.clock, env: job.env }, this.deviceId, this.keys!, this.hostPublic!.box)
    }

    const room = this.room!
    room.clock = nextTick(room.clock)
    this.saveRoom()
    const t = room.clock
    const broadcastKeys = {
      epoch: room.epoch,
      roomKey: fromBase64Url(room.roomKey)!,
      signSecret: this.signSecret!,
    }

    if (job.type === 'broadcast') return sealBroadcast({ t, env: job.env }, broadcastKeys)
    if (job.type === 'state') return sealBroadcast({ t, ...this.statePayload(job) }, broadcastKeys)

    const devicePublic = fromBase64Url(job.key)
    if (!devicePublic || devicePublic.length !== nacl.box.publicKeyLength) return null
    const plain: HostPlain = { t }
    if (job.env) plain.env = job.env
    if (job.full) plain.full = job.full
    // Den Raumschlüssel bekommt nur, wer mit genau diesem Schlüssel freigeschaltet ist.
    if (room.devices[job.to]?.key === job.key) plain.key = { e: room.epoch, k: room.roomKey }
    return sealDirect(plain, job.to, devicePublic, this.boxSecret!)
  }

  private statePayload(job: Extract<Job, { type: 'state' }>): { full: FullState } | { patch: StatePatch } {
    const full = { full: { n: job.n, state: job.state as unknown as AppState } }
    if (!job.base) return full
    const ops = diff(job.base.state, job.state)
    if (JSON.stringify(ops).length > JSON.stringify(job.state).length * PATCH_SHARE) return full
    return { patch: { n: job.n, base: job.base.n, ops, h: fingerprint(job.state) } }
  }

  private async post(topic: string, body: string): Promise<PostResult> {
    try {
      const response = await fetch(`${this.server}/${topic}`, { method: 'POST', body })
      if (response.ok) {
        if (this.publishError) {
          this.error.value = null
          this.publishError = false
        }
        return 'ok'
      }
      if (response.status === 429) {
        this.reportPublishError('ntfy: zu viele Anfragen – der neueste Stand folgt gleich')
        return 'limit'
      }
      if (response.status >= 500 || response.status === 408) return 'retry'
      this.reportPublishError(`ntfy hat eine Nachricht abgelehnt (${response.status})`)
      return 'drop'
    } catch {
      return 'retry'
    }
  }

  private reportPublishError(text: string): void {
    this.error.value = text
    this.publishError = true
  }
}
