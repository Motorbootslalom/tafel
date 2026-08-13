import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import VerzahnungEditor from './VerzahnungEditor.vue'
import { storeKey, type Store } from '../state/store'
import type { Action } from '../state/actions'
import type { AppState, ClassId, Parcours, TrackItem } from '../types'
import { initialState } from '../state/reducer'
import { starters } from '../lib/testing'

/**
 * Ziehen selbst lässt sich ohne echten Browser nicht auslösen. Prüfbar ist
 * aber das Entscheidende: Was landet nach einem Zug im Zustand? Dafür wird die
 * Ziehen-Komponente durch eine Attrappe ersetzt, deren Liste der Test von Hand
 * verändert – genau das tut vuedraggable auch.
 */

/**
 * Attrappe für vuedraggable: Sie reicht die Liste durch und rendert den
 * `item`-Slot – so entstehen dieselben Chips wie im Betrieb, samt der
 * Pfeil-Knöpfe. Das Ziehen selbst bildet der Test nach, indem er die Liste
 * verändert und `end` auslöst; genau in dieser Reihenfolge arbeitet auch die
 * echte Komponente.
 */
const DraggableStub = {
  name: 'draggable',
  props: ['list', 'group', 'itemKey', 'animation'],
  emits: ['end'],
  template: `<div class="drop-zone-stub">
    <template v-for="(element, index) in list" :key="index">
      <slot name="item" :element="element" :index="index" />
    </template>
    <slot name="footer" />
  </div>`,
}

function setup(options: { parcours?: Partial<Parcours>; counts?: Partial<Record<ClassId, number>> } = {}) {
  const dispatch = vi.fn<(action: Action) => void>()
  const parcours: Parcours = {
    id: 'p1',
    name: 'Parcours 1',
    classIds: ['E', '1', '2'],
    wechselFaktor: 2,
    ...options.parcours,
  }

  const state: AppState = {
    ...initialState(),
    starters: starters(options.counts ?? { E: 4, '1': 4, '2': 4 }),
    parcoursList: [parcours],
  }

  const store = { state, dispatch } as unknown as Store

  const wrapper = mount(VerzahnungEditor, {
    props: { parcours },
    global: {
      provide: { [storeKey as symbol]: store },
      stubs: { draggable: DraggableStub },
    },
  })

  const zones = () => wrapper.findAllComponents(DraggableStub)
  return { wrapper, dispatch, zones, parcours }
}

/** Die zuletzt gesetzte Spur-Anordnung als Klassen je Spur. */
function lastTracks(dispatch: ReturnType<typeof vi.fn>): ClassId[][] | null {
  const calls = dispatch.mock.calls.map(([a]) => a as Action).filter((a) => a.type === 'SET_TRACKS')
  const last = calls[calls.length - 1]
  if (!last || last.type !== 'SET_TRACKS' || !last.tracks) return null
  return last.tracks.map((track: TrackItem[]) =>
    track.filter((i) => i.kind === 'class').map((i) => (i as { klasse: ClassId }).klasse),
  )
}

describe('VerzahnungEditor – Drag & Drop', () => {
  it('stellt je Spur eine Ablagefläche bereit', () => {
    const { zones } = setup()
    expect(zones()).toHaveLength(2)
  })

  it('übernimmt eine Klasse, die in eine andere Spur gezogen wurde', async () => {
    const { zones, dispatch } = setup()

    const von = zones()[0].props('list') as ClassId[]
    const nach = zones()[1].props('list') as ClassId[]
    const gezogen = von[0]

    // Genau das macht vuedraggable beim Wechsel zwischen zwei Listen.
    von.splice(0, 1)
    nach.push(gezogen)
    await zones()[0].vm.$emit('end')
    await new Promise((r) => setTimeout(r, 0))

    const tracks = lastTracks(dispatch)
    expect(tracks).not.toBeNull()
    expect(tracks![0]).not.toContain(gezogen)
    expect(tracks![1]).toContain(gezogen)
  })

  it('behält die neue Reihenfolge innerhalb einer Spur', async () => {
    const { zones, dispatch } = setup({ counts: { E: 2, '1': 2, '2': 2, '3': 2 }, parcours: { classIds: ['E', '1', '2', '3'] } })

    const spur = zones()[0].props('list') as ClassId[]
    if (spur.length < 2) return
    const vorher = [...spur]
    spur.reverse()

    await zones()[0].vm.$emit('end')
    await new Promise((r) => setTimeout(r, 0))

    const tracks = lastTracks(dispatch)
    expect(tracks![0]).toEqual([...vorher].reverse())
  })

  it('lässt eine Spur auch leer zurück', async () => {
    const { zones, dispatch } = setup()

    const von = zones()[0].props('list') as ClassId[]
    const nach = zones()[1].props('list') as ClassId[]
    nach.push(...von.splice(0, von.length))

    await zones()[0].vm.$emit('end')
    await new Promise((r) => setTimeout(r, 0))

    const tracks = lastTracks(dispatch)
    expect(tracks![0]).toEqual([])
    // Die Spur bleibt erhalten – der Wechsel-Faktor ändert sich durch Ziehen nicht.
    expect(tracks).toHaveLength(2)
  })

  it('lässt eine gesetzte Pause beim Ziehen unangetastet', async () => {
    const withPause: TrackItem[][] = [
      [
        { kind: 'pause', id: 'pause_fest', length: 3 },
        { kind: 'class', klasse: 'E' },
      ],
      [
        { kind: 'class', klasse: '1' },
        { kind: 'class', klasse: '2' },
      ],
    ]
    const { zones, dispatch } = setup({ parcours: { tracks: withPause } })

    const von = zones()[1].props('list') as ClassId[]
    const nach = zones()[0].props('list') as ClassId[]
    nach.push(...von.splice(0, 1))

    await zones()[1].vm.$emit('end')
    await new Promise((r) => setTimeout(r, 0))

    const calls = dispatch.mock.calls.map(([a]) => a as Action).filter((a) => a.type === 'SET_TRACKS')
    const last = calls[calls.length - 1]
    const erste = (last as { tracks: TrackItem[][] }).tracks[0]

    expect(erste[0]).toEqual({ kind: 'pause', id: 'pause_fest', length: 3 })
    expect(erste.slice(1).map((i) => (i as { klasse: ClassId }).klasse)).toEqual(['E', '1'])
  })
})

