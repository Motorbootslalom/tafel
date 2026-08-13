import { describe, expect, it } from 'vitest'
import {
  duplicateStartNumbers,
  fillMissingStartNumbers,
  makeStartNr,
  parseClassNumber,
  sortedByClassThenStartNr,
  sortedByStartNr,
} from './startnumbers'
import { starters } from './testing'
import type { ClassId, Starter } from '../types'

/** Baut einen Starter mit fester Nummer – kurz für die Sortier-Tests. */
function s(startNr: string, klasse: ClassId): Starter {
  return {
    id: startNr,
    startNr,
    klasse,
    vorname: 'V',
    nachname: 'N',
    verein: '',
    bundesland: '',
    geburtsdatum: '',
  }
}

describe('makeStartNr und parseClassNumber', () => {
  it('füllt einstellige Nummern auf zwei Stellen auf', () => {
    expect(makeStartNr('E', 1)).toBe('E01')
    expect(makeStartNr('3', 12)).toBe('312')
    expect(makeStartNr('3', 105)).toBe('3105')
  })

  it('liest die Nummer wieder aus', () => {
    expect(parseClassNumber('E01', 'E')).toBe(1)
    expect(parseClassNumber('312', '3')).toBe(12)
    expect(parseClassNumber('E', 'E')).toBeNull()
  })
})

describe('sortedByClassThenStartNr', () => {
  it('stellt Klasse E vor die Zahlenklassen', () => {
    // Ein Textvergleich würde 101 vor E01 setzen, weil Ziffern vor Buchstaben
    // einsortiert werden – auf dem Steg gehört Klasse E aber nach vorn.
    const liste = [s('101', '1'), s('E01', 'E'), s('301', '3')]
    expect(sortedByClassThenStartNr(liste).map((x) => x.startNr)).toEqual(['E01', '101', '301'])
  })

  it('sortiert innerhalb einer Klasse aufsteigend nach der Nummer', () => {
    // Die Zahl hinter dem Klassen-Präfix zählt: 301 ist Nummer 1, 310 ist 10.
    const liste = [s('310', '3'), s('3100', '3'), s('301', '3')]
    expect(sortedByClassThenStartNr(liste).map((x) => x.startNr)).toEqual(['301', '310', '3100'])
  })

  it('bringt alle Klassen in die kanonische Reihenfolge', () => {
    const liste = [s('701', '7'), s('401', '4'), s('E01', 'E'), s('201', '2')]
    expect(sortedByClassThenStartNr(liste).map((x) => x.klasse)).toEqual(['E', '2', '4', '7'])
  })

  it('lässt die Eingabe unangetastet', () => {
    const liste = [s('301', '3'), s('E01', 'E')]
    sortedByClassThenStartNr(liste)
    expect(liste.map((x) => x.startNr)).toEqual(['301', 'E01'])
  })

  it('hängt Starter ohne verwertbare Nummer hinten an ihre Klasse', () => {
    const liste = [s('E', 'E'), s('E01', 'E'), s('101', '1')]
    expect(sortedByClassThenStartNr(liste).map((x) => x.startNr)).toEqual(['E01', 'E', '101'])
  })
})

describe('sortedByStartNr', () => {
  it('sortiert innerhalb einer Klasse numerisch', () => {
    const liste = [s('E10', 'E'), s('E02', 'E'), s('E01', 'E')]
    expect(sortedByStartNr(liste).map((x) => x.startNr)).toEqual(['E01', 'E02', 'E10'])
  })
})

describe('fillMissingStartNumbers', () => {
  it('nummeriert eine Klasse ohne jede Nummer durch', () => {
    const liste = starters({ E: 3 }).map((x) => ({ ...x, startNr: '' }))
    fillMissingStartNumbers(liste)
    expect(liste.map((x) => x.startNr)).toEqual(['E01', 'E02', 'E03'])
  })

  it('füllt nur die Lücken und zählt ab der höchsten Nummer weiter', () => {
    const liste = [s('E01', 'E'), s('', 'E'), s('E07', 'E')]
    fillMissingStartNumbers(liste)
    expect(liste.map((x) => x.startNr)).toEqual(['E01', 'E08', 'E07'])
  })

  it('behandelt die Klassen unabhängig voneinander', () => {
    const liste = [s('', 'E'), s('301', '3'), s('', '3')]
    fillMissingStartNumbers(liste)
    expect(liste.map((x) => x.startNr)).toEqual(['E01', '301', '302'])
  })
})

describe('duplicateStartNumbers', () => {
  it('meldet Doppelvergaben innerhalb einer Klasse', () => {
    expect([...duplicateStartNumbers([s('E01', 'E'), s('E01', 'E'), s('E02', 'E')])]).toEqual(['E01'])
  })

  it('meldet gleiche Nummern in verschiedenen Klassen nicht', () => {
    expect(duplicateStartNumbers([s('101', '1'), s('101', '2')]).size).toBe(0)
  })
})
