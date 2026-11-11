import { beforeEach, describe, expect, it } from 'vitest'
import {
  CODE_ALPHABET,
  DEVICE_CODE_LENGTH,
  DEVICE_CODE_TTL_MS,
  QR_TOKEN_TTL_MS,
  emptyPairing,
  formatCode,
  generateDeviceCode,
  endPermanentCode,
  issueDeviceCode,
  issuePermanentCode,
  loadPermanentCode,
  markDeviceCodeUsed,
  matchPairing,
  mergePairing,
  normalizeCode,
  remainingSeconds,
  revokeDeviceCode,
  rotateQrToken,
  savePermanentCode,
  verifyPairing,
  type PairIntent,
} from './pairing'

/** Rechte, die ein Code mitbringt: Steg, nur der Parcours „See". */
const STEG_SEE: PairIntent = { role: 'steg', parcoursIds: ['par_see'] }
const NUR_ANSEHEN: PairIntent = { role: 'viewer', parcoursIds: [] }
const TAFEL: PairIntent = { role: 'board', parcoursIds: [] }
const EIN_JAHR = 365 * 24 * 60 * 60 * 1000

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

  it('meldet, dass der Geräte-Code gegriffen hat', () => {
    const state = issueDeviceCode(emptyPairing(), STEG_SEE, 0)
    expect(matchPairing(state, state.deviceCode!.value, 1)).toEqual({ intent: STEG_SEE, via: 'code' })
  })

  it('meldet nur ein Gerät an – danach gilt er nicht mehr', () => {
    // Hört jemand am Funk mit und ist schneller, scheitert das richtige Handy
    // sofort – statt dass beide unbemerkt hineinkommen.
    const state = issueDeviceCode(emptyPairing(), STEG_SEE, 0)
    const code = state.deviceCode!.value
    const benutzt = markDeviceCodeUsed(state, 1000)

    expect(benutzt.deviceCode!.usedAt).toBe(1000)
    expect(verifyPairing(benutzt, code, 2000)).toBeNull()
  })

  it('vergisst beim zweiten Verbrauchen nicht, wann er zuerst benutzt wurde', () => {
    const state = markDeviceCodeUsed(issueDeviceCode(emptyPairing(), STEG_SEE, 0), 1000)
    expect(markDeviceCodeUsed(state, 5000).deviceCode!.usedAt).toBe(1000)
  })

  it('bleibt verbraucht, wenn ein anderes Fenster ihn noch als frisch verteilt', () => {
    // Fenster A dreht den QR-Code weiter, Fenster B hat den Code gerade verbraucht.
    const ausgegeben = issueDeviceCode(emptyPairing(), STEG_SEE, 0)
    const hier = markDeviceCodeUsed(ausgegeben, 1000)
    const vonDort = rotateQrToken(ausgegeben, STEG_SEE, 1001)

    const merged = mergePairing(hier, vonDort)
    expect(merged.deviceCode!.usedAt).toBe(1000)
    expect(merged.qrToken!.value).toBe(vonDort.qrToken!.value)
    expect(verifyPairing(merged, ausgegeben.deviceCode!.value, 2000)).toBeNull()
  })

  it('übernimmt einen neuen Code aus einem anderen Fenster unverändert', () => {
    const hier = markDeviceCodeUsed(issueDeviceCode(emptyPairing(), STEG_SEE, 0), 1000)
    const neu = issueDeviceCode(hier, STEG_SEE, 2000)
    expect(mergePairing(hier, neu).deviceCode).toEqual(neu.deviceCode)
  })

  it('lässt den QR-Code unberührt, wenn der Geräte-Code verbraucht ist', () => {
    const state = rotateQrToken(issueDeviceCode(emptyPairing(), STEG_SEE, 0), STEG_SEE, 0)
    const benutzt = markDeviceCodeUsed(state, 1000)
    expect(verifyPairing(benutzt, state.qrToken!.value, 2000)).toEqual(STEG_SEE)
  })
})

