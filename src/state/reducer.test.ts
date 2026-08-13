import { describe, expect, it } from 'vitest'
import { initialState, migrate, reduce } from './reducer'
import type { Action } from './actions'
import { starters } from '../lib/testing'
import { currentSlot, pendingSlots } from '../lib/startlist'
import type { AppState } from '../types'

function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reduce, state)
}

function withStarters(counts: Parameters<typeof starters>[0], laufCount = 1): AppState {
  return apply(
    initialState(),
    { type: 'SET_EVENT', eventName: 'Test', eventJahr: 2026, laufCount },
    { type: 'IMPORT_STARTERS', starters: starters(counts), mode: 'replace' },
    { type: 'GENERATE_ALL_STARTLISTS' },
  )
}

describe('initialState', () => {
  it('legt zwei Parcours mit passenden Runtimes an', () => {
    const state = initialState()
    expect(state.parcoursList).toHaveLength(2)
    expect(state.runtimes.map((r) => r.parcoursId)).toEqual(state.parcoursList.map((p) => p.id))
  })
})

describe('IMPORT_STARTERS', () => {
  it('ersetzt die Liste', () => {
    const state = apply(
      initialState(),
      { type: 'IMPORT_STARTERS', starters: starters({ E: 2 }), mode: 'replace' },
      { type: 'IMPORT_STARTERS', starters: starters({ '1': 3 }), mode: 'replace' },
    )
    expect(state.starters).toHaveLength(3)
  })

  it('ergänzt die Liste und vergibt fehlende Nummern', () => {
    const extra = starters({ E: 1 }).map((s) => ({ ...s, id: 'neu', startNr: '' }))
    const state = apply(
      initialState(),
      { type: 'IMPORT_STARTERS', starters: starters({ E: 2 }), mode: 'replace' },
      { type: 'IMPORT_STARTERS', starters: extra, mode: 'append' },
    )
    expect(state.starters).toHaveLength(3)
    expect(state.starters[2].startNr).toBe('E03')
  })
})

describe('GENERATE_ALL_STARTLISTS', () => {
  it('erzeugt je Parcours nur dessen Klassen, mal Anzahl Läufe', () => {
    const state = withStarters({ E: 2, '1': 2, '5': 3 }, 3)
    const [p1, p2] = state.runtimes
    expect(p1.slots).toHaveLength(4 * 3)
    expect(p2.slots).toHaveLength(3 * 3)
  })

  it('setzt eine laufende Tafel zurück', () => {
    let state = withStarters({ E: 2, '1': 2 })
    state = apply(state, { type: 'ADVANCE', parcoursId: state.parcoursList[0].id, now: 1000 })
    expect(state.runtimes[0].history).toHaveLength(1)
    state = apply(state, { type: 'GENERATE_ALL_STARTLISTS' })
    expect(state.runtimes[0].history).toHaveLength(0)
  })
})

describe('Betrieb', () => {
  it('schaltet weiter und merkt sich den Zeitpunkt', () => {
    let state = withStarters({ E: 2, '1': 2 })
    const parcoursId = state.parcoursList[0].id
    state = apply(state, { type: 'ADVANCE', parcoursId, now: 5000 })
    expect(currentSlot(state.runtimes[0])?.shownAt).toBe(5000)
  })

  it('lässt den anderen Parcours unberührt', () => {
    let state = withStarters({ E: 2, '1': 2, '5': 2 })
    const before = state.runtimes[1]
    state = apply(state, { type: 'ADVANCE', parcoursId: state.parcoursList[0].id, now: 1000 })
    expect(state.runtimes[1]).toBe(before)
  })

  it('ignoriert einen unbekannten Parcours', () => {
    const state = withStarters({ E: 2 })
    expect(apply(state, { type: 'ADVANCE', parcoursId: 'gibt-es-nicht', now: 1 })).toBe(state)
  })

  it('verschiebt eine Klasse bei defektem Boot nach hinten', () => {
    let state = withStarters({ E: 3, '1': 3 })
    const parcoursId = state.parcoursList[0].id
    const klasseOf = (id: string) => state.starters.find((s) => s.id === id)!.klasse
    expect(pendingSlots(state.runtimes[0]).map((s) => klasseOf(s.starterId)).join('')).toBe('E1E1E1')

    state = apply(state, { type: 'SHIFT_CLASS', parcoursId, klasse: 'E', steps: 1 })
    expect(pendingSlots(state.runtimes[0]).map((s) => klasseOf(s.starterId)).join('')).toBe('1E1E1E')
  })

  it('setzt und löscht eine Störungsmeldung', () => {
    let state = withStarters({ E: 2 })
    const parcoursId = state.parcoursList[0].id
    state = apply(state, {
      type: 'SET_MESSAGE',
      parcoursId,
      message: { text: 'Kurze Pause', kind: 'stoerung' },
    })
    expect(state.runtimes[0].message?.text).toBe('Kurze Pause')
    state = apply(state, { type: 'SET_MESSAGE', parcoursId, message: null })
    expect(state.runtimes[0].message).toBeNull()
  })
})

