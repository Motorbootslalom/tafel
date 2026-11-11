import { describe, expect, it } from 'vitest'
import {
  canCompress,
  canonicalJson,
  deflate,
  fingerprint,
  fromBase64Url,
  inflate,
  isBase64Url,
  nextTick,
  pack,
  toBase64Url,
  unpack,
} from './codec'

describe('Base64url', () => {
  it('übersetzt hin und zurück, für jede Länge', () => {
    for (let length = 0; length < 70; length++) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + length) & 255)
      const text = toBase64Url(bytes)
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(fromBase64Url(text)).toEqual(bytes)
    }
  })

  it('stimmt mit dem üblichen Base64 überein', () => {
    const bytes = new Uint8Array([251, 255, 191, 0, 1, 2, 3])
    const standard = btoa(String.fromCharCode(...bytes))
    expect(toBase64Url(bytes)).toBe(standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
  })

  it('weist Fremdes ab', () => {
    expect(fromBase64Url('ab+c')).toBeNull()
    expect(fromBase64Url('abcde')).toBeNull()
    expect(fromBase64Url('äbcd')).toBeNull()
  })

  it('prüft die Länge in Bytes', () => {
    const key = toBase64Url(new Uint8Array(32))
    expect(isBase64Url(key, 32)).toBe(true)
    expect(isBase64Url(key, 64)).toBe(false)
    expect(isBase64Url(key + '=', 32)).toBe(false)
    expect(isBase64Url(42)).toBe(false)
  })
})

describe('Packen', () => {
  it('steht zur Verfügung', () => {
    expect(canCompress()).toBe(true)
  })

  it('packt und entpackt', async () => {
    const value = { starters: Array.from({ length: 200 }, (_, i) => ({ id: `s_${i}`, name: 'Muster' })) }
    const packed = await pack(value)
    expect(packed.length).toBeLessThan(JSON.stringify(value).length / 5)
    expect(await unpack(packed)).toEqual(value)
  })

  it('liefert null für Unsinn', async () => {
    expect(await unpack(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })

  it('bricht ab, wenn es über die Grenze aufgeht', async () => {
    const bomb = await deflate(new Uint8Array(1024 * 1024))
    expect(bomb.length).toBeLessThan(2048)
    await expect(inflate(bomb, 64 * 1024)).rejects.toThrow()
  })
})

describe('Fingerabdruck', () => {
  it('hängt nicht an der Reihenfolge der Schlüssel', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}')
    expect(fingerprint({ b: 1, a: 2 })).toBe(fingerprint({ a: 2, b: 1 }))
  })

  it('unterscheidet verschiedene Werte', () => {
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }))
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]))
  })
})

describe('nextTick', () => {
  it('folgt der Uhr, steigt aber immer', () => {
    expect(nextTick(0, 1000)).toBe(1000)
    expect(nextTick(1000, 1000)).toBe(1001)
    // Uhr zurückgestellt: trotzdem größer als zuvor.
    expect(nextTick(5000, 1000)).toBe(5001)
  })
})