describe('Dauercode', () => {
  it('gilt ohne Ablauf und für beliebig viele Geräte', () => {
    const state = issuePermanentCode(emptyPairing(), NUR_ANSEHEN, 0)
    const code = state.permanentCode!.value

    expect(matchPairing(state, code, 1)).toEqual({ intent: NUR_ANSEHEN, via: 'permanent' })
    expect(verifyPairing(state, code, EIN_JAHR)).toEqual(NUR_ANSEHEN)
    expect(verifyPairing(state, formatCode(code).toLowerCase(), EIN_JAHR)).toEqual(NUR_ANSEHEN)
  })

  it('gibt es auch für die Tafel', () => {
    const state = issuePermanentCode(emptyPairing(), TAFEL, 0)
    expect(verifyPairing(state, state.permanentCode!.value, 1)).toEqual(TAFEL)
  })

  it('gibt es nicht für Rollen, die etwas bedienen', () => {
    // Er wäre eine dauerhaft offene Tür, sobald ihn jemand am Funk mithört.
    expect(() => issuePermanentCode(emptyPairing(), STEG_SEE, 0)).toThrow()
    expect(() => issuePermanentCode(emptyPairing(), { role: 'poweruser', parcoursIds: [] }, 0)).toThrow()
  })

  it('schaltet keine Bedienrechte frei, selbst wenn sie im Zustand stünden', () => {
    const state = {
      ...emptyPairing(),
      permanentCode: { value: 'A3FK7M', intent: STEG_SEE, issuedAt: 0 },
    }
    expect(verifyPairing(state, 'A3FK7M', 1)).toBeNull()
  })

  it('läuft neben dem Einmal-Code her', () => {
    const mitDauer = issuePermanentCode(emptyPairing(), NUR_ANSEHEN, 0)
    const state = markDeviceCodeUsed(issueDeviceCode(mitDauer, STEG_SEE, 0), 1)

    expect(state.permanentCode!.value).toBe(mitDauer.permanentCode!.value)
    expect(state.permanentCode!.value).not.toBe(state.deviceCode!.value)
    expect(verifyPairing(revokeDeviceCode(state), mitDauer.permanentCode!.value, 2)).toEqual(NUR_ANSEHEN)
  })

  it('verfällt beim Beenden und beim Ausgeben eines neuen', () => {
    const erster = issuePermanentCode(emptyPairing(), NUR_ANSEHEN, 0)
    const alt = erster.permanentCode!.value
    const zweiter = issuePermanentCode(erster, NUR_ANSEHEN, 1)

    expect(verifyPairing(endPermanentCode(erster), alt, 2)).toBeNull()
    if (zweiter.permanentCode!.value !== alt) expect(verifyPairing(zweiter, alt, 2)).toBeNull()
  })
})

describe('Dauercode im Speicher', () => {
  beforeEach(() => localStorage.clear())

  it('übersteht ein Neuladen', () => {
    const { permanentCode } = issuePermanentCode(emptyPairing(), NUR_ANSEHEN, 42)
    savePermanentCode(permanentCode)
    expect(loadPermanentCode()).toEqual(permanentCode)
  })

  it('ist nach dem Beenden weg', () => {
    savePermanentCode(issuePermanentCode(emptyPairing(), NUR_ANSEHEN, 0).permanentCode)
    savePermanentCode(null)
    expect(loadPermanentCode()).toBeNull()
  })

  it('nimmt keinen untergeschobenen Dauercode mit Bedienrechten an', () => {
    localStorage.setItem(
      'tafel:dauercode',
      JSON.stringify({ value: 'A3FK7M', intent: STEG_SEE, issuedAt: 0 }),
    )
    expect(loadPermanentCode()).toBeNull()
  })

  it('verschluckt sich nicht an kaputten Daten', () => {
    localStorage.setItem('tafel:dauercode', '{kaputt')
    expect(loadPermanentCode()).toBeNull()
    localStorage.setItem('tafel:dauercode', JSON.stringify({ value: 'O', intent: NUR_ANSEHEN }))
    expect(loadPermanentCode()).toBeNull()
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