describe('Verzahnung beim Umsortieren', () => {
  /** Klassenfolge der offenen Starts – zeigt sofort, ob das Muster hält. */
  function muster(state: AppState): string {
    const byId = new Map(state.starters.map((s) => [s.id, s]))
    return state.runtimes[0].slots.map((s) => byId.get(s.starterId)?.klasse ?? '?').join('')
  }

  function vorbereitet() {
    let state = withStarters({ E: 4, '1': 4 })
    // Nur der erste Parcours führt beide Klassen.
    state = apply(state, {
      type: 'UPDATE_PARCOURS',
      parcoursId: state.parcoursList[0].id,
      patch: { classIds: ['E', '1'] },
    })
    state = apply(state, { type: 'GENERATE_ALL_STARTLISTS' })
    return { state, parcoursId: state.parcoursList[0].id }
  }

  it('ist im Auslieferungszustand eingeschaltet', () => {
    expect(initialState().keepInterleave).toBe(true)
  })

  it('hält das Wechselmuster beim Verschieben', () => {
    const { state, parcoursId } = vorbereitet()
    expect(muster(state)).toBe('E1E1E1E1')

    const slotId = state.runtimes[0].slots[0].id
    const after = apply(state, { type: 'MOVE_SLOT_TO_INDEX', parcoursId, slotId, index: 3 })

    expect(muster(after)).toBe('E1E1E1E1')
  })

  it('lässt bei abgeschalteter Verzahnung zwei derselben Klasse aufeinanderfolgen', () => {
    const { state, parcoursId } = vorbereitet()
    const slotId = state.runtimes[0].slots[0].id

    const after = apply(
      state,
      { type: 'SET_KEEP_INTERLEAVE', keepInterleave: false },
      { type: 'MOVE_SLOT_TO_INDEX', parcoursId, slotId, index: 3 },
    )

    expect(after.keepInterleave).toBe(false)
    expect(muster(after)).toBe('1E1EE1E1')
  })

  it('hält das Muster auch beim Verschieben an eine Lauf-Grenze', () => {
    let state = withStarters({ E: 3, '1': 3 }, 2)
    state = apply(state, {
      type: 'UPDATE_PARCOURS',
      parcoursId: state.parcoursList[0].id,
      patch: { classIds: ['E', '1'] },
    })
    state = apply(state, { type: 'GENERATE_ALL_STARTLISTS' })
    const parcoursId = state.parcoursList[0].id
    const slotId = state.runtimes[0].slots[0].id

    const after = apply(state, {
      type: 'MOVE_SLOT_TO_ANCHOR',
      parcoursId,
      slotId,
      anchor: { kind: 'afterLauf', lauf: 1 },
    })

    expect(muster(after)).toBe(muster(state))
  })

  it('bewegt die Schrittknöpfe innerhalb der eigenen Spur', () => {
    const { state, parcoursId } = vorbereitet()
    const erster = state.runtimes[0].slots[0].id
    const dritter = state.runtimes[0].slots[2].id

    const after = apply(state, { type: 'MOVE_SLOT', parcoursId, slotId: erster, delta: 1 })

    expect(after.runtimes[0].slots[0].id).toBe(dritter)
    expect(after.runtimes[0].slots[2].id).toBe(erster)
    expect(muster(after)).toBe('E1E1E1E1')
  })
})

describe('Lauf-Freigabe', () => {
  it('gibt beim Erzeugen nur Lauf 1 frei', () => {
    const state = withStarters({ E: 2, '1': 2 }, 3)
    expect(state.runtimes.every((rt) => rt.releasedLauf === 1)).toBe(true)
  })

  it('gibt den nächsten Lauf nur auf dem angesprochenen Parcours frei', () => {
    let state = withStarters({ E: 2, '1': 2, '5': 2 }, 3)
    state = apply(state, { type: 'RELEASE_LAUF', parcoursId: state.parcoursList[0].id, lauf: 2 })

    expect(state.runtimes[0].releasedLauf).toBe(2)
    expect(state.runtimes[1].releasedLauf).toBe(1)
  })

  it('setzt die Freigabe beim Neuerzeugen zurück', () => {
    let state = withStarters({ E: 2, '1': 2 }, 3)
    state = apply(
      state,
      { type: 'RELEASE_LAUF', parcoursId: state.parcoursList[0].id, lauf: 3 },
      { type: 'GENERATE_ALL_STARTLISTS' },
    )
    expect(state.runtimes[0].releasedLauf).toBe(1)
  })

  it('behält bei einem alten Zustand den bereits gefahrenen Lauf', () => {
    // Ein Zustand aus einer Fassung ohne Freigabe: Wer schon in Lauf 2 war,
    // darf nicht plötzlich auf Lauf 1 zurückfallen.
    const base = withStarters({ E: 2, '1': 2 }, 3)
    const alt = {
      ...base,
      runtimes: base.runtimes.map((rt, i) => {
        const { releasedLauf: _weg, ...ohne } = rt
        return i === 0
          ? { ...ohne, slots: rt.slots.map((s) => (s.lauf <= 2 ? { ...s, status: 'done' as const } : s)) }
          : ohne
      }),
    } as unknown as AppState

    const state = migrate(alt)
    expect(state.runtimes[0].releasedLauf).toBe(2)
    expect(state.runtimes[1].releasedLauf).toBe(1)
  })
})

