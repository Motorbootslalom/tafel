import { describe, expect, it } from 'vitest'
import { mergeStarters } from './starterMerge'
import type { Starter } from '../types'

function starter(id: string, startNr: string, nachname: string, extra: Partial<Starter> = {}): Starter {
  return {
    id,
    startNr,
    vorname: 'Lena',
    nachname,
    verein: 'MSC Beetzsee',
    bundesland: 'Brandenburg',
    klasse: '3',
    geburtsdatum: '',
    ...extra,
  }
}

const bisher = [starter('s1', '301', 'Schneider'), starter('s2', '302', 'Weber')]

describe('mergeStarters', () => {
  it('behält die Kennung und übernimmt einen geänderten Namen', () => {
    const neu = [starter('x1', '301', 'Schneider-Wolf'), starter('x2', '302', 'Weber')]
    const r = mergeStarters(bisher, neu)
    expect(r.starters.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(r.starters[0].nachname).toBe('Schneider-Wolf')
    expect(r.changed.map((s) => s.id)).toEqual(['s1'])
    expect(r.unchanged).toBe(1)
    expect(r.added).toEqual([])
    expect(r.removed).toEqual([])
  })

  it('findet einen Starter ohne Startnummer über den Namen und behält seine Nummer', () => {
    const r = mergeStarters(bisher, [starter('x1', '', 'Schneider', { verein: 'MC Havel' })])
    expect(r.starters[0]).toMatchObject({ id: 's1', startNr: '301', verein: 'MC Havel' })
  })

  it('findet einen Starter mit geänderter Nummer über den Namen', () => {
    const r = mergeStarters(bisher, [starter('x1', '309', 'Weber')])
    expect(r.starters[0]).toMatchObject({ id: 's2', startNr: '309' })
  })

  it('meldet Neue und Entfallene', () => {
    const r = mergeStarters(bisher, [starter('x1', '301', 'Schneider'), starter('x3', '303', 'Neu')])
    expect(r.added.map((s) => s.id)).toEqual(['x3'])
    expect(r.removed.map((s) => s.id)).toEqual(['s2'])
  })

  it('behandelt einen Klassenwechsel als neuen Starter', () => {
    const r = mergeStarters(bisher, [starter('x1', '401', 'Schneider', { klasse: '4' })])
    expect(r.starters[0].id).toBe('x1')
    expect(r.removed).toHaveLength(2)
  })

  it('ordnet keinen bisherigen Starter zweimal zu', () => {
    const r = mergeStarters(bisher, [starter('x1', '301', 'Schneider'), starter('x2', '', 'Schneider')])
    expect(r.starters.map((s) => s.id)).toEqual(['s1', 'x2'])
  })
})
