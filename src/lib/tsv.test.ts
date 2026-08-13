import { describe, expect, it } from 'vitest'
import { formatStartersTsv, parseStartersTsv } from './tsv'

const tab = (...cells: string[]) => cells.join('\t')

describe('parseStartersTsv', () => {
  it('erkennt eine Kopfzeile unabhängig von der Spaltenreihenfolge', () => {
    const text = [
      tab('Klasse', 'Vorname', 'Name', 'Verein', 'S-Nr.'),
      tab('3', 'Ben', 'Schuster', 'SBC Havelland e.V.', '301'),
    ].join('\n')

    const result = parseStartersTsv(text)
    expect(result.usedHeader).toBe(true)
    expect(result.starters[0]).toMatchObject({
      klasse: '3',
      vorname: 'Ben',
      nachname: 'Schuster',
      verein: 'SBC Havelland e.V.',
      startNr: '301',
    })
  })

  it('nutzt ohne Kopfzeile die feste Spaltenreihenfolge', () => {
    const text = tab('E01', 'E', 'Bujak', 'Damien', 'WSC Möwe Oranienburg e.V.')
    const result = parseStartersTsv(text)
    expect(result.usedHeader).toBe(false)
    expect(result.starters[0]).toMatchObject({ startNr: 'E01', klasse: 'E', nachname: 'Bujak' })
  })

  it('vergibt fehlende Startnummern je Klasse', () => {
    const text = [
      tab('Klasse', 'Name'),
      tab('E', 'Erster'),
      tab('E', 'Zweiter'),
      tab('1', 'Dritter'),
    ].join('\n')

    const nummern = parseStartersTsv(text).starters.map((s) => s.startNr)
    expect(nummern).toEqual(['E01', 'E02', '101'])
  })

  it('füllt nur die Lücken, wenn schon Nummern vergeben sind', () => {
    const text = [
      tab('Klasse', 'Name', 'S-Nr.'),
      tab('E', 'Erster', 'E01'),
      tab('E', 'Zweiter', ''),
      tab('E', 'Dritter', 'E05'),
    ].join('\n')

    expect(parseStartersTsv(text).starters.map((s) => s.startNr)).toEqual(['E01', 'E06', 'E05'])
  })

  it('normalisiert Klassenbezeichnungen', () => {
    const text = [tab('Klasse', 'Name'), tab('Dolphin', 'A'), tab('d', 'B')].join('\n')
    expect(parseStartersTsv(text).starters.map((s) => s.klasse)).toEqual(['E', 'E'])
  })

  it('normalisiert Geburtsdaten nach ISO', () => {
    const text = [
      tab('Klasse', 'Name', 'Geburtsdatum'),
      tab('E', 'A', '5.8.2019'),
      tab('E', 'B', '2018'),
      tab('E', 'C', '2017-3-4'),
    ].join('\n')

    expect(parseStartersTsv(text).starters.map((s) => s.geburtsdatum)).toEqual([
      '2019-08-05',
      '2018-01-01',
      '2017-03-04',
    ])
  })

  it('meldet übersprungene Zeilen mit Grund und Zeilennummer', () => {
    const text = [
      tab('Klasse', 'Name'),
      tab('9', 'Unbekannte Klasse'),
      tab('E', ''),
      tab('E', 'Gut'),
    ].join('\n')

    const result = parseStartersTsv(text)
    expect(result.imported).toBe(1)
    expect(result.skipped).toHaveLength(2)
    expect(result.skipped[0]).toMatchObject({ line: 2 })
    expect(result.skipped[1]).toMatchObject({ line: 3, reason: 'kein Name' })
  })

  it('kommt mit leerem Text und Leerzeilen zurecht', () => {
    expect(parseStartersTsv('').imported).toBe(0)
    expect(parseStartersTsv('\n\n  \n').imported).toBe(0)
  })

  it('verträgt Windows-Zeilenenden', () => {
    const text = `Klasse\tName\r\nE\tTest\r\n`
    expect(parseStartersTsv(text).imported).toBe(1)
  })
})

describe('formatStartersTsv', () => {
  it('ist round-trip-fähig', () => {
    const original = parseStartersTsv(
      [
        tab('S-Nr.', 'Klasse', 'Name', 'Vorname', 'Verein', 'Bundesland', 'Geburtsdatum'),
        tab('E01', 'E', 'Bujak', 'Damien', 'WSC Möwe', 'Brandenburg', '05.08.2019'),
        tab('301', '3', 'Schuster', 'Ben', 'SBC Havelland', 'Brandenburg', '01.02.2013'),
      ].join('\n'),
    ).starters

    const again = parseStartersTsv(formatStartersTsv(original)).starters
    expect(again.map((s) => ({ ...s, id: '' }))).toEqual(original.map((s) => ({ ...s, id: '' })))
  })
})
