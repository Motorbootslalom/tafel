import { describe, expect, it } from 'vitest'
import {
  analyzeSequence,
  autoDistribute,
  buildSequence,
  classCounts,
  computeVerzahnung,
  presentClasses,
  startersByClass,
  tracksMatch,
} from './verzahnung'
import { classPattern, parcours, starters } from './testing'
import type { TrackItem } from '../types'

describe('presentClasses', () => {
  it('liefert nur Klassen mit Startern, kanonisch sortiert', () => {
    const list = starters({ '3': 2, E: 1 })
    expect(presentClasses(parcours(['E', '1', '2', '3']), list)).toEqual(['E', '3'])
  })
})

describe('autoDistribute', () => {
  it('teilt zwei Spuren exakt aus, wenn die Starterzahlen es hergeben', () => {
    const list = starters({ E: 4, '1': 4, '2': 4, '3': 4 })
    const tracks = autoDistribute(['E', '1', '2', '3'], classCounts(list), 2)
    const sum = (t: TrackItem[]) =>
      t.reduce((s, i) => s + (i.kind === 'class' ? classCounts(list).get(i.klasse) ?? 0 : 0), 0)
    expect(sum(tracks[0])).toBe(sum(tracks[1]))
  })

  it('erzeugt genau so viele Spuren wie gefordert', () => {
    const list = starters({ E: 3, '1': 5, '2': 7, '3': 2 })
    expect(autoDistribute(['E', '1', '2', '3'], classCounts(list), 3)).toHaveLength(3)
  })
})

describe('buildSequence', () => {
  it('wechselt im Round-Robin zwischen den Spuren', () => {
    const list = starters({ E: 3, '1': 3 })
    const tracks: TrackItem[][] = [
      [{ kind: 'class', klasse: 'E' }],
      [{ kind: 'class', klasse: '1' }],
    ]
    expect(classPattern(buildSequence(tracks, startersByClass(list)))).toBe('E1E1E1')
  })

  it('hängt den Rest der längeren Spur unverzahnt hinten an', () => {
    const list = starters({ E: 4, '1': 2 })
    const tracks: TrackItem[][] = [
      [{ kind: 'class', klasse: 'E' }],
      [{ kind: 'class', klasse: '1' }],
    ]
    expect(classPattern(buildSequence(tracks, startersByClass(list)))).toBe('E1E1EE')
  })

  it('verschiebt eine Spur per Pause nach hinten, ohne eine Lücke zu erzeugen', () => {
    const list = starters({ E: 3, '1': 3 })
    const tracks: TrackItem[][] = [
      [{ kind: 'class', klasse: 'E' }],
      [{ kind: 'pause', id: 'pause1', length: 1 }, { kind: 'class', klasse: '1' }],
    ]
    // Spur 2 setzt einen Takt aus: Klasse 1 setzt einen Starter später ein, die
    // Startliste bleibt aber lückenlos.
    expect(classPattern(buildSequence(tracks, startersByClass(list)))).toBe('EE1E11')
  })

  it('schiebt eine Klasse mit langer Pause komplett hinter die andere', () => {
    const list = starters({ E: 3, '1': 3 })
    const tracks: TrackItem[][] = [
      [{ kind: 'class', klasse: 'E' }],
      [{ kind: 'pause', id: 'pause1', length: 3 }, { kind: 'class', klasse: '1' }],
    ]
    expect(classPattern(buildSequence(tracks, startersByClass(list)))).toBe('EEE111')
  })

  it('versetzt mit einer Pause zwischen zwei Klassen nur deren Übergang', () => {
    const list = starters({ E: 2, '1': 2, '2': 6 })
    const ohne: TrackItem[][] = [
      [
        { kind: 'class', klasse: 'E' },
        { kind: 'class', klasse: '1' },
      ],
      [{ kind: 'class', klasse: '2' }],
    ]
    const mit: TrackItem[][] = [
      [
        { kind: 'class', klasse: 'E' },
        { kind: 'pause', id: 'pause1', length: 1 },
        { kind: 'class', klasse: '1' },
      ],
      [{ kind: 'class', klasse: '2' }],
    ]

    // Der Anfang der Spur bleibt stehen, erst ab der Pause verschiebt sich alles.
    expect(classPattern(buildSequence(ohne, startersByClass(list)))).toBe('E2E2121222')
    expect(classPattern(buildSequence(mit, startersByClass(list)))).toBe('E2E2212122')
  })

  it('setzt den Reigen auf Wunsch bei einer späteren Spur ein', () => {
    // Beim Neu-Verzahnen mitten im Lauf: Nach einem Starter aus Spur 1 muss
    // Spur 2 an die Reihe kommen, sonst stünden zwei aus derselben Spur nebeneinander.
    const list = starters({ E: 2, '1': 2 })
    const tracks: TrackItem[][] = [
      [{ kind: 'class', klasse: 'E' }],
      [{ kind: 'class', klasse: '1' }],
    ]
    expect(classPattern(buildSequence(tracks, startersByClass(list), 1))).toBe('1E1E')
  })

  it('lässt leere Spuren einfach aus', () => {
    const list = starters({ E: 2 })
    const tracks: TrackItem[][] = [[{ kind: 'class', klasse: 'E' }], []]
    expect(classPattern(buildSequence(tracks, startersByClass(list)))).toBe('EE')
  })
})

