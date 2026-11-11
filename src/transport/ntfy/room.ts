import nacl from 'tweetnacl'
import { fromBase64Url, isBase64Url, toBase64Url } from './codec'

/**
 * Raum und Schlüssel für den Betrieb über ntfy.
 *
 * Der **Host** erzeugt einen Raum einmal und behält ihn: ein zufälliges Thema,
 * ein Schlüsselpaar zum Verschlüsseln (X25519), eines zum Signieren (Ed25519)
 * und den Raumschlüssel für alles, was an alle geht. Ein neuer Raum heißt: Alle
 * Geräte müssen neu angemeldet werden.
 *
 * Ein **Gerät** erzeugt sein eigenes Schlüsselpaar und merkt sich je Raum, was
 * es vom Host bekommen hat (Raumschlüssel) und gesehen hat (Zeitstempel).
 *
 * Alles liegt im localStorage. Mehrere Fenster des Bedienrechners teilen sich
 * damit denselben Raum; wer gerade die Verbindung hält, macht dort weiter, wo
 * das vorige Fenster aufgehört hat.
 */

/** Vorgabe – ntfy.sh erlaubt ohne Konto nur 250 Nachrichten je Tag und IP. */
export const DEFAULT_NTFY_SERVER = 'https://ntfy.adminforge.de'

/** Themen-Namen, wie ntfy sie annimmt. */
const TOPIC_PATTERN = /^[A-Za-z0-9_-]{8,48}$/

export function isTopic(value: unknown): value is string {
  return typeof value === 'string' && TOPIC_PATTERN.test(value)
}

/** Der Host schreibt in `-h`, die Geräte in `-g`. */
export function topicsOf(topic: string): { host: string; devices: string } {
  return { host: `${topic}-h`, devices: `${topic}-g` }
}

/** `https://ntfy.example.org/` → `https://ntfy.example.org`; `null`, wenn es keine https-Adresse ist. */
export function normalizeServer(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '')
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.search || url.hash) return null
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export interface BoundDevice {
  /** Öffentlicher Schlüssel, mit dem das Gerät freigeschaltet wurde. */
  key: string
  /** Zeitstempel der letzten angenommenen Nachricht – alles Ältere ist eine Wiederholung. */
  seen: number
}

export interface HostRoom {
  topic: string
  boxPublic: string
  boxSecret: string
  signPublic: string
  signSecret: string
  /** Zählt mit jedem Wechsel des Raumschlüssels hoch. */
  epoch: number
  roomKey: string
  /** Zuletzt vergebener Zeitstempel. */
  clock: number
  /** Nummer der zuletzt verteilten Zustands-Nachricht. */
  counter: number
  /** Freigeschaltete Geräte, gebunden an ihren Schlüssel. */
  devices: Record<string, BoundDevice>
}

const hostKey = (topic: string) => `tafel:ntfy:host:${topic}`

export function createHostRoom(): HostRoom {
  const box = nacl.box.keyPair()
  const sign = nacl.sign.keyPair()
  return {
    topic: toBase64Url(nacl.randomBytes(16)),
    boxPublic: toBase64Url(box.publicKey),
    boxSecret: toBase64Url(box.secretKey),
    signPublic: toBase64Url(sign.publicKey),
    signSecret: toBase64Url(sign.secretKey),
    epoch: 1,
    roomKey: toBase64Url(nacl.randomBytes(nacl.secretbox.keyLength)),
    clock: 0,
    counter: 0,
    devices: {},
  }
}

function isHostRoom(value: unknown): value is HostRoom {
  if (!value || typeof value !== 'object') return false
  const r = value as Partial<HostRoom>
  return (
    isTopic(r.topic) &&
    isBase64Url(r.boxPublic, 32) &&
    isBase64Url(r.boxSecret, 32) &&
    isBase64Url(r.signPublic, 32) &&
    isBase64Url(r.signSecret, 64) &&
    isBase64Url(r.roomKey, 32) &&
    typeof r.epoch === 'number' &&
    typeof r.clock === 'number' &&
    typeof r.counter === 'number' &&
    !!r.devices &&
    typeof r.devices === 'object'
  )
}

