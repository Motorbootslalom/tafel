import { describe, expect, it } from 'vitest'
import {
  classStats,
  DEFAULT_INTERVAL_S,
  estimator,
  formatDuration,
  formatWait,
  measurements,
  statsToPresets,
  waitEstimates,
} from './timing'
import { advance, emptyRuntime, generateSlots, setClassPaused } from './startlist'
import { klasseLookup, parcours, starters } from './testing'
import type { ParcoursRuntime, TimingTable } from '../types'

const SECOND = 1000

function running(gapsSeconds: number[]) {
  const list = starters({ E: 5, '1': 5 })
  const p = parcours(['E', '1'])
  let rt: ParcoursRuntime = { ...emptyRuntime(p.id), slots: generateSlots(p, list, 1) }
  let t = 0
  rt = advance(rt, t)
  for (const gap of gapsSeconds) {
    t += gap * SECOND
    rt = advance(rt, t)
  }
  return { rt, klasseOf: klasseLookup(list), now: t }
}

/** Zwei Läufe, Lauf 1 angefangen – Lauf 2 ist freigegeben, aber noch nicht dran. */
function runningMehrlauf() {
  const list = starters({ E: 3, '1': 3 })
  const p = parcours(['E', '1'])
  let rt: ParcoursRuntime = {
    ...emptyRuntime(p.id),
    slots: generateSlots(p, list, 2),
    releasedLauf: 2,
  }
  rt = advance(rt, 0)
  return { rt, klasseOf: klasseLookup(list), now: 0 }
}

describe('measurements', () => {
  it('schreibt den Abstand dem vorherigen Starter zu', () => {
    // Verzahnt E1E1… – der erste Abstand gehört also zu Klasse E.
    const { rt, klasseOf } = running([60, 80])
    expect(measurements(rt, klasseOf)).toEqual([
      { klasse: 'E', seconds: 60 },
      { klasse: '1', seconds: 80 },
    ])
  })

  it('verwirft unplausible Abstände (Pause, Störung, Mittag)', () => {
    const { rt, klasseOf } = running([60, 3600, 70])
    const seconds = measurements(rt, klasseOf).map((m) => m.seconds)
    expect(seconds).toEqual([60, 70])
  })

  it('verwirft zu kurze Abstände – das ist nie ein echter Lauf', () => {
    // Durchklicken, Fehlklick zurücknehmen, Nachtragen: Solche Abstände zögen
    // den Schnitt auf wenige Sekunden, und die Startliste verspräche zwanzig
    // Startern hintereinander „gleich".
    const { rt, klasseOf } = running([60, 3, 70])
    expect(measurements(rt, klasseOf).map((m) => m.seconds)).toEqual([60, 70])
  })

  it('liefert nichts, solange nur ein Starter gezeigt wurde', () => {
    const { rt, klasseOf } = running([])
    expect(measurements(rt, klasseOf)).toEqual([])
  })
})

describe('classStats', () => {
  it('mittelt je Klasse über alle Parcours', () => {
    const { rt, klasseOf } = running([60, 80, 100, 40])
    const stats = classStats([rt], klasseOf)
    expect(stats.get('E')).toMatchObject({ avg: 80, samples: 2 })
    expect(stats.get('1')).toMatchObject({ avg: 60, samples: 2, last: 40 })
  })
})

describe('estimator', () => {
  const { rt, klasseOf } = running([60, 80, 100, 40])
  const stats = classStats([rt], klasseOf)

  it('nimmt den Vorgabewert, solange zu wenig gemessen wurde', () => {
    const presets: TimingTable = { '7': { avg: 45, samples: 12 } }
    expect(estimator(presets, stats)('7')).toBe(45)
  })

  it('nimmt den Messwert, sobald genügend Messungen vorliegen', () => {
    expect(estimator({}, stats, 2)('E')).toBe(80)
  })

  it('mischt Vorgabe und Messung, solange wenige Messungen vorliegen', () => {
    const presets: TimingTable = { E: { avg: 20, samples: 9 } }
    // 2 von 4 nötigen Messungen → hälftig gewichtet: 20/2 + 80/2 = 50
    expect(estimator(presets, stats, 4)('E')).toBe(50)
  })

  it('fällt ohne jede Grundlage auf den Standardwert zurück', () => {
    expect(estimator({}, new Map())('4')).toBe(DEFAULT_INTERVAL_S)
  })
})

describe('waitEstimates', () => {
  it('rechnet die Restzeit des laufenden Starters mit ein', () => {
    const { rt, klasseOf } = running([])
    const estimate = () => 100
    // 30 s nach dem Start des aktuellen Starters: 70 s Rest bis zum nächsten.
    const [first, second] = waitEstimates(rt, klasseOf, estimate, 30 * SECOND)
    expect(first.seconds).toBe(70)
    expect(second.seconds).toBe(170)
  })

  it('wird nicht negativ, wenn der aktuelle Starter überzieht', () => {
    const { rt, klasseOf } = running([])
    const [first] = waitEstimates(rt, klasseOf, () => 60, 500 * SECOND)
    expect(first.seconds).toBe(0)
  })

  it('liefert für jeden offenen Slot des laufenden Laufs einen Wert', () => {
    const { rt, klasseOf, now } = running([60, 60])
    const estimates = waitEstimates(rt, klasseOf, () => 90, now)
    expect(estimates).toHaveLength(rt.slots.filter((s) => s.status === 'pending').length)
  })

  it('lässt spätere Läufe aus – deren Beginn steht noch gar nicht fest', () => {
    // Zwischen Lauf 1 und 2 liegt die Mittagspause, zwischen 2 und 3 eine Nacht.
    // Eine hochgerechnete Zahl wäre dort schlicht falsch.
    const { rt, klasseOf, now } = runningMehrlauf()
    const estimates = waitEstimates(rt, klasseOf, () => 90, now)
    const laufVon = new Map(rt.slots.map((s) => [s.id, s.lauf]))
    expect(estimates.length).toBeGreaterThan(0)
    expect(estimates.every((e) => laufVon.get(e.slotId) === 1)).toBe(true)
  })

  it('nennt für eine ausgesetzte Klasse keine Zeit', () => {
    // Wann das Boot zurück ist, weiß niemand.
    const { rt, klasseOf, now } = running([60])
    const aus = setClassPaused(rt, 'E', true)
    const estimates = waitEstimates(aus, klasseOf, () => 90, now)
    expect(estimates.some((e) => klasseOf(aus.slots.find((s) => s.id === e.slotId)!.starterId) === 'E')).toBe(
      false,
    )
  })
})

describe('statsToPresets', () => {
  it('übernimmt Messwerte und behält Klassen ohne Messung', () => {
    const { rt, klasseOf } = running([60, 80, 100, 40])
    const presets = statsToPresets(classStats([rt], klasseOf), { '7': { avg: 45, samples: 3 } })
    expect(presets.E).toMatchObject({ avg: 80 })
    expect(presets['7']).toMatchObject({ avg: 45 })
  })
})

describe('Formatierung', () => {
  it('formatiert Wartezeiten lesbar', () => {
    expect(formatWait(20)).toBe('gleich')
    expect(formatWait(600)).toBe('10 min')
    expect(formatWait(4500)).toBe('1:15 h')
  })

  it('formatiert Startabstände als mm:ss', () => {
    expect(formatDuration(75)).toBe('1:15')
    expect(formatDuration(9)).toBe('0:09')
  })
})
