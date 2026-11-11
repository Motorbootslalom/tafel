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
 * - **Geräte-Code**: 6 Zeichen, 5 Minuten gültig und nur für **ein** Gerät – zum
 *   Vorlesen übers Funkgerät, wenn niemand am Tafelrechner steht. Hört jemand
 *   mit und ist schneller, scheitert das richtige Handy sofort, und das fremde
 *   steht in der Geräteliste – statt dass beide unbemerkt hineinkommen.
 * - **Dauercode**: für reine Anzeigen (Zuschauer, Tafel), mehrfach nutzbar und
 *   ohne Ablauf, bis er beendet wird – zum Aushängen oder Verschicken. Für
 *   Rollen, die etwas bedienen, gibt es ihn bewusst nicht: Er wäre eine
 *   dauerhaft offene Tür, sobald ihn jemand mithört.
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
  /** Nur Geräte-Code: Zeitpunkt, zu dem ein Gerät ihn benutzt hat. */
  usedAt?: number
}

/** Ein Dauercode: mehrfach nutzbar, ohne Ablauf – nur für reine Anzeigen. */
export interface PermanentCode {
  value: string
  intent: PairIntent
  issuedAt: number
}

export interface PairingState {
  /** Aktueller Geräte-Code (5 min, ein Gerät) – `null`, solange keiner ausgegeben wurde. */
  deviceCode: Ticket | null
  /** Aktueller QR-Token (30 s). */
  qrToken: Ticket | null
  /** Zuletzt abgelöster QR-Token, noch im Kulanzfenster. */
  previousQrToken: Ticket | null
  /** Dauercode – unabhängig von den Einmal-Codes, bis er beendet wird. */
  permanentCode: PermanentCode | null
}

export function emptyPairing(): PairingState {
  return { deviceCode: null, qrToken: null, previousQrToken: null, permanentCode: null }
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

/** Der Geräte-Code hat ein Gerät angemeldet – für ein weiteres gilt er nicht. */
export function markDeviceCodeUsed(state: PairingState, now: number): PairingState {
  if (!state.deviceCode || state.deviceCode.usedAt) return state
  return { ...state, deviceCode: { ...state.deviceCode, usedAt: now } }
}

/**
 * Übernimmt den Stand eines anderen Fensters. Ein hier schon verbrauchter
 * Geräte-Code bleibt verbraucht, auch wenn das andere Fenster ihn noch als frisch
 * kennt – etwa weil es gerade den QR-Code weitergedreht hat, bevor die Nachricht
 * vom Verbrauch ankam.
 */
export function mergePairing(local: PairingState, incoming: PairingState): PairingState {
  const used = local.deviceCode?.usedAt
  const code = incoming.deviceCode
  if (used && code && !code.usedAt && code.value === local.deviceCode!.value) {
    return { ...incoming, deviceCode: { ...code, usedAt: used } }
  }
  return incoming
}

/** Rollen, für die es einen Dauercode gibt: solche, die nichts bedienen. */
export const PERMANENT_CODE_ROLES: readonly Role[] = ['viewer', 'board']

export function permanentCodeAllowed(role: Role): boolean {
  return PERMANENT_CODE_ROLES.includes(role)
}

/** Gibt einen Dauercode aus; ein bisheriger verfällt damit. */
export function issuePermanentCode(
  state: PairingState,
  intent: PairIntent,
  now: number,
): PairingState {
  if (!permanentCodeAllowed(intent.role)) {
    throw new Error(`Kein Dauercode für die Rolle „${intent.role}“`)
  }
  let value = generateDeviceCode()
  // Nicht mit dem laufenden Einmal-Code verwechselbar machen.
  while (value === state.deviceCode?.value) value = generateDeviceCode()
  return { ...state, permanentCode: { value, intent, issuedAt: now } }
}

export function endPermanentCode(state: PairingState): PairingState {
  return { ...state, permanentCode: null }
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

const alive = (t: Ticket | null, now: number): boolean => !!t && !t.usedAt && t.expiresAt > now

/** Womit sich ein Gerät angemeldet hat. */
export type PairingVia = 'qr' | 'code' | 'permanent'

export interface PairingMatch {
  intent: PairIntent
  via: PairingVia
}

/**
 * Prüft eine Anmeldung und sagt, welcher Weg gegriffen hat. Akzeptiert den
 * getippten Geräte-Code ebenso wie einen gescannten QR-Token (auch den gerade
 * abgelösten, solange die Kulanz läuft) und den Dauercode. `null` heißt:
 * abgelehnt.
 */
export function matchPairing(state: PairingState, raw: string, now: number): PairingMatch | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (alive(state.qrToken, now) && trimmed === state.qrToken!.value) {
    return { intent: state.qrToken!.intent, via: 'qr' }
  }
  if (alive(state.previousQrToken, now) && trimmed === state.previousQrToken!.value) {
    return { intent: state.previousQrToken!.intent, via: 'qr' }
  }

  const code = normalizeCode(trimmed)
  if (!code) return null
  if (alive(state.deviceCode, now) && code === state.deviceCode!.value) {
    return { intent: state.deviceCode!.intent, via: 'code' }
  }
  const permanent = state.permanentCode
  // Die Rolle noch einmal prüfen: Ein Dauercode mit Bedienrechten darf auch
  // dann nichts freischalten, wenn er irgendwie in den Zustand gelangt ist.
  if (permanent && code === permanent.value && permanentCodeAllowed(permanent.intent.role)) {
    return { intent: permanent.intent, via: 'permanent' }
  }
  return null
}

/** Wie {@link matchPairing}, nur die Rechte. */
export function verifyPairing(state: PairingState, raw: string, now: number): PairIntent | null {
  return matchPairing(state, raw, now)?.intent ?? null
}

const PERMANENT_CODE_KEY = 'tafel:dauercode'

/**
 * Den Dauercode beim Host aufheben: Er hängt womöglich ausgedruckt am Steg und
 * muss ein Neuladen des Bedienrechners überstehen.
 */
export function loadPermanentCode(): PermanentCode | null {
  try {
    const raw = localStorage.getItem(PERMANENT_CODE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PermanentCode> | null
    const value = typeof parsed?.value === 'string' ? normalizeCode(parsed.value) : null
    const intent = parsed?.intent
    if (
      !value ||
      !intent ||
      typeof intent.role !== 'string' ||
      !permanentCodeAllowed(intent.role) ||
      !Array.isArray(intent.parcoursIds)
    ) {
      return null
    }
    return {
      value,
      intent: { role: intent.role, parcoursIds: intent.parcoursIds.filter((p) => typeof p === 'string') },
      issuedAt: typeof parsed?.issuedAt === 'number' ? parsed.issuedAt : 0,
    }
  } catch {
    return null
  }
}

export function savePermanentCode(code: PermanentCode | null): void {
  try {
    if (code) localStorage.setItem(PERMANENT_CODE_KEY, JSON.stringify(code))
    else localStorage.removeItem(PERMANENT_CODE_KEY)
  } catch {
    // Ohne Speicher gilt der Dauercode bis zum nächsten Neuladen.
  }
}

/** Verbleibende Sekunden eines Tickets (0, wenn abgelaufen). */
export function remainingSeconds(ticket: Ticket | null, now: number): number {
  if (!ticket) return 0
  return Math.max(0, Math.ceil((ticket.expiresAt - now) / 1000))
}
