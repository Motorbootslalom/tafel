import nacl from 'tweetnacl'
import type { AppState } from '../../types'
import { isEnvelope, type Envelope } from '../protocol'
import { fromBase64Url, isBase64Url, pack, toBase64Url, unpack, utf8 } from './codec'
import type { Op } from './patch'

/**
 * Was über ntfy geht – drei Arten von Nachrichten, alle als JSON-Text.
 *
 * | Art | Thema | Schutz |
 * | --- | --- | --- |
 * | Host an alle | `-h` | `secretbox` mit dem Raumschlüssel, dazu Ed25519-Signatur des Hosts |
 * | Host an ein Gerät | `-h` | `box` vom Host an den Schlüssel des Geräts |
 * | Gerät an Host | `-g` | `box` vom Gerät an den Schlüssel des Hosts |
 *
 * Die Signatur ist der Kern: Den Raumschlüssel kennen alle freigeschalteten
 * Geräte, auch Zuschauer. Verschlüsselt allein könnte also jedes von ihnen den
 * anderen eine Tafel unterschieben. Signieren kann nur der Host.
 *
 * `box` belegt dagegen beide Seiten: Öffnen lässt es sich nur mit dem Schlüssel
 * des Empfängers, und es geht nur auf, wenn es mit dem Schlüssel des genannten
 * Absenders gemacht wurde.
 *
 * Im verschlüsselten Teil steht immer ein streng steigender Zeitstempel `t` des
 * Absenders. Wer das Thema kennt, kann eine alte Nachricht erneut schicken – sie
 * ist dann gültig verschlüsselt und signiert, aber nicht neuer als das zuletzt
 * Gesehene.
 */

export const WIRE_VERSION = 1

/** Steht vor dem, was signiert wird – damit eine Signatur nirgends sonst passt. */
const SIGNATURE_CONTEXT = 'tafel-ntfy-1'

/** Vom Host: an alle (`e`, `s`) oder an ein Gerät (`to`). */
export interface HostWire {
  v: typeof WIRE_VERSION
  /** Raumschlüssel-Fassung (nur an alle). */
  e?: number
  /** Signatur (nur an alle). */
  s?: string
  /** Empfänger (nur gezielt). Geräte-IDs sind nicht geheim, sie stehen im Zustand. */
  to?: string
  /** Nonce. */
  n: string
  /** Chiffrat. */
  c: string
}

/** Von einem Gerät an den Host. */
export interface DeviceWire {
  v: typeof WIRE_VERSION
  from: string
  /** Öffentlicher Schlüssel des Geräts. */
  pk: string
  n: string
  c: string
}

/** Ein voller Zustand, mit der Nummer, auf die sich spätere Änderungen beziehen. */
export interface FullState {
  n: number
  state: AppState
}

/** Eine Änderung gegenüber Nummer `base`; `h` ist der Fingerabdruck des Ergebnisses. */
export interface StatePatch {
  n: number
  base: number
  ops: Op[]
  h: string
}

export interface RoomKey {
  e: number
  k: string
}

/** Klartext einer Host-Nachricht. */
export interface HostPlain {
  t: number
  /** Eine Nachricht der Anwendung – alles außer dem Zustand. */
  env?: Envelope
  full?: FullState
  patch?: StatePatch
  /** Aktueller Raumschlüssel – nur gezielt, nur an freigeschaltete Geräte. */
  key?: RoomKey
}

