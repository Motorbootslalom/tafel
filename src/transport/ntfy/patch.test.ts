import { describe, expect, it } from 'vitest'
import { applyPatch, diff, equal, type Json, type Op } from './patch'
import { initialState, reduce } from '../../state/reducer'
import { starters } from '../../lib/testing'
import type { Action } from '../../state/actions'
import type { AppState } from '../../types'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Differenz bilden und auf einer Kopie nachziehen – muss genau `b` ergeben. */
function roundtrip(a: Json, b: Json): Op[] {
  const ops = diff(a, b)
  const result = applyPatch(clone(a), clone(ops))
  expect(result).toEqual(b)
  return ops
}

describe('diff + applyPatch', () => {
  it('liefert nichts, wenn nichts anders ist', () => {
    expect(diff({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([])
  })

  it('setzt, ergänzt und entfernt Felder', () => {
    const ops = roundtrip({ a: 1, b: { c: 2, d: 3 } }, { a: 2, b: { c: 2, e: 4 } })
    expect(ops).toEqual([
      { p: ['a'], v: 2 },
      { p: ['b', 'e'], v: 4 },
      { p: ['b', 'd'], d: 1 },
    ])
  })

  it('hängt an eine Liste an, ohne den Rest mitzuschicken', () => {
    const ops = roundtrip({ h: ['a', 'b', 'c'] }, { h: ['a', 'b', 'c', 'd'] })
    expect(ops).toEqual([{ p: ['h'], s: [3, 0, 'd'] }])
  })

  it('fügt ein und entfernt mitten in einer Liste', () => {
    roundtrip([1, 2, 3, 4, 5], [1, 2, 9, 3, 4, 5])
    roundtrip([1, 2, 3, 4, 5], [1, 2, 4, 5])
    roundtrip([1, 2, 3], [])
    roundtrip([], [1, 2])
  })

  it('erkennt ein einzeln verschobenes Element – in beide Richtungen', () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, lauf: 1 }))
    const back = clone(list)
    back.splice(15, 0, ...back.splice(3, 1))
    expect(roundtrip(list, back)).toEqual([{ p: [], m: [3, 15] }])

    const forward = clone(list)
    forward.splice(2, 0, ...forward.splice(17, 1))
    expect(roundtrip(list, forward)).toEqual([{ p: [], m: [17, 2] }])
  })

  it('ändert in einer gleich langen Liste nur das geänderte Feld', () => {
    const list = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, status: 'pending' }))
    const next = clone(list)
    next[30].status = 'done'
    expect(roundtrip(list, next)).toEqual([{ p: [30, 'status'], v: 'done' }])
  })

  it('ersetzt bei einem anderen Typ den Wert, auch an der Wurzel', () => {
    roundtrip({ a: [1] }, { a: { b: 1 } })
    roundtrip({ a: 1 }, [1, 2])
    roundtrip({ a: null }, { a: 0 })
  })

  it('stimmt für zufällige Änderungen', () => {
    // Fester Startwert – ein Fehlschlag soll sich wiederholen lassen.
    let seed = 42
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]

    function randomValue(depth: number): Json {
      const r = random()
      if (depth > 2 || r < 0.4) return pick([null, true, 1, 2.5, 'a', 'b', ''])
      if (r < 0.7) return Array.from({ length: Math.floor(random() * 5) }, () => randomValue(depth + 1))
      const obj: Record<string, Json> = {}
      for (let i = Math.floor(random() * 4); i > 0; i--) obj[pick(['x', 'y', 'z', 'w'])] = randomValue(depth + 1)
      return obj
    }

    function mutate(value: Json, depth: number): Json {
      if (depth > 3 || random() < 0.2) return randomValue(depth)
      if (Array.isArray(value)) {
        const copy = [...value]
        const r = random()
        if (r < 0.25) copy.splice(Math.floor(random() * (copy.length + 1)), 0, randomValue(depth))
        else if (r < 0.5 && copy.length) copy.splice(Math.floor(random() * copy.length), 1)
        else if (r < 0.7 && copy.length > 1) copy.splice(Math.floor(random() * copy.length), 0, ...copy.splice(Math.floor(random() * copy.length), 1))
        else if (copy.length) {
          const i = Math.floor(random() * copy.length)
          copy[i] = mutate(copy[i], depth + 1)
        }
        return copy
      }
      if (value && typeof value === 'object') {
        const copy = { ...value }
        const key = pick(['x', 'y', 'z', 'w'])
        if (random() < 0.3) delete copy[key]
        else copy[key] = mutate(copy[key] ?? null, depth + 1)
        return copy
      }
      return randomValue(depth)
    }

    for (let round = 0; round < 500; round++) {
      const a = randomValue(0)
      let b = a
      for (let i = 1 + Math.floor(random() * 4); i > 0; i--) b = mutate(b, 0)
      roundtrip(a, b)
    }
  })
})

