import { describe, expect, it } from 'vitest'
import { canPerform, grantFor } from './permissions'
import type { Action } from './actions'
import type { DeviceGrant, Role } from '../types'

function grantOf(role: Role, parcoursIds: string[] = []): DeviceGrant {
  return { deviceId: 'dev_1', name: 'Test', role, parcoursIds, lastSeen: 0 }
}

const weiterschalten: Action = { type: 'ADVANCE', parcoursId: 'see', now: 0 }
const meldung: Action = {
  type: 'SET_MESSAGE',
  parcoursId: 'see',
  message: { text: 'Störung', kind: 'stoerung' },
}
const importieren: Action = { type: 'IMPORT_STARTERS', starters: [], mode: 'replace' }

describe('grantFor', () => {
  const geraete = [
    grantOf('steg', ['see']),
    { ...grantOf('viewer'), deviceId: 'dev_2', name: 'Zuschauer' },
  ]

  it('findet die Rechte des eigenen Geräts', () => {
    expect(grantFor(geraete, 'dev_2')?.role).toBe('viewer')
  })

  it('liefert nichts für ein Gerät ohne Freigabe', () => {
    // Genau der Fall „Rechte entzogen": Das Gerät steht nicht mehr in der Liste,
    // seine Bedienung sperrt sich damit von selbst.
    expect(grantFor(geraete, 'dev_weg')).toBeNull()
  })

  it('zieht eine geänderte Rolle sofort nach', () => {
    // Der Admin stuft das Gerät herunter – der neue Zustand kommt beim Gerät an,
    // und ab da darf es nur noch zusehen.
    const vorher = grantFor(geraete, 'dev_1')!
    expect(canPerform(weiterschalten, vorher)).toBe(true)

    const herabgestuft = geraete.map((g) =>
      g.deviceId === 'dev_1' ? { ...g, role: 'viewer' as const, parcoursIds: [] } : g,
    )
    expect(canPerform(weiterschalten, grantFor(herabgestuft, 'dev_1'))).toBe(false)
  })

  it('entzieht einen einzelnen Parcours, ohne die Rolle zu ändern', () => {
    const ohneSee = geraete.map((g) => (g.deviceId === 'dev_1' ? { ...g, parcoursIds: ['land'] } : g))
    const neu = grantFor(ohneSee, 'dev_1')
    expect(canPerform(weiterschalten, neu)).toBe(false)
    expect(canPerform({ ...weiterschalten, parcoursId: 'land' }, neu)).toBe(true)
  })
})

describe('canPerform', () => {
  it('lässt den Admin alles', () => {
    const admin = grantOf('admin')
    expect(canPerform(weiterschalten, admin)).toBe(true)
    expect(canPerform(importieren, admin)).toBe(true)
    expect(canPerform({ type: 'RESET' }, admin)).toBe(true)
  })

  it('lässt das Stegpersonal nur seinen eigenen Parcours bedienen', () => {
    const steg = grantOf('steg', ['see'])
    expect(canPerform(weiterschalten, steg)).toBe(true)
    expect(canPerform(meldung, steg)).toBe(true)
    expect(canPerform({ ...weiterschalten, parcoursId: 'land' }, steg)).toBe(false)
  })

  it('lässt das Stegpersonal nicht an Stammdaten und Konfiguration', () => {
    const steg = grantOf('steg', ['see'])
    expect(canPerform(importieren, steg)).toBe(false)
    expect(canPerform({ type: 'RESET' }, steg)).toBe(false)
    expect(canPerform({ type: 'SET_BOARD', patch: { scale: 2 } }, steg)).toBe(false)
    expect(canPerform({ type: 'GENERATE_ALL_STARTLISTS' }, steg)).toBe(false)
    expect(
      canPerform({ type: 'UPSERT_DEVICE', grant: grantOf('admin') }, steg),
    ).toBe(false)
  })

  it('lässt Steg mit mehreren Parcours beide bedienen', () => {
    const steg = grantOf('steg', ['see', 'land'])
    expect(canPerform(weiterschalten, steg)).toBe(true)
    expect(canPerform({ ...weiterschalten, parcoursId: 'land' }, steg)).toBe(true)
  })

  it('lässt Anzeige-Geräte gar nichts ändern', () => {
    for (const role of ['board', 'viewer'] as Role[]) {
      expect(canPerform(weiterschalten, grantOf(role, ['see']))).toBe(false)
      expect(canPerform(importieren, grantOf(role))).toBe(false)
    }
  })

  it('weist ein Gerät ohne Berechtigung ab', () => {
    expect(canPerform(weiterschalten, null)).toBe(false)
  })
})