/** Klartext einer Geräte-Nachricht. */
export interface DevicePlain {
  t: number
  env: Envelope
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

// ---------------------------------------------------------------------------
// Einlesen
// ---------------------------------------------------------------------------

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function parseHostWire(text: string): HostWire | null {
  const w = parseJson(text)
  if (!w || w.v !== WIRE_VERSION) return null
  if (!isBase64Url(w.n, nacl.secretbox.nonceLength) || !isBase64Url(w.c)) return null
  if (w.to !== undefined) {
    if (!isId(w.to) || w.e !== undefined || w.s !== undefined) return null
    return { v: WIRE_VERSION, to: w.to, n: w.n, c: w.c }
  }
  if (!isCount(w.e) || !isBase64Url(w.s, nacl.sign.signatureLength)) return null
  return { v: WIRE_VERSION, e: w.e, s: w.s, n: w.n, c: w.c }
}

export function parseDeviceWire(text: string): DeviceWire | null {
  const w = parseJson(text)
  if (!w || w.v !== WIRE_VERSION) return null
  if (!isId(w.from) || !isBase64Url(w.pk, nacl.box.publicKeyLength)) return null
  if (!isBase64Url(w.n, nacl.box.nonceLength) || !isBase64Url(w.c)) return null
  return { v: WIRE_VERSION, from: w.from, pk: w.pk, n: w.n, c: w.c }
}

function isHostPlain(value: unknown): value is HostPlain {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<HostPlain>
  if (!isCount(p.t)) return false
  if (p.env !== undefined && (!isEnvelope(p.env) || p.env.msg.kind === 'state')) return false
  if (p.full !== undefined && (!isCount(p.full.n) || !p.full.state || typeof p.full.state !== 'object')) {
    return false
  }
  if (
    p.patch !== undefined &&
    (!isCount(p.patch.n) ||
      !isCount(p.patch.base) ||
      !Array.isArray(p.patch.ops) ||
      typeof p.patch.h !== 'string')
  ) {
    return false
  }
  if (p.key !== undefined && (!isCount(p.key.e) || !isBase64Url(p.key.k, nacl.secretbox.keyLength))) {
    return false
  }
  return true
}

function isDevicePlain(value: unknown): value is DevicePlain {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<DevicePlain>
  return isCount(p.t) && isEnvelope(p.env)
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

function signedText(e: number, n: string, c: string): Uint8Array {
  return utf8(`${SIGNATURE_CONTEXT}|${e}|${n}|${c}`)
}

/** An alle: mit dem Raumschlüssel verschlüsselt und signiert. */
export async function sealBroadcast(
  plain: HostPlain,
  room: { epoch: number; roomKey: Uint8Array; signSecret: Uint8Array },
): Promise<string> {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const n = toBase64Url(nonce)
  const c = toBase64Url(nacl.secretbox(await pack(plain), nonce, room.roomKey))
  const s = toBase64Url(nacl.sign.detached(signedText(room.epoch, n, c), room.signSecret))
  const wire: HostWire = { v: WIRE_VERSION, e: room.epoch, s, n, c }
  return JSON.stringify(wire)
}

/** An ein Gerät: nur dessen Schlüssel öffnet es. */
export async function sealDirect(
  plain: HostPlain,
  to: string,
  devicePublic: Uint8Array,
  hostBoxSecret: Uint8Array,
): Promise<string> {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const c = nacl.box(await pack(plain), nonce, devicePublic, hostBoxSecret)
  const wire: HostWire = { v: WIRE_VERSION, to, n: toBase64Url(nonce), c: toBase64Url(c) }
  return JSON.stringify(wire)
}

/** Stammt eine Nachricht an alle vom Host? Kostet kein Entschlüsseln. */
export function verifyBroadcast(wire: HostWire, signPublic: Uint8Array): boolean {
  if (wire.e === undefined || wire.s === undefined) return false
  const signature = fromBase64Url(wire.s)
  if (!signature) return false
  return nacl.sign.detached.verify(signedText(wire.e, wire.n, wire.c), signature, signPublic)
}

export async function openBroadcast(wire: HostWire, roomKey: Uint8Array): Promise<HostPlain | null> {
  const nonce = fromBase64Url(wire.n)
  const cipher = fromBase64Url(wire.c)
  if (!nonce || !cipher) return null
  const opened = nacl.secretbox.open(cipher, nonce, roomKey)
  if (!opened) return null
  const plain = await unpack(opened)
  return isHostPlain(plain) && plain.key === undefined ? plain : null
}

export async function openDirect(
  wire: HostWire,
  hostBoxPublic: Uint8Array,
  deviceSecret: Uint8Array,
): Promise<HostPlain | null> {
  const nonce = fromBase64Url(wire.n)
  const cipher = fromBase64Url(wire.c)
  if (!nonce || !cipher) return null
  const opened = nacl.box.open(cipher, nonce, hostBoxPublic, deviceSecret)
  if (!opened) return null
  const plain = await unpack(opened)
  return isHostPlain(plain) ? plain : null
}

// ---------------------------------------------------------------------------
// Gerät
// ---------------------------------------------------------------------------

export async function sealFromDevice(
  plain: DevicePlain,
  from: string,
  device: { publicKey: Uint8Array; secretKey: Uint8Array },
  hostBoxPublic: Uint8Array,
): Promise<string> {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const c = nacl.box(await pack(plain), nonce, hostBoxPublic, device.secretKey)
  const wire: DeviceWire = {
    v: WIRE_VERSION,
    from,
    pk: toBase64Url(device.publicKey),
    n: toBase64Url(nonce),
    c: toBase64Url(c),
  }
  return JSON.stringify(wire)
}

/**
 * Öffnet eine Nachricht eines Geräts. Geht sie auf, stammt sie nachweislich vom
 * Inhaber des genannten Schlüssels `pk` – ob der Host diesen Schlüssel kennt,
 * entscheidet der Aufrufer.
 */
export async function openFromDevice(
  wire: DeviceWire,
  hostBoxSecret: Uint8Array,
): Promise<DevicePlain | null> {
  const nonce = fromBase64Url(wire.n)
  const cipher = fromBase64Url(wire.c)
  const pk = fromBase64Url(wire.pk)
  if (!nonce || !cipher || !pk) return null
  const opened = nacl.box.open(cipher, nonce, pk, hostBoxSecret)
  if (!opened) return null
  const plain = await unpack(opened)
  return isDevicePlain(plain) ? plain : null
}