describe('applyPatch weist ab, was nicht passt', () => {
  it('einen Pfad, den es nicht gibt', () => {
    expect(() => applyPatch({ a: {} }, [{ p: ['b', 'c'], v: 1 }])).toThrow()
    expect(() => applyPatch({ a: [1] }, [{ p: ['a', 5], v: 1 }])).toThrow()
  })

  it('Verschiebungen und Ersetzungen außerhalb der Liste', () => {
    expect(() => applyPatch([1, 2], [{ p: [], m: [0, 2] }])).toThrow()
    expect(() => applyPatch([1, 2], [{ p: [], s: [3, 0, 9] }])).toThrow()
    expect(() => applyPatch([1, 2], [{ p: [], s: [1, 5] }])).toThrow()
  })

  it('Prototypen-Schlüssel', () => {
    expect(() => applyPatch({}, [{ p: ['__proto__', 'x'], v: 1 }])).toThrow()
    expect(() => applyPatch({}, [{ p: ['__proto__'], v: { x: 1 } }])).toThrow()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('Unsinn statt einer Änderung', () => {
    expect(() => applyPatch({}, [null as unknown as Op])).toThrow()
    expect(() => applyPatch({}, [{ p: ['a'] } as unknown as Op])).toThrow()
  })
})

describe('am echten Zustand', () => {
  /** Eine große DM: 150 Starter, drei Läufe, zwei Parcours. */
  function bigEvent(): AppState {
    const list = starters({ E: 20, '1': 20, '2': 20, '3': 18, '4': 20, '5': 18, '6': 18, '7': 16 })
    let state = initialState()
    state = reduce(state, { type: 'SET_EVENT', eventName: 'DM', eventJahr: 2026, laufCount: 3 })
    state = reduce(state, { type: 'IMPORT_STARTERS', starters: list, mode: 'replace' })
    return reduce(state, { type: 'GENERATE_ALL_STARTLISTS' })
  }

  function step(state: AppState, action: Action): { next: AppState; bytes: number } {
    const before = clone(state) as unknown as Json
    const next = reduce(state, action)
    const ops = roundtrip(before, clone(next) as unknown as Json)
    return { next, bytes: JSON.stringify(ops).length }
  }

  it('ein Weiterschalten ist klein', () => {
    let state = bigEvent()
    expect(JSON.stringify(state).length).toBeGreaterThan(40_000)
    for (let i = 0; i < 5; i++) {
      const { next, bytes } = step(state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_000_000 + i * 60_000 })
      expect(bytes).toBeLessThan(400)
      state = next
    }
  })

  it('Verschieben, Zurückstellen und Aussetzen bleiben klein', () => {
    let state = bigEvent()
    state = reduce(state, { type: 'ADVANCE', parcoursId: 'par1', now: 1_000_000 })
    const slots = state.runtimes[0].slots

    const moved = step(state, { type: 'MOVE_SLOT_TO_INDEX', parcoursId: 'par1', slotId: slots[10].id, index: 40 })
    expect(moved.bytes).toBeLessThan(2000)

    const deferred = step(moved.next, { type: 'DEFER_SLOT', parcoursId: 'par1', slotId: slots[5].id })
    expect(deferred.bytes).toBeLessThan(3000)

    step(deferred.next, { type: 'SET_CLASS_PAUSED', parcoursId: 'par1', klasse: 'E', paused: true })
  })

  it('ein neues Logo geht einmal mit, danach nicht mehr', () => {
    const state = bigEvent()
    const logo = 'data:image/png;base64,' + 'A'.repeat(50_000)
    const withLogo = step(state, { type: 'SET_BOARD', patch: { logoDataUrl: logo } })
    expect(withLogo.bytes).toBeGreaterThan(50_000)
    const after = step(withLogo.next, { type: 'ADVANCE', parcoursId: 'par2', now: 2_000_000 })
    expect(after.bytes).toBeLessThan(400)
  })
})

describe('equal', () => {
  it('vergleicht Objekte unabhängig von der Reihenfolge der Schlüssel', () => {
    expect(equal({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(equal({ a: 1 }, { a: 1, b: undefined as unknown as Json })).toBe(false)
    expect(equal([1, 2], [2, 1])).toBe(false)
  })
})
