import nacl from 'tweetnacl'

/**
 * Kleinwerkzeug für die Leitung zu ntfy: Bytes als Text, Packen, Prüfsumme.
 *
 * ntfy transportiert ausschließlich Text, und alles, was über 4096 Byte geht,
 * legt es als Anhang ab. Deshalb wird vor dem Verschlüsseln gepackt und danach
 * in URL-sicheres Base64 übersetzt – dasselbe Alphabet, das ntfy auch für
 * Themen-Namen erlaubt.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const LOOKUP = new Int16Array(128).fill(-1)
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i

/** Base64 mit `-` und `_`, ohne Auffüllzeichen. */
export function toBase64Url(bytes: Uint8Array): string {
  const parts: string[] = []
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    parts.push(ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63])
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    parts.push(ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63])
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    parts.push(ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63])
  }
  return parts.join('')
}

/** Gegenstück zu {@link toBase64Url}; `null` bei allem, was keines ist. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null
  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let o = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    const v = c < 128 ? LOOKUP[c] : -1
    if (v < 0) return null
    buffer = ((buffer << 6) | v) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buffer >> bits) & 255
    }
  }
  return out
}

/** Prüft, ob ein Text als Base64url durchgeht und – falls verlangt – wie viele Bytes er trägt. */
export function isBase64Url(value: unknown, bytes?: number): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) return false
  if (bytes === undefined) return value.length % 4 !== 1
  return value.length === Math.ceil((bytes * 4) / 3)
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

// ---------------------------------------------------------------------------
// Packen
// ---------------------------------------------------------------------------

/**
 * Packen kann jeder Browser seit 2023 (Safari 16.4) selbst. Ältere Geräte
 * scheitern hier – und erfahren es, statt still nichts zu empfangen.
 */
export function canCompress(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'
}

/**
 * Obergrenze beim Entpacken. Eine Anmeldung kann jeder schicken, der den
 * Raum-Link hat – ein paar Kilobyte, die zu Gigabyte aufgehen, sollen den Host
 * nicht lahmlegen.
 */
export const MAX_UNPACKED_BYTES = 16 * 1024 * 1024

async function through(
  data: Uint8Array,
  stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
  limit: number,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  // Nicht abwarten: Bei größeren Mengen staut sich sonst das Schreiben, weil
  // noch niemand liest.
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => {})
  writer.close().catch(() => {})

  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel().catch(() => {})
      throw new Error('zu groß')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export function deflate(data: Uint8Array): Promise<Uint8Array> {
  return through(data, new CompressionStream('deflate'), Number.POSITIVE_INFINITY)
}

/** Wirft bei kaputten Daten oder wenn sie über {@link MAX_UNPACKED_BYTES} aufgehen. */
export function inflate(data: Uint8Array, limit = MAX_UNPACKED_BYTES): Promise<Uint8Array> {
  return through(data, new DecompressionStream('deflate'), limit)
}

/** Wert → JSON → gepackt. */
export async function pack(value: unknown): Promise<Uint8Array> {
  return deflate(utf8(JSON.stringify(value)))
}

/** Gegenstück zu {@link pack}; `null`, wenn es nicht aufgeht. */
export async function unpack(bytes: Uint8Array): Promise<unknown> {
  try {
    return JSON.parse(fromUtf8(await inflate(bytes)))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Prüfsumme
// ---------------------------------------------------------------------------

/**
 * JSON mit sortierten Schlüsseln. Die Reihenfolge der Schlüssel hängt davon ab,
 * wie ein Objekt entstanden ist – beim Host durch den Reducer, beim Gerät durch
 * das Nachziehen einer Änderung. Für die Prüfsumme darf das keine Rolle spielen.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`
}

/** Kurzer Fingerabdruck eines Werts (96 Bit aus SHA-512). */
export function fingerprint(value: unknown): string {
  return toBase64Url(nacl.hash(utf8(canonicalJson(value))).subarray(0, 12))
}

// ---------------------------------------------------------------------------
// Uhr
// ---------------------------------------------------------------------------

/**
 * Nächster Zeitstempel eines Absenders: die Uhrzeit, aber nie kleiner oder
 * gleich dem letzten. So steigt er auch dann, wenn die Uhr des Geräts
 * zurückgestellt wird – und Empfänger können alles verwerfen, was nicht neuer
 * ist als das zuletzt Gesehene.
 */
export function nextTick(last: number, now = Date.now()): number {
  return Math.max(now, last + 1)
}
