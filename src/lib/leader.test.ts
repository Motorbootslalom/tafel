import { beforeEach, describe, expect, it } from 'vitest'
import { STALE_MS, electLeader, readEntry, shouldClaim } from './leader'

/**
 * Auf dem Bedienrechner sind mehrere Fenster offen. Zum Relais darf nur eines
 * verbinden – sonst werfen sie sich abwechselnd hinaus, und keines bekommt
 * Änderungen mit.
 */

describe('shouldClaim', () => {
  const jetzt = 1_000_000

  it('übernimmt, wenn niemand führt', () => {
    expect(shouldClaim(null, 'win_a', jetzt)).toBe(true)
  })

  it('behält die eigene Führung', () => {
    expect(shouldClaim({ id: 'win_a', ts: jetzt - 100 }, 'win_a', jetzt)).toBe(true)
  })

  it('lässt ein anderes, aktives Fenster in Ruhe', () => {
    expect(shouldClaim({ id: 'win_b', ts: jetzt - 500 }, 'win_a', jetzt)).toBe(false)
  })

  it('übernimmt von einem Fenster, das sich nicht mehr meldet', () => {
    // Fenster geschlossen oder Rechner im Ruhezustand.
    expect(shouldClaim({ id: 'win_b', ts: jetzt - STALE_MS - 1 }, 'win_a', jetzt)).toBe(true)
  })

  it('wartet bis zum Ablauf, nicht länger', () => {
    expect(shouldClaim({ id: 'win_b', ts: jetzt - STALE_MS + 1 }, 'win_a', jetzt)).toBe(false)
  })
})

describe('electLeader', () => {
  beforeEach(() => localStorage.clear())

  it('macht das erste Fenster zum Anführer', () => {
    const a = electLeader('win_a')
    expect(a.isLeader.value).toBe(true)
    expect(readEntry()?.id).toBe('win_a')
    a.stop()
  })

  it('lässt ein zweites Fenster außen vor', () => {
    const a = electLeader('win_a')
    const b = electLeader('win_b')

    expect(a.isLeader.value).toBe(true)
    expect(b.isLeader.value).toBe(false)

    a.stop()
    b.stop()
  })

  it('gibt die Führung beim Beenden frei', () => {
    const a = electLeader('win_a')
    a.stop()
    expect(readEntry()).toBeNull()

    // Jetzt kommt das nächste Fenster sofort zum Zug, ohne Wartezeit.
    const b = electLeader('win_b')
    expect(b.isLeader.value).toBe(true)
    b.stop()
  })

  it('räumt beim Beenden nur den eigenen Eintrag weg', () => {
    const a = electLeader('win_a')
    const b = electLeader('win_b')

    b.stop()
    expect(readEntry()?.id).toBe('win_a')

    a.stop()
  })

  it('verträgt einen kaputten Eintrag', () => {
    localStorage.setItem('tafel:relay-leader', 'kein json')
    const a = electLeader('win_a')
    expect(a.isLeader.value).toBe(true)
    a.stop()
  })
})
