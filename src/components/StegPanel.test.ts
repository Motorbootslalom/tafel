import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import StegPanel from './StegPanel.vue'
import { storeKey, type Store } from '../state/store'
import { initialState } from '../state/reducer'
import type { AppState, ClassId, OriginMode, Parcours, ParcoursRuntime, StartSlot, Starter } from '../types'

/**
 * Am Steg wird der nächste Starter angesagt. Deshalb muss dort alles stehen,
 * was dafür gebraucht wird – Startnummer, Name, Klasse, Lauf und Herkunft.
 */

const starters: Starter[] = [
  {
    id: 's1',
    startNr: 'E02',
    klasse: 'E',
    vorname: 'Glenn',
    nachname: 'Buttler',
    verein: 'WSC Möwe Oranienburg e.V.',
    bundesland: 'Brandenburg',
    geburtsdatum: '',
  },
  {
    id: 's2',
    startNr: '404',
    klasse: '4',
    vorname: 'Lara',
    nachname: 'Knöspel-Klocke',
    verein: 'MTC Brandenburg e.V.',
    bundesland: 'Sachsen',
    geburtsdatum: '',
  },
]

const parcours: Parcours = {
  id: 'p1',
  name: 'Parcours See',
  classIds: ['E', '1', '2', '3', '4'],
  wechselFaktor: 2,
}

function runtime(options: { releasedLauf?: number } = {}): ParcoursRuntime {
  const slots: StartSlot[] = [
    { id: 'a', starterId: 's1', lauf: 1, status: 'done', shownAt: Date.now() - 30_000 },
    { id: 'b', starterId: 's2', lauf: 2, status: 'pending' },
  ]
  return {
    parcoursId: parcours.id,
    slots,
    history: ['a'],
    message: null,
    releasedLauf: options.releasedLauf ?? 2,
  }
}

function render(rt: ParcoursRuntime, originMode: OriginMode = 'verein') {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    starters,
    parcoursList: [parcours],
    runtimes: [rt],
    board: { ...initialState().board, originMode },
  }
  const byId = new Map(starters.map((s) => [s.id, s]))
  const store = {
    state,
    dispatch,
    mayOperate: () => true,
    starterById: (id: string) => byId.get(id),
    klasseOf: (id: string): ClassId | null => byId.get(id)?.klasse ?? null,
  } as unknown as Store

  const wrapper = mount(StegPanel, {
    props: { parcours, runtime: rt },
    global: { provide: { [storeKey as symbol]: store } },
  })
  return { wrapper, dispatch }
}

/** Der Text des „Als Nächstes"-Kastens. */
function nextBox(wrapper: ReturnType<typeof render>['wrapper']): string {
  return wrapper.find('.steg-next').text()
}

describe('StegPanel – Als Nächstes', () => {
  it('nennt Startnummer und Namen', () => {
    const text = nextBox(render(runtime()).wrapper)
    expect(text).toContain('404')
    expect(text).toContain('Lara Knöspel-Klocke')
  })

  it('nennt Klasse, Lauf und Verein', () => {
    const text = nextBox(render(runtime()).wrapper)
    expect(text).toContain('Klasse 4')
    expect(text).toContain('Lauf 2')
    expect(text).toContain('MTC Brandenburg e.V.')
  })

  it('nennt das Bundesland, wenn die Tafel es so anzeigt', () => {
    const text = nextBox(render(runtime(), 'bundesland').wrapper)
    expect(text).toContain('Sachsen')
    expect(text).not.toContain('MTC Brandenburg e.V.')
  })

  it('weist auf die fehlende Freigabe hin, statt einen Starter zu nennen', () => {
    // Lauf 2 ist noch gesperrt – es gibt also keinen nächsten Starter.
    const text = nextBox(render(runtime({ releasedLauf: 1 })).wrapper)
    expect(text).toContain('erst nach Freigabe von Lauf 2')
    expect(text).not.toContain('Lara')
  })
})

