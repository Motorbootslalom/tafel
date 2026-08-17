import { describe, expect, it } from 'vitest'
import { initialState, reduce } from './reducer'
import type { Action } from './actions'
import { starters } from '../lib/testing'
import type { AppState } from '../types'

/**
 * Der Reducer muss **deterministisch** sein.
 *
 * In der Basis-Version wird nicht der Zustand übertragen, sondern die Änderung
 * selbst – jedes Fenster führt sie eigenständig aus. Würfelt der Reducer dabei
 * irgendetwas (IDs, Zeitstempel), driften die Fenster auseinander: Sie sehen
 * gleich aus, benennen dieselben Dinge aber unterschiedlich. Jede folgende
 * Änderung, die einen Parcours oder einen Start benennt, läuft dann im anderen
 * Fenster ins Leere – lautlos.
 *
 * Genau so ist es aufgefallen: Die Kopfzeile (ohne ID) kam an, der
 * Parcours-Name und der nächste Starter nicht.
 */

/** Ein voller Arbeitsablauf, wie er an einem Wettkampftag vorkommt. */
function ablauf(): Action[] {
  const leute = starters({ E: 3, '1': 3, '5': 2 })
  return [
    { type: 'SET_EVENT', eventName: 'Beetzseepokal', eventJahr: 2026, laufCount: 2 },
    { type: 'IMPORT_STARTERS', starters: leute, mode: 'replace' },
    { type: 'GENERATE_ALL_STARTLISTS' },
    { type: 'UPDATE_PARCOURS', parcoursId: 'par1', patch: { name: 'Parcours See' } },
    { type: 'SET_BOARD', patch: { kopfzeile: '20. Beetzseepokal' } },
    { type: 'ADVANCE', parcoursId: 'par1', now: 1_000 },
    { type: 'ADVANCE', parcoursId: 'par1', now: 61_000 },
    { type: 'SET_CLASS_PAUSED', parcoursId: 'par1', klasse: 'E', paused: true },
    { type: 'ADVANCE', parcoursId: 'par1', now: 121_000 },
    { type: 'SET_CLASS_PAUSED', parcoursId: 'par1', klasse: 'E', paused: false },
    {
      type: 'INSERT_SLOT',
      parcoursId: 'par1',
      slotId: 'nachtrag1',
      starterId: leute[0].id,
      lauf: 2,
      where: 'end',
    },
    { type: 'RELEASE_LAUF', parcoursId: 'par1', lauf: 2 },
  ]
}

const anwenden = (aktionen: Action[]): AppState => aktionen.reduce(reduce, initialState())

describe('Determinismus', () => {
  it('vergibt in zwei unabhängigen Fenstern dieselben Parcours-IDs', () => {
    // Beide Fenster starten mit leerem Speicher und legen selbst an. Hätten sie
    // hier verschiedene IDs, würde ab sofort jede Änderung an einem Parcours im
    // jeweils anderen Fenster wirkungslos bleiben.
    expect(initialState().parcoursList.map((p) => p.id)).toEqual(
      initialState().parcoursList.map((p) => p.id),
    )
  })

  it('führt denselben Ablauf in beiden Fenstern zum selben Zustand', () => {
    const fensterA = anwenden(ablauf())
    const fensterB = anwenden(ablauf())
    expect(fensterA).toEqual(fensterB)
  })

  it('vergibt auch für die Startlisten dieselben IDs', () => {
    const idsVon = (state: AppState) => state.runtimes.flatMap((rt) => rt.slots.map((s) => s.id))
    expect(idsVon(anwenden(ablauf()))).toEqual(idsVon(anwenden(ablauf())))
  })

  it('bleibt gleich, wenn ein Fenster die Änderungen später nachvollzieht', () => {
    // Der Normalfall im Betrieb: Ein Fenster wendet an und gibt die Änderung
    // weiter, das andere zieht sie Schritt für Schritt nach.
    const aktionen = ablauf()
    const sofort = anwenden(aktionen)

    let nachgezogen = initialState()
    for (const a of aktionen) nachgezogen = reduce(nachgezogen, a)

    expect(nachgezogen).toEqual(sofort)
  })

  it('erreicht jede Änderung, die einen Parcours benennt, auch das zweite Fenster', () => {
    // Die konkrete Beobachtung: Kopfzeile kam an, Parcours-Name nicht.
    const zweitesFenster = anwenden([
      { type: 'UPDATE_PARCOURS', parcoursId: 'par1', patch: { name: 'Parcours See' } },
      { type: 'SET_BOARD', patch: { kopfzeile: 'Test' } },
    ])

    expect(zweitesFenster.parcoursList[0].name).toBe('Parcours See')
    expect(zweitesFenster.board.kopfzeile).toBe('Test')
  })

  it('trifft ein Weiterschalten im zweiten Fenster denselben Starter', () => {
    const aktionen: Action[] = [
      { type: 'IMPORT_STARTERS', starters: starters({ E: 2, '1': 2 }), mode: 'replace' },
      { type: 'GENERATE_ALL_STARTLISTS' },
      { type: 'ADVANCE', parcoursId: 'par1', now: 1_000 },
    ]

    const a = anwenden(aktionen)
    const b = anwenden(aktionen)

    expect(a.runtimes[0].history).toEqual(b.runtimes[0].history)
    expect(a.runtimes[0].history).toHaveLength(1)
  })
})
