import { describe, expect, it } from 'vitest'
import { DM_2025_TIMINGS, defaultTimings } from './timings'
import { CLASS_IDS } from '../lib/classes'
import { estimator } from '../lib/timing'
import type { ClassId } from '../types'

describe('Vorgabewerte DM 2025', () => {
  it('deckt alle Klassen ab', () => {
    // Fehlt eine, rechnet die Prognose dort mit dem allgemeinen Standardwert –
    // und der passt weder zu Klasse 1 noch zu Klasse 7.
    for (const klasse of CLASS_IDS) {
      expect(DM_2025_TIMINGS[klasse], klasse).toBeDefined()
    }
  })

  it('sind als Vorgabe gekennzeichnet, nicht als Messung', () => {
    for (const klasse of CLASS_IDS) {
      expect(DM_2025_TIMINGS[klasse]!.samples, klasse).toBe(0)
    }
  })

  it('liegen im plausiblen Bereich einer Fahrzeit plus Bootswechsel', () => {
    for (const klasse of CLASS_IDS) {
      const avg = DM_2025_TIMINGS[klasse]!.avg
      expect(avg, klasse).toBeGreaterThanOrEqual(90)
      expect(avg, klasse).toBeLessThanOrEqual(200)
    }
  })

  it('halten die Reihenfolge der Klassen ein: die großen Boote brauchen länger', () => {
    // Klasse 1 ist die schnellste, danach geht es der Reihe nach aufwärts.
    // Klasse E fällt heraus – die Jüngsten fahren eine kurze Bahn, brauchen aber
    // länger als Klasse 1.
    const aufsteigend: ClassId[] = ['1', '2', '3', '4', '5', '6', '7']
    for (let i = 1; i < aufsteigend.length; i++) {
      const vorher = DM_2025_TIMINGS[aufsteigend[i - 1]]!.avg
      const jetzt = DM_2025_TIMINGS[aufsteigend[i]]!.avg
      expect(jetzt, `${aufsteigend[i - 1]} → ${aufsteigend[i]}`).toBeGreaterThanOrEqual(vorher)
    }
    expect(DM_2025_TIMINGS.E!.avg).toBeGreaterThan(DM_2025_TIMINGS['1']!.avg)
  })

  it('liefert eine eigene Kopie, die den Datensatz nicht verändert', () => {
    const kopie = defaultTimings()
    kopie['1']!.avg = 999
    expect(DM_2025_TIMINGS['1']!.avg).toBe(110)
  })

  it('greifen in der Prognose, solange nichts gemessen wurde', () => {
    expect(estimator(defaultTimings(), new Map())('7')).toBe(140)
  })
})