export function loadHostRoom(topic: string): HostRoom | null {
  try {
    const raw = localStorage.getItem(hostKey(topic))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isHostRoom(parsed) && parsed.topic === topic ? parsed : null
  } catch {
    return null
  }
}

export function saveHostRoom(room: HostRoom): void {
  try {
    localStorage.setItem(hostKey(room.topic), JSON.stringify(room))
  } catch {
    // Ohne Speicher gilt der Raum nur, solange dieses Fenster offen ist.
  }
}

/**
 * Die öffentlichen Schlüssel des Hosts in einem Stück – so stehen sie im
 * QR-Code und im Raum-Link. Nichts davon ist geheim.
 */
export function hostPublicOf(room: Pick<HostRoom, 'boxPublic' | 'signPublic'>): string {
  const box = fromBase64Url(room.boxPublic)!
  const sign = fromBase64Url(room.signPublic)!
  const both = new Uint8Array(64)
  both.set(box, 0)
  both.set(sign, 32)
  return toBase64Url(both)
}

export interface HostPublic {
  box: Uint8Array
  sign: Uint8Array
}

export function parseHostPublic(text: string | undefined | null): HostPublic | null {
  if (!isBase64Url(text, 64)) return null
  const bytes = fromBase64Url(text)
  if (!bytes || bytes.length !== 64) return null
  return { box: bytes.slice(0, 32), sign: bytes.slice(32) }
}

// ---------------------------------------------------------------------------
// Gerät
// ---------------------------------------------------------------------------

export interface DeviceKeys {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

const deviceKeysKey = (deviceId: string) => `tafel:ntfy:geraet:${deviceId}`

/**
 * Schlüsselpaar dieses Geräts – an die Geräte-ID gebunden. Geht der Speicher
 * verloren, gehen beide; das Gerät ist dann ein neues und braucht einen Code.
 */
export function deviceKeys(deviceId: string): DeviceKeys {
  try {
    const raw = localStorage.getItem(deviceKeysKey(deviceId))
    const secret = raw ? fromBase64Url(raw) : null
    if (secret && secret.length === 32) return nacl.box.keyPair.fromSecretKey(secret)
  } catch {
    // Unten neu erzeugen.
  }
  const pair = nacl.box.keyPair()
  try {
    localStorage.setItem(deviceKeysKey(deviceId), toBase64Url(pair.secretKey))
  } catch {
    // Ohne Speicher: neues Schlüsselpaar je Sitzung, also jedes Mal ein Code.
  }
  return pair
}

export interface DeviceRoom {
  /** Raumschlüssel vom Host; `null`, solange das Gerät nicht freigeschaltet ist. */
  epoch: number
  roomKey: string | null
  /** Zeitstempel der letzten angenommenen Nachricht des Hosts. */
  seen: number
  /** Zuletzt vergebener eigener Zeitstempel. */
  clock: number
}

const deviceRoomKey = (topic: string, deviceId: string) => `tafel:ntfy:raum:${topic}:${deviceId}`

export function loadDeviceRoom(topic: string, deviceId: string): DeviceRoom {
  try {
    const raw = localStorage.getItem(deviceRoomKey(topic, deviceId))
    const parsed = raw ? (JSON.parse(raw) as Partial<DeviceRoom>) : null
    if (
      parsed &&
      typeof parsed.epoch === 'number' &&
      typeof parsed.seen === 'number' &&
      typeof parsed.clock === 'number' &&
      (parsed.roomKey === null || isBase64Url(parsed.roomKey, 32))
    ) {
      return parsed as DeviceRoom
    }
  } catch {
    // Unten frisch anfangen.
  }
  return { epoch: 0, roomKey: null, seen: 0, clock: 0 }
}

export function saveDeviceRoom(topic: string, deviceId: string, room: DeviceRoom): void {
  try {
    localStorage.setItem(deviceRoomKey(topic, deviceId), JSON.stringify(room))
  } catch {
    // Ohne Speicher gilt das nur für diese Sitzung.
  }
}
