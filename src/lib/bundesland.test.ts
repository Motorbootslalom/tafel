import { describe, expect, it } from 'vitest'
import { ALLE_SCHREIBWEISEN, bundeslandCode, type BundeslandCode } from './bundesland'

describe('bundeslandCode', () => {
  it('erkennt Name, amtliches und längeres Kürzel', () => {
    for (const angabe of ['Brandenburg', 'BB', 'BRB']) expect(bundeslandCode(angabe)).toBe('bb')
    for (const angabe of ['Berlin', 'BE', 'BER', 'B']) expect(bundeslandCode(angabe)).toBe('be')
    for (const angabe of ['Nordrhein-Westfalen', 'NW', 'NRW']) expect(bundeslandCode(angabe)).toBe('nw')
  })

  it('sieht über Schreibung, Umlaute und Leerzeichen hinweg', () => {
    for (const angabe of ['Thüringen', 'thueringen', ' THÜRINGEN ', 'THU', 'Thü']) {
      expect(bundeslandCode(angabe)).toBe('th')
    }
    expect(bundeslandCode('Mecklenburg Vorpommern')).toBe('mv')
    expect(bundeslandCode('baden-württemberg')).toBe('bw')
  })

  it('unterscheidet Sachsen und Sachsen-Anhalt', () => {
    expect(bundeslandCode('Sachsen')).toBe('sn')
    expect(bundeslandCode('SN')).toBe('sn')
    expect(bundeslandCode('Sachsen-Anhalt')).toBe('st')
    expect(bundeslandCode('ST')).toBe('st')
    expect(bundeslandCode('LSA')).toBe('st')
  })

  it('lässt Unbekanntes und Mehrdeutiges ohne Flagge', () => {
    for (const angabe of ['', 'SA', 'Österreich', 'MSC Beetzsee', 'Brandenburg an der Havel']) {
      expect(bundeslandCode(angabe)).toBeNull()
    }
  })

  it('ordnet keine Schreibweise zwei Ländern zu', () => {
    const normalize = (t: string) =>
      t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z]/g, '')
    const gesehen = new Map<string, BundeslandCode>()
    for (const [code, namen] of Object.entries(ALLE_SCHREIBWEISEN) as [BundeslandCode, string[]][]) {
      for (const schreibweise of [code, ...namen].map(normalize)) {
        const vorher = gesehen.get(schreibweise)
        if (vorher) expect(vorher, schreibweise).toBe(code)
        gesehen.set(schreibweise, code)
      }
    }
  })

  it('findet zu jedem Land die Flagge', () => {
    const flaggen = import.meta.glob('../assets/flags/*.svg')
    for (const code of Object.keys(ALLE_SCHREIBWEISEN)) {
      expect(Object.keys(flaggen)).toContain(`../assets/flags/${code}.svg`)
    }
  })
})