describe('analyzeSequence', () => {
  it('zählt Wechsel und misst den un-verzahnten End-Block', () => {
    const list = starters({ E: 4, '1': 2 })
    const seq = buildSequence(
      [[{ kind: 'class', klasse: 'E' }], [{ kind: 'class', klasse: '1' }]],
      startersByClass(list),
    )
    const a = analyzeSequence(seq)
    expect(a.total).toBe(6)
    expect(a.wechsel).toBe(4)
    expect(a.nonWechsel).toBe(1)
    expect(a.trailingKlasse).toBe('E')
    expect(a.trailingRun).toBe(2)
  })
})

describe('tracksMatch', () => {
  const tracks: TrackItem[][] = [
    [{ kind: 'class', klasse: 'E' }],
    [{ kind: 'class', klasse: '1' }],
  ]

  it('akzeptiert eine passende Anordnung', () => {
    expect(tracksMatch(tracks, ['E', '1'], 2)).toBe(true)
  })

  it('lehnt eine Anordnung mit fehlender Klasse ab', () => {
    expect(tracksMatch(tracks, ['E', '1', '2'], 2)).toBe(false)
  })

  it('lehnt eine Anordnung mit falscher Spurzahl ab', () => {
    expect(tracksMatch(tracks, ['E', '1'], 3)).toBe(false)
  })
})

describe('computeVerzahnung', () => {
  it('nutzt die manuelle Anordnung, wenn sie passt', () => {
    const list = starters({ E: 2, '1': 2 })
    const p = { ...parcours(['E', '1']), tracks: [[{ kind: 'class' as const, klasse: '1' as const }], [{ kind: 'class' as const, klasse: 'E' as const }]] }
    const result = computeVerzahnung(p, list)
    expect(result.manual).toBe(true)
    expect(classPattern(result.sequence)).toBe('1E1E')
  })

  it('fällt auf die automatische Verteilung zurück, wenn die Anordnung veraltet ist', () => {
    const list = starters({ E: 2, '1': 2, '2': 2 })
    const p = { ...parcours(['E', '1', '2']), tracks: [[{ kind: 'class' as const, klasse: 'E' as const }]] }
    expect(computeVerzahnung(p, list).manual).toBe(false)
  })

  it('ignoriert Starter aus Klassen, die nicht zum Parcours gehören', () => {
    const list = starters({ E: 2, '7': 5 })
    expect(computeVerzahnung(parcours(['E', '1']), list).sequence).toHaveLength(2)
  })
})