describe('VerzahnungEditor – Name des Parcours', () => {
  it('übernimmt den Namen schon beim Tippen', async () => {
    const { wrapper, dispatch } = setup()
    const feld = wrapper.findAll('input').find((i) => i.element.value === 'Parcours 1')!

    // Nur tippen – kein Fokuswechsel. Mit `change` käme die Änderung erst an,
    // wenn das Feld verlassen wird; steht die Tafel auf einem zweiten Monitor,
    // passiert das unter Umständen nie.
    feld.element.value = 'Parcours 2 – See'
    await feld.trigger('input')

    const calls = dispatch.mock.calls.map(([a]) => a as Action)
    expect(calls).toContainEqual({
      type: 'UPDATE_PARCOURS',
      parcoursId: 'p1',
      patch: { name: 'Parcours 2 – See' },
    })
  })
})

describe('VerzahnungEditor – Verschieben ohne Ziehen', () => {
  /** Die Pfeil-Knöpfe eines Chips: [nach oben, nach unten]. */
  function nudgesOf(wrapper: ReturnType<typeof setup>['wrapper'], zoneIndex: number, chipIndex = 0) {
    const zone = wrapper.findAll('.drop-zone-stub')[zoneIndex]
    return zone.findAll('.chip')[chipIndex].findAll('.nudge')
  }

  it('schiebt eine Klasse per Knopf in die nächste Spur', async () => {
    const { wrapper, dispatch, zones } = setup()
    const klasse = (zones()[0].props('list') as ClassId[])[0]

    await nudgesOf(wrapper, 0, 0)[1].trigger('click')

    const tracks = lastTracks(dispatch)!
    expect(tracks[0]).not.toContain(klasse)
    expect(tracks[1]).toContain(klasse)
  })

  it('holt eine Klasse per Knopf wieder zurück', async () => {
    const { wrapper, dispatch, zones } = setup()
    const klasse = (zones()[1].props('list') as ClassId[])[0]

    await nudgesOf(wrapper, 1, 0)[0].trigger('click')

    const tracks = lastTracks(dispatch)!
    expect(tracks[0]).toContain(klasse)
    expect(tracks[1]).not.toContain(klasse)
  })

  it('sperrt die Pfeile am Rand', () => {
    const { wrapper } = setup()
    // Erste Spur: nicht weiter nach oben. Letzte Spur: nicht weiter nach unten.
    expect(nudgesOf(wrapper, 0, 0)[0].attributes('disabled')).toBeDefined()
    expect(nudgesOf(wrapper, 1, 0)[1].attributes('disabled')).toBeDefined()
  })

  it('zeigt in einer leeren Spur einen Hinweis zum Ablegen', async () => {
    const { wrapper, zones } = setup()
    const von = zones()[0].props('list') as ClassId[]
    const nach = zones()[1].props('list') as ClassId[]
    nach.push(...von.splice(0, von.length))
    await zones()[0].vm.$emit('end')
    await new Promise((r) => setTimeout(r, 0))

    expect(wrapper.text()).toContain('Klasse hierher ziehen')
  })
})