describe('StegPanel – eingeklappte Abschnitte', () => {
  /** Der Abschnitt, dessen Titel `titel` enthält. */
  function section(wrapper: ReturnType<typeof render>['wrapper'], titel: string) {
    return wrapper.findAll('details.steg-section').find((d) => d.find('summary').text().includes(titel))
  }

  it('zeigt Verzahnung und Meldung eingeklappt', () => {
    // Im Normalbetrieb wird nur weitergeschaltet – alles Weitere kostete sonst
    // dauerhaft Bildschirmhöhe und zwänge zum Scrollen.
    const { wrapper } = render(runtime())
    for (const titel of ['Verzahnung verschieben', 'Meldung auf der Tafel']) {
      const abschnitt = section(wrapper, titel)
      expect(abschnitt, titel).toBeDefined()
      expect(abschnitt!.attributes('open')).toBeUndefined()
    }
  })

  it('lässt die Knöpfe zum Weiterschalten offen stehen', () => {
    // Was ständig gebraucht wird, darf nicht hinter einem Klick liegen.
    const { wrapper } = render(runtime())
    const offen = wrapper.findAll('.steg-actions button').map((b) => b.text())
    expect(offen).toContain('Nächster Starter')
    expect(offen).toContain('Zurück (Fehlklick)')
  })

  it('verrät im Titel, dass eine Meldung auf der Tafel steht', () => {
    // Eingeklappt darf nicht verborgen bleiben, dass eine Störung angezeigt wird.
    const rt = { ...runtime(), message: { text: 'Kurze Störung –\nbitte warten', kind: 'stoerung' as const } }
    const { wrapper } = render(rt)

    const summary = section(wrapper, 'Meldung auf der Tafel')!.find('summary')
    expect(summary.text()).toContain('Kurze Störung – bitte warten')
    expect(summary.find('.aktiv').classes()).toContain('stoerung')
  })

  it('kürzt eine lange Meldung im Titel', () => {
    const lang = 'Lasst es euch schmecken und erholt euch gut. Wer Lust auf Werwolf hat, kommt zur Tribüne.'
    const rt = { ...runtime(), message: { text: lang, kind: 'info' as const } }
    const summary = section(render(rt).wrapper, 'Meldung auf der Tafel')!.find('summary')

    expect(summary.text()).toContain('…')
    expect(summary.text()).not.toContain('Tribüne')
  })

  it('zeigt ohne Meldung keinen Hinweis im Titel', () => {
    const summary = section(render(runtime()).wrapper, 'Meldung auf der Tafel')!.find('summary')
    expect(summary.find('.aktiv').exists()).toBe(false)
  })
})

describe('StegPanel – Lauf-Freigabe', () => {
  it('bietet die Freigabe an, wenn der Lauf durch ist', async () => {
    const { wrapper, dispatch } = render(runtime({ releasedLauf: 1 }))
    const button = wrapper.findAll('button').find((b) => b.text().includes('Lauf 2 freigeben'))

    expect(button).toBeDefined()
    await button!.trigger('click')

    expect(dispatch).toHaveBeenCalledWith({ type: 'RELEASE_LAUF', parcoursId: 'p1', lauf: 2 })
  })

  it('sperrt das Weiterschalten ohne freigegebenen Starter', () => {
    const { wrapper } = render(runtime({ releasedLauf: 1 }))
    const button = wrapper.findAll('button').find((b) => b.text() === 'Nächster Starter')
    expect(button!.attributes('disabled')).toBeDefined()
  })

  it('lässt weiterschalten, sobald der Lauf freigegeben ist', () => {
    const { wrapper } = render(runtime({ releasedLauf: 2 }))
    const button = wrapper.findAll('button').find((b) => b.text() === 'Nächster Starter')
    expect(button!.attributes('disabled')).toBeUndefined()
  })
})
