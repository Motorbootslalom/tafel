import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BoardRegion from './BoardRegion.vue'
import type { BoardConfig, Parcours, ParcoursRuntime, Starter } from '../types'

/**
 * Was auf der Tafel steht, liest in 50 m Entfernung niemand nach – deshalb wird
 * hier festgehalten, welche Angaben tatsächlich im Bild landen.
 */

const starter: Starter = {
  id: 's1',
  startNr: '404',
  klasse: '4',
  vorname: 'Lara',
  nachname: 'Knöspel-Klocke',
  verein: 'MTC Brandenburg e.V.',
  bundesland: 'Brandenburg',
  geburtsdatum: '',
}

const davor: Starter = { ...starter, id: 's0', startNr: '401', nachname: 'Müller', vorname: 'Damian' }

const board: BoardConfig = {
  kopfzeile: '',
  logoDataUrl: '',
  originMode: 'verein',
  showPrevious: true,
  showParcoursName: true,
  showVorname: true,
  scale: 1,
}

const parcours: Parcours = {
  id: 'p2',
  name: 'Parcours 1 – Land',
  classIds: ['4', '5', '6', '7'],
  wechselFaktor: 2,
}

function runtime(options: { laufend?: boolean; message?: ParcoursRuntime['message'] } = {}) {
  const slots = [
    { id: 'a', starterId: davor.id, lauf: 2, status: 'done' as const, shownAt: 1000 },
    { id: 'b', starterId: starter.id, lauf: 2, status: 'done' as const, shownAt: 2000 },
  ]
  return {
    parcoursId: parcours.id,
    slots: options.laufend === false ? [] : slots,
    history: options.laufend === false ? [] : ['a', 'b'],
    message: options.message ?? null,
    releasedLauf: 2,
  }
}

function render(rt: ParcoursRuntime, overrides: Partial<BoardConfig> = {}, stacked = false) {
  return mount(BoardRegion, {
    props: {
      parcours,
      runtime: rt,
      board: { ...board, ...overrides },
      starterById: (id: string) => [starter, davor].find((s) => s.id === id),
      showParcoursName: { ...board, ...overrides }.showParcoursName,
      stacked,
      now: 5000,
    },
    global: { directives: { fit: {}, 'fit-block': {} } },
  })
}

describe('BoardRegion – laufender Starter', () => {
  it('zeigt Startnummer, Klasse, Lauf, Name und Verein', () => {
    const text = render(runtime()).text()
    expect(text).toContain('404')
    expect(text).toContain('Klasse 4')
    expect(text).toContain('Lauf 2')
    expect(text).toContain('Lara Knöspel-Klocke')
    expect(text).toContain('MTC Brandenburg e.V.')
  })

  it('zeigt den Namen des Parcours', () => {
    expect(render(runtime()).text()).toContain('Parcours 1 – Land')
  })

  it('blendet den Namen des Parcours auf Wunsch aus', () => {
    expect(render(runtime(), { showParcoursName: false }).text()).not.toContain('Parcours 1 – Land')
  })

  it('zeigt den Starter davor', () => {
    expect(render(runtime()).text()).toContain('401')
  })

  it('blendet den Starter davor auf Wunsch aus', () => {
    expect(render(runtime(), { showPrevious: false }).text()).not.toContain('401')
  })

  it('zeigt nur den Nachnamen, wenn der Vorname abgeschaltet ist', () => {
    const text = render(runtime(), { showVorname: false }).text()
    expect(text).toContain('Knöspel-Klocke')
    expect(text).not.toContain('Lara Knöspel-Klocke')
  })

  it('zeigt das Bundesland statt des Vereins', () => {
    const text = render(runtime(), { originMode: 'bundesland' }).text()
    expect(text).toContain('Brandenburg')
    expect(text).not.toContain('MTC Brandenburg e.V.')
  })
})

describe('BoardRegion – Anordnung', () => {
  // Die Größenverhältnisse hängen an dieser Klasse: Ohne sie steht die
  // Startnummer neben den Angaben und nimmt ihnen die Breite.
  it('stellt Nummer und Angaben nebeneinander', () => {
    expect(render(runtime()).find('.region-content').classes()).not.toContain('stacked')
  })

  it('stapelt sie im hohen Bereich untereinander', () => {
    expect(render(runtime(), {}, true).find('.region-content').classes()).toContain('stacked')
  })
})

describe('BoardRegion – noch kein Starter', () => {
  it('nennt den Parcours und meldet sich bereit', () => {
    const text = render(runtime({ laufend: false })).text()
    expect(text).toContain('Parcours 1 – Land')
    expect(text).toContain('bereit')
  })

  it('zeigt ohne Parcours-Namen nur „bereit“', () => {
    const text = render(runtime({ laufend: false }), { showParcoursName: false }).text()
    expect(text).not.toContain('Parcours 1 – Land')
    expect(text).toContain('bereit')
  })

  it('setzt den Parcours-Namen in denselben Aufbau wie im Betrieb', () => {
    // Gleiche Struktur heißt gleiche Position: Beim ersten Starter darf der
    // Name nicht von seinem Platz springen.
    const leer = render(runtime({ laufend: false }))
    const laufend = render(runtime())

    for (const wrapper of [leer, laufend]) {
      const namen = wrapper.findAll('.board-meta .parcours')
      expect(namen).toHaveLength(1)
      expect(namen[0].text()).toBe('Parcours 1 – Land')
    }
  })
})

describe('BoardRegion – Meldungen', () => {
  it('verdrängt den Starter bei einer Störung', () => {
    const text = render(runtime({ message: { text: 'Störung', kind: 'stoerung' } })).text()
    expect(text).toContain('Störung')
    expect(text).not.toContain('404')
  })

  it('stellt eine Info unter den Starter, ohne ihn zu verdrängen', () => {
    const text = render(runtime({ message: { text: 'Guten Morgen', kind: 'info' } })).text()
    expect(text).toContain('Guten Morgen')
    expect(text).toContain('404')
  })

  it('lässt eine abgelaufene Meldung von selbst verschwinden', () => {
    // `now` ist 5000 – die Meldung war bis 4000 gültig.
    const text = render(runtime({ message: { text: 'Alte Meldung', kind: 'info', until: 4000 } })).text()
    expect(text).not.toContain('Alte Meldung')
    expect(text).toContain('404')
  })
})
