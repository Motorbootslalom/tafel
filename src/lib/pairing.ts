import type { Role } from '../types'

/**
 * Anmeldung mobiler Bediengeräte (Pro-Version).
 *
 * Zwei Wege, bewusst mit unterschiedlicher Lebensdauer:
 *
 * - **QR-Code**: wechselt alle 30 s. Wer den Bildschirm nicht sieht, kann mit
 *   einem abfotografierten Code nichts mehr anfangen. Beim Wechsel bleibt der
 *   vorherige Token kurz gültig, damit ein Scan im Moment der Rotation nicht ins
 *   Leere läuft.
 * - **Geräte-Code**: 6 Zeichen, 5 Minuten gültig – zum Vorlesen übers Funkgerät,
 *   wenn niemand am Tafelrechner steht.
 */

/**
 * Alphabet ohne verwechselbare Zeichen.
 *
 * Aus jedem klassischen Verwechslungspaar bleibt genau **die Ziffer** übrig, der
 * Buchstabe fliegt raus: O, I, L, Z, S und B kommen nicht vor – wohl aber 0, 1,
 * 2, 5 und 8. Genau darauf beruht die Nachsicht beim Eintippen: Wer „O" liest
 * und tippt, meinte zwangsläufig die 0, denn ein O kann es gar nicht sein. Wären
 * beide erlaubt, wäre diese Zuordnung nicht eindeutig.
 *
 * U entfällt zusätzlich, damit im Code keine unglücklichen Wörter entstehen.
 */
export const CODE_ALPHABET = '0123456789ACDEFGHJKMNPQRTVWXY'

/** Was Leute stattdessen tippen, wenn sie den Code ablesen. */
const CONFUSIONS: Record<string, string> = {
  I: '1',
  L: '1',
  O: '0',
  B: '8',
  S: '5',
  Z: '2',
  U: 'V',
}

export const DEVICE_CODE_LENGTH = 6
export const DEVICE_CODE_TTL_MS = 5 * 60 * 1000
export const QR_TOKEN_TTL_MS = 30 * 1000
/** Kulanzfenster, in dem der abgelöste QR-Token noch akzeptiert wird. */
export const QR_TOKEN_GRACE_MS = 10 * 1000

function randomChars(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

/** Erzeugt einen Geräte-Code aus {@link CODE_ALPHABET}. */
export function generateDeviceCode(): string {
  return randomChars(DEVICE_CODE_LENGTH, CODE_ALPHABET)
}

/** Erzeugt einen QR-Token (länger, weil er nicht getippt wird). */
export function generateQrToken(): string {
  return randomChars(16, CODE_ALPHABET)
}

/**
 * Bringt eine Eingabe auf die kanonische Form: Groß-/Kleinschreibung egal,
 * Leerzeichen und Bindestriche raus, typische Verwechslungen korrigiert.
 * Liefert `null`, wenn danach kein gültiger Code übrig bleibt.
 */
export function normalizeCode(raw: string, length = DEVICE_CODE_LENGTH): string | null {
  const cleaned = raw
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    .split('')
    .map((c) => CONFUSIONS[c] ?? c)
    .join('')

  if (cleaned.length !== length) return null
  for (const c of cleaned) if (!CODE_ALPHABET.includes(c)) return null
  return cleaned
}

/** Code in gut ablesbare Blöcke teilen: „A3F-K7M". */
export function formatCode(code: string): string {
  const half = Math.ceil(code.length / 2)
  return `${code.slice(0, half)}-${code.slice(half)}`
}

/**
 * Die Rechte, die ein Code mitbringt. Der Admin legt sie beim Ausgeben fest –
 * das Gerät kann sie nicht beeinflussen, es kennt nur den Code.
 */
export interface PairIntent {
  role: Role
  /** Parcours, die dieses Gerät bedienen darf (für `steg`). */
  parcoursIds: string[]
}

export interface Ticket {
  value: string
  expiresAt: number
  intent: PairIntent
}

export interface PairingState {
  /** Aktueller Geräte-Code (5 min) – `null`, solange keiner ausgegeben wurde. */
  deviceCode: Ticket | null
  /** Aktueller QR-Token (30 s). */
  qrToken: Ticket | null
  /** Zuletzt abgelöster QR-Token, noch im Kulanzfenster. */
  previousQrToken: Ticket | null
}

export function emptyPairing(): PairingState {
  return { deviceCode: null, qrToken: null, previousQrToken: null }
}

/** Gibt einen frischen Geräte-Code aus (der alte verfällt sofort). */
export function issueDeviceCode(
  state: PairingState,
  intent: PairIntent,
  now: number,
): PairingState {
  return {
    ...state,
    deviceCode: { value: generateDeviceCode(), expiresAt: now + DEVICE_CODE_TTL_MS, intent },
  }
}

export function revokeDeviceCode(state: PairingState): PairingState {
  return { ...state, deviceCode: null }
}

/**
 * Rotiert den QR-Token; der bisherige bleibt im Kulanzfenster gültig – mit den
 * Rechten, mit denen er ausgegeben wurde.
 */
export function rotateQrToken(state: PairingState, intent: PairIntent, now: number): PairingState {
  const previous = state.qrToken
    ? { ...state.qrToken, expiresAt: now + QR_TOKEN_GRACE_MS }
    : null
  return {
    ...state,
    previousQrToken: previous,
    qrToken: { value: generateQrToken(), expiresAt: now + QR_TOKEN_TTL_MS, intent },
  }
}

/** Beendet die Anmeldemöglichkeit vollständig. */
export function closePairing(): PairingState {
  return emptyPairing()
}

const alive = (t: Ticket | null, now: number): boolean => !!t && t.expiresAt > now

/**
 * Prüft eine Anmeldung und liefert die damit verbundenen Rechte. Akzeptiert den
 * getippten Geräte-Code ebenso wie einen gescannten QR-Token (auch den gerade
 * abgelösten, solange die Kulanz läuft). `null` heißt: abgelehnt.
 */
export function verifyPairing(state: PairingState, raw: string, now: number): PairIntent | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (alive(state.qrToken, now) && trimmed === state.qrToken!.value) return state.qrToken!.intent
  if (alive(state.previousQrToken, now) && trimmed === state.previousQrToken!.value) {
    return state.previousQrToken!.intent
  }

  const code = normalizeCode(trimmed)
  if (code && alive(state.deviceCode, now) && code === state.deviceCode!.value) {
    return state.deviceCode!.intent
  }
  return null
}

/** Verbleibende Sekunden eines Tickets (0, wenn abgelaufen). */
export function remainingSeconds(ticket: Ticket | null, now: number): number {
  if (!ticket) return 0
  return Math.max(0, Math.ceil((ticket.expiresAt - now) / 1000))
}