describe('SET_PARCOURS_COUNT', () => {
  it('führt beim Verkleinern die Klassen zusammen', () => {
    const state = apply(initialState(), { type: 'SET_PARCOURS_COUNT', count: 1 })
    expect(state.parcoursList).toHaveLength(1)
    expect(state.parcoursList[0].classIds).toEqual(['E', '1', '2', '3', '4', '5', '6', '7'])
    expect(state.runtimes).toHaveLength(1)
  })

  it('legt beim Vergrößern eine passende Runtime an', () => {
    const state = apply(
      initialState(),
      { type: 'SET_PARCOURS_COUNT', count: 1 },
      { type: 'SET_PARCOURS_COUNT', count: 2 },
    )
    expect(state.runtimes.map((r) => r.parcoursId)).toEqual(state.parcoursList.map((p) => p.id))
  })
})

describe('REMOVE_STARTER', () => {
  it('räumt die offenen Slots des Starters mit weg', () => {
    let state = withStarters({ E: 2, '1': 2 }, 2)
    const gone = state.starters[0].id
    state = apply(state, { type: 'REMOVE_STARTER', starterId: gone })
    expect(state.starters.some((s) => s.id === gone)).toBe(false)
    expect(state.runtimes[0].slots.some((s) => s.starterId === gone)).toBe(false)
  })
})

describe('ADOPT_MEASURED_TIMINGS', () => {
  it('übernimmt die gemessenen Startabstände als Vorgabe', () => {
    let state = withStarters({ E: 3, '1': 3 })
    const parcoursId = state.parcoursList[0].id
    state = apply(
      state,
      { type: 'ADVANCE', parcoursId, now: 0 },
      { type: 'ADVANCE', parcoursId, now: 60_000 },
      { type: 'ADVANCE', parcoursId, now: 140_000 },
      { type: 'ADOPT_MEASURED_TIMINGS' },
    )
    expect(state.timings.E?.avg).toBe(60)
    expect(state.timings['1']?.avg).toBe(80)
  })
})

describe('Geräteverwaltung', () => {
  const grant = {
    deviceId: 'dev_1',
    name: 'Steg See',
    role: 'steg' as const,
    parcoursIds: ['p1'],
    lastSeen: 0,
  }

  it('legt ein Gerät an und aktualisiert es danach', () => {
    let state = apply(initialState(), { type: 'UPSERT_DEVICE', grant })
    expect(state.devices).toHaveLength(1)
    state = apply(state, { type: 'UPSERT_DEVICE', grant: { ...grant, name: 'Steg Land' } })
    expect(state.devices).toHaveLength(1)
    expect(state.devices[0].name).toBe('Steg Land')
  })

  it('entzieht einem Gerät die Rechte', () => {
    const state = apply(
      initialState(),
      { type: 'UPSERT_DEVICE', grant },
      { type: 'REMOVE_DEVICE', deviceId: 'dev_1' },
    )
    expect(state.devices).toHaveLength(0)
  })
})

describe('LOAD_STATE', () => {
  it('ersetzt den gesamten Zustand durch die Sicherung', () => {
    const jetzt = withStarters({ E: 2, '1': 2 })
    const sicherung: AppState = {
      ...initialState(),
      eventName: 'Beetzseepokal',
      starters: starters({ '5': 3 }),
    }

    const nachher = apply(jetzt, { type: 'LOAD_STATE', state: sicherung })

    expect(nachher.eventName).toBe('Beetzseepokal')
    expect(nachher.starters).toHaveLength(3)
  })

  it('ergänzt fehlende Felder einer alten Sicherung', () => {
    // Eine Sicherung aus einer früheren Fassung darf nicht mit Lücken ankommen.
    const alt = { version: 1, starters: [], parcoursList: [] } as unknown as AppState
    const nachher = apply(initialState(), { type: 'LOAD_STATE', state: alt })

    expect(nachher.board.originMode).toBe('verein')
    expect(nachher.keepInterleave).toBe(true)
    expect(nachher.devices).toEqual([])
  })

  it('legt zu jedem Parcours der Sicherung eine Runtime an', () => {
    const sicherung = { ...initialState(), runtimes: [] }
    const nachher = apply(initialState(), { type: 'LOAD_STATE', state: sicherung })
    expect(nachher.runtimes.map((rt) => rt.parcoursId)).toEqual(
      nachher.parcoursList.map((p) => p.id),
    )
  })
})

describe('migrate', () => {
  it('ergänzt fehlende Felder eines alten Zustands', () => {
    const alt = { version: 1, starters: [], parcoursList: [] } as unknown as AppState
    const state = migrate(alt)
    expect(state.board.originMode).toBe('verein')
    expect(state.devices).toEqual([])
    expect(state.laufCount).toBeGreaterThan(0)
  })

  it('legt fehlende Runtimes zu vorhandenen Parcours an', () => {
    const alt = { ...initialState(), runtimes: [] }
    expect(migrate(alt).runtimes).toHaveLength(2)
  })
})
