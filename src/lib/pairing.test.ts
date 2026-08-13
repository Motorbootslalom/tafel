import { describe, expect, it } from 'vitest'
import {
  CODE_ALPHABET,
  DEVICE_CODE_LENGTH,
  DEVICE_CODE_TTL_MS,
  QR_TOKEN_TTL_MS,
  emptyPairing,
  formatCode,
  generateDeviceCode,
  issueDeviceCode,
  normalizeCode,
  remainingSeconds,
  revokeDeviceCode,
  rotateQrToken,
  verifyPairing,
  type PairIntent,
} from './pairing'

/** Rechte, die ein Code mitbringt: Steg, nur der Parcours „See". */
const STEG_SEE: PairIntent = { role: 'steg', parcoursIds: ['par_see'] }
const NUR_ANSEHEN: PairIntent = { role: 'viewer', parcoursIds: [] }

describe('CODE_ALPHABET', () => {
  it('enthält keine verwechselbaren Zeichen', () => {
    for (const c of 'BILOSUZ') expect(CODE_ALPHABET).not.toContain(c)
  })
})

describe('generateDeviceCode', () => {
  it('erzeugt Codes der vereinbarten Länge aus dem Alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateDeviceCode()
      expect(code).toHaveLength(DEVICE_CODE_LENGTH)
      for (const c of code) expect(CODE_ALPHABET).toContain(c)
    }
  })
})

describe('normalizeCode', () => {
  it('ignoriert Groß-/Kleinschreibung und Trennzeichen', () => {
    expect(normalizeCode('a3f-k7m')).toBe('A3FK7M')
    expect(normalizeCode(' A3F K7M ')).toBe('A3FK7M')
  })

  it('korrigiert typische Lesefehler', () => {
    // I/L→1, O→0, S→5, B→8, Z→2
    expect(normalizeCode('IOSBZL')).toBe('105821')
    expect(normalizeCode('lLoOsS')).toBe('110055')
  })

  it('weist falsche Längen und unbekannte Zeichen ab', () => {
    expect(normalizeCode('A3FK7')).toBeNull()
    expect(normalizeCode('A3FK7MX')).toBeNull()
    expect(normalizeCode('A3FK7!')).toBeNull()
  })
})

describe('formatCode', () => {
  it('teilt den Code in zwei gut ablesbare Blöcke', () => {
    expect(formatCode('A3FK7M')).toBe('A3F-K7M')
  })
})

describe('Geräte-Code', () => {
  it('gilt fünf Minuten und danach nicht mehr', () => {
    const now = 1_000_000
    const state = issueDeviceCode(emptyPairing(), STEG_SEE, now)
    const code = state.deviceCode!.value

    expect(verifyPairing(state, code, now + 1000)).toEqual(STEG_SEE)
    expect(verifyPairing(state, code, now + DEVICE_CODE_TTL_MS - 1)).toEqual(STEG_SEE)
    expect(verifyPairing(state, code, now + DEVICE_CODE_TTL_MS + 1)).toBeNull()
  })

  it('liefert genau die Rechte, mit denen der Code ausgegeben wurde', () => {
    const state = issueDeviceCode(emptyPairing(), NUR_ANSEHEN, 0)
    expect(verifyPairing(state, state.deviceCode!.value, 1)).toEqual(NUR_ANSEHEN)
  })

  it('akzeptiert den Code, wie er abgelesen wurde', () => {
    const state = issueDeviceCode(emptyPairing(), STEG_SEE, 0)
    const code = state.deviceCode!.value
    expect(verifyPairing(state, formatCode(code).toLowerCase(), 1)).toEqual(STEG_SEE)
  })

  it('macht einen zurückgezogenen Code sofort ungültig', () => {
    const state = issueDeviceCode(emptyPairing(), STEG_SEE, 0)
    const code = state.deviceCode!.value
    expect(verifyPairing(revokeDeviceCode(state), code, 1)).toBeNull()
  })

  it('weist einen fremden Code ab', () => {
    const state = issueDeviceCode(emptyPairing(), STEG_SEE, 0)
    expect(verifyPairing(state, 'AAAAAA', 1)).toBeNull()
  })
})

describe('QR-Token', () => {
  it('gilt 30 Sekunden', () => {
    const state = rotateQrToken(emptyPairing(), STEG_SEE, 0)
    const token = state.qrToken!.value
    expect(verifyPairing(state, token, QR_TOKEN_TTL_MS - 1)).toEqual(STEG_SEE)
    expect(verifyPairing(state, token, QR_TOKEN_TTL_MS + 1)).toBeNull()
  })

  it('wechselt bei jeder Rotation', () => {
    const first = rotateQrToken(emptyPairing(), STEG_SEE, 0)
    const second = rotateQrToken(first, STEG_SEE, QR_TOKEN_TTL_MS)
    expect(second.qrToken!.value).not.toBe(first.qrToken!.value)
  })

  it('akzeptiert den abgelösten Token noch im Kulanzfenster', () => {
    const first = rotateQrToken(emptyPairing(), STEG_SEE, 0)
    const old = first.qrToken!.value
    const second = rotateQrToken(first, STEG_SEE, QR_TOKEN_TTL_MS)

    expect(verifyPairing(second, old, QR_TOKEN_TTL_MS + 5000)).toEqual(STEG_SEE)
    expect(verifyPairing(second, old, QR_TOKEN_TTL_MS + 20000)).toBeNull()
  })

  it('behält beim Rotieren die Rechte des abgelösten Tokens', () => {
    const first = rotateQrToken(emptyPairing(), STEG_SEE, 0)
    const old = first.qrToken!.value
    // Der Admin stellt zwischendurch auf „nur ansehen" um.
    const second = rotateQrToken(first, NUR_ANSEHEN, QR_TOKEN_TTL_MS)

    expect(verifyPairing(second, old, QR_TOKEN_TTL_MS + 1000)).toEqual(STEG_SEE)
    expect(verifyPairing(second, second.qrToken!.value, QR_TOKEN_TTL_MS + 1000)).toEqual(NUR_ANSEHEN)
  })
})

describe('remainingSeconds', () => {
  it('zählt herunter und bleibt bei null stehen', () => {
    const state = rotateQrToken(emptyPairing(), STEG_SEE, 0)
    expect(remainingSeconds(state.qrToken, 0)).toBe(30)
    expect(remainingSeconds(state.qrToken, 25_000)).toBe(5)
    expect(remainingSeconds(state.qrToken, 60_000)).toBe(0)
    expect(remainingSeconds(null, 0)).toBe(0)
  })
})
