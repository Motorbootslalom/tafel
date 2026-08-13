import { describe, expect, it } from 'vitest'
import { decideHello } from './pairingDecision'
import { emptyPairing, issueDeviceCode, rotateQrToken, type PairIntent } from '../lib/pairing'
import type { DeviceGrant } from '../types'

/**
 * Hier entscheidet sich, wer die Tafel bedienen darf. Entsprechend gründlich.
 */

const STEG_SEE: PairIntent = { role: 'steg', parcoursIds: ['see'] }
const NUR_ANSEHEN: PairIntent = { role: 'viewer', parcoursIds: [] }

const JETZT = 1_000_000

function grantOf(overrides: Partial<DeviceGrant> = {}): DeviceGrant {
  return {
    deviceId: 'dev_alt',
    name: 'iPhone',
    role: 'steg',
    parcoursIds: ['see'],
    lastSeen: 0,
    ...overrides,
  }
}

describe('decideHello – mit gültigem Code', () => {
  const pairing = issueDeviceCode(emptyPairing(), STEG_SEE, JETZT)
  const code = pairing.deviceCode!.value

  it('gibt genau die Rechte, die im Code stecken', () => {
    const d = decideHello({
      pairing,
      devices: [],
      deviceId: 'dev_neu',
      name: 'iPhone',
      token: code,
      now: JETZT + 1000,
    })

    expect(d.kind).toBe('welcome')
    if (d.kind !== 'welcome') return
    expect(d.grant).toMatchObject({
      deviceId: 'dev_neu',
      role: 'steg',
      parcoursIds: ['see'],
      name: 'iPhone',
    })
  })

  it('lässt das Gerät seine Rolle nicht selbst bestimmen', () => {
    // Der Code ist für „nur ansehen" ausgegeben – daran ändert kein Wunsch etwas.
    const nurSehen = issueDeviceCode(emptyPairing(), NUR_ANSEHEN, JETZT)
    const d = decideHello({
      pairing: nurSehen,
      devices: [],
      deviceId: 'dev_neu',
      name: 'iPhone',
      token: nurSehen.deviceCode!.value,
      now: JETZT + 1,
    })

    expect(d.kind === 'welcome' && d.grant.role).toBe('viewer')
  })

  it('hängt eine Zahl an einen schon vergebenen Namen', () => {
    const d = decideHello({
      pairing,
      devices: [grantOf({ deviceId: 'dev_alt', name: 'iPhone' })],
      deviceId: 'dev_neu',
      name: 'iPhone',
      token: code,
      now: JETZT + 1,
    })

    expect(d.kind === 'welcome' && d.grant.name).toBe('iPhone 2')
  })

  it('lässt einem Gerät seinen eigenen Namen beim erneuten Anmelden', () => {
    // Es zählt nicht gegen sich selbst – sonst hieße es nach jedem Code
    // „iPhone 2", „iPhone 3", …
    const d = decideHello({
      pairing,
      devices: [grantOf({ deviceId: 'dev_alt', name: 'iPhone' })],
      deviceId: 'dev_alt',
      name: 'iPhone',
      token: code,
      now: JETZT + 1,
    })

    expect(d.kind === 'welcome' && d.grant.name).toBe('iPhone')
  })

  it('nimmt bei fehlendem Vorschlag den bisherigen Namen', () => {
    const d = decideHello({
      pairing,
      devices: [grantOf({ deviceId: 'dev_alt', name: 'Steg See' })],
      deviceId: 'dev_alt',
      name: '',
      token: code,
      now: JETZT + 1,
    })

    expect(d.kind === 'welcome' && d.grant.name).toBe('Steg See')
  })

  it('akzeptiert den Code, wie er abgelesen wurde', () => {
    // Kleinschreibung und ein Buchstabe statt der Ziffer müssen durchgehen.
    const abgelesen = code.toLowerCase().replace(/0/g, 'O').replace(/1/g, 'l')
    const d = decideHello({
      pairing,
      devices: [],
      deviceId: 'dev_neu',
      name: 'iPhone',
      token: abgelesen,
      now: JETZT + 1,
    })

    expect(d.kind).toBe('welcome')
  })
})

describe('decideHello – ohne gültigen Code', () => {
  it('weist ein unbekanntes Gerät ab', () => {
    const d = decideHello({
      pairing: emptyPairing(),
      devices: [],
      deviceId: 'dev_fremd',
      name: 'iPhone',
      token: 'AAAAAA',
      now: JETZT,
    })

    expect(d.kind).toBe('denied')
    if (d.kind !== 'denied') return
    expect(d.reason).toContain('abgelaufen')
  })

  it('weist auch bei abgelaufenem Code ab', () => {
    const pairing = issueDeviceCode(emptyPairing(), STEG_SEE, JETZT)
    const d = decideHello({
      pairing,
      devices: [],
      deviceId: 'dev_neu',
      name: 'iPhone',
      token: pairing.deviceCode!.value,
      now: JETZT + 10 * 60 * 1000,
    })

    expect(d.kind).toBe('denied')
  })

  it('lässt ein bekanntes Gerät nach Verbindungsabbruch wieder herein', () => {
    // Am WLAN-Rand ist das der Normalfall – niemand soll dafür einen neuen Code
    // vorlesen müssen.
    const bekannt = grantOf({ deviceId: 'dev_alt', name: 'Steg See', lastSeen: 5 })
    const d = decideHello({
      pairing: emptyPairing(),
      devices: [bekannt],
      deviceId: 'dev_alt',
      name: 'iPhone',
      token: '',
      now: JETZT,
    })

    expect(d.kind).toBe('welcome')
    if (d.kind !== 'welcome') return
    expect(d.grant).toMatchObject({ name: 'Steg See', role: 'steg', parcoursIds: ['see'] })
    expect(d.grant.lastSeen).toBe(JETZT)
  })

  it('behält beim Wiederkommen die Rechte, auch wenn das Gerät mehr behauptet', () => {
    const bekannt = grantOf({ deviceId: 'dev_alt', role: 'viewer', parcoursIds: [] })
    const d = decideHello({
      pairing: emptyPairing(),
      devices: [bekannt],
      deviceId: 'dev_alt',
      name: 'Chef-Handy',
      token: '',
      now: JETZT,
    })

    expect(d.kind === 'welcome' && d.grant.role).toBe('viewer')
  })
})

describe('decideHello – QR-Token', () => {
  it('nimmt einen frisch gescannten Token an', () => {
    const pairing = rotateQrToken(emptyPairing(), STEG_SEE, JETZT)
    const d = decideHello({
      pairing,
      devices: [],
      deviceId: 'dev_neu',
      name: 'iPad',
      token: pairing.qrToken!.value,
      now: JETZT + 5000,
    })

    expect(d.kind === 'welcome' && d.grant.role).toBe('steg')
  })

  it('weist einen abfotografierten, längst abgelaufenen Token ab', () => {
    const pairing = rotateQrToken(emptyPairing(), STEG_SEE, JETZT)
    const d = decideHello({
      pairing,
      devices: [],
      deviceId: 'dev_neu',
      name: 'iPad',
      token: pairing.qrToken!.value,
      now: JETZT + 60_000,
    })

    expect(d.kind).toBe('denied')
  })
})
