import { describe, expect, it } from 'vitest'
import {
  advance,
  currentSlot,
  deferSlot,
  deferredSlots,
  emptyRuntime,
  generateSlots,
  insertSlot,
  laeufeOf,
  laufComplete,
  nextReleasableLauf,
  releaseLauf,
  releasedSlots,
  moveSlot,
  moveSlotToAnchor,
  moveSlotToIndex,
  nextSlot,
  pendingSlots,
  previousSlot,
  pruneSlots,
  reactivateSlot,
  removeSlot,
  shiftClass,
  showSlot,
  undoLast,
} from './startlist'
import { klasseLookup, parcours, starters } from './testing'
import type { ParcoursRuntime, Starter } from '../types'

function setup(counts: Parameters<typeof starters>[0], laufCount = 1) {
  const list = starters(counts)
  const p = parcours(Object.keys(counts) as never)
  const rt: ParcoursRuntime = { ...emptyRuntime(p.id), slots: generateSlots(p, list, laufCount) }
  return { list, p, rt, klasseOf: klasseLookup(list) }
}

/** Klassenfolge der geplanten Slots – macht Umsortierungen gut sichtbar. */
function pattern(rt: ParcoursRuntime, list: Starter[]): string {
  const byId = new Map(list.map((s) => [s.id, s]))
  return rt.slots.map((s) => byId.get(s.starterId)?.klasse ?? '?').join('')
}

describe('generateSlots', () => {
  it('legt je Lauf eine komplette verzahnte Runde an', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 3)
    expect(rt.slots).toHaveLength(12)
    expect(rt.slots.filter((s) => s.lauf === 1)).toHaveLength(4)
    expect(rt.slots.filter((s) => s.lauf === 3)).toHaveLength(4)
  })

  it('vergibt eindeutige Slot-IDs über alle Läufe', () => {
    const { rt } = setup({ E: 3, '1': 3 }, 3)
    expect(new Set(rt.slots.map((s) => s.id)).size).toBe(rt.slots.length)
  })
})

describe('advance', () => {
  it('zeigt den ersten offenen Slot und merkt sich die Historie', () => {
    const { rt } = setup({ E: 2, '1': 2 })
    const after = advance(rt, 1000)
    expect(after.history).toHaveLength(1)
    expect(currentSlot(after)?.id).toBe(rt.slots[0].id)
    expect(currentSlot(after)?.shownAt).toBe(1000)
    expect(currentSlot(after)?.status).toBe('done')
  })

  it('führt aktuellen und vorherigen Starter mit', () => {
    const { rt } = setup({ E: 2, '1': 2 })
    const after = advance(advance(rt, 1000), 2000)
    expect(currentSlot(after)?.id).toBe(rt.slots[1].id)
    expect(previousSlot(after)?.id).toBe(rt.slots[0].id)
  })

  it('bleibt am Ende der Liste stehen', () => {
    let { rt } = setup({ E: 1 })
    rt = advance(rt, 1000)
    const done = advance(rt, 2000)
    expect(done.history).toHaveLength(1)
  })
})

describe('undoLast', () => {
  it('macht ein versehentliches Weiterschalten rückgängig', () => {
    const { rt } = setup({ E: 2, '1': 2 })
    const after = undoLast(advance(advance(rt, 1000), 2000))
    expect(after.history).toHaveLength(1)
    expect(currentSlot(after)?.id).toBe(rt.slots[0].id)
    expect(nextSlot(after)?.id).toBe(rt.slots[1].id)
  })

  it('tut nichts, wenn noch nichts gezeigt wurde', () => {
    const { rt } = setup({ E: 1 })
    expect(undoLast(rt)).toEqual(rt)
  })
})

describe('zurückstellen und reaktivieren', () => {
  it('überspringt einen zurückgestellten Starter', () => {
    const { rt } = setup({ E: 2, '1': 2 })
    const first = rt.slots[0].id
    const after = deferSlot(rt, first)
    expect(nextSlot(after)?.id).toBe(rt.slots[1].id)
    expect(deferredSlots(after)).toHaveLength(1)
  })

  it('setzt einen reaktivierten Starter als nächsten ein', () => {
    const { rt } = setup({ E: 2, '1': 2 })
    const first = rt.slots[0].id
    let after = deferSlot(rt, first)
    after = advance(after, 1000)
    after = reactivateSlot(after, first, 'next')
    expect(nextSlot(after)?.id).toBe(first)
    expect(deferredSlots(after)).toHaveLength(0)
  })

  it('hängt einen reaktivierten Starter ans Ende seines Laufs', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 2)
    const first = rt.slots[0].id
    const lauf1 = rt.slots.filter((s) => s.lauf === 1).length
    const after = reactivateSlot(deferSlot(rt, first), first, 'end')
    expect(after.slots.findIndex((s) => s.id === first)).toBe(lauf1 - 1)
  })
})

describe('showSlot', () => {
  it('holt einen Starter aus einer anderen Klasse vor', () => {
    const { rt, list } = setup({ E: 3, '1': 3 })
    // Verzahnt: E1E1E1 – jetzt soll der zweite Starter der Klasse 1 direkt ran.
    const byId = new Map(list.map((s) => [s.id, s]))
    const target = rt.slots.filter((s) => byId.get(s.starterId)?.klasse === '1')[1]
    const after = showSlot(rt, target.id, 1000)
    expect(currentSlot(after)?.id).toBe(target.id)
    expect(after.slots[0].id).toBe(target.id)
  })

  it('sortiert einen vorgezogenen Starter hinter den zuletzt gezeigten', () => {
    const { rt } = setup({ E: 3, '1': 3 })
    const after = showSlot(advance(rt, 1000), rt.slots[4].id, 2000)
    expect(after.slots[0].id).toBe(rt.slots[0].id)
    expect(after.slots[1].id).toBe(rt.slots[4].id)
  })
})

describe('shiftClass', () => {
  it('verschiebt eine Klasse in der Verzahnung nach hinten', () => {
    const { rt, list, klasseOf } = setup({ E: 3, '1': 3 })
    expect(pattern(rt, list)).toBe('E1E1E1')
    const after = shiftClass(rt, 'E', klasseOf, 1)
    expect(pattern(after, list)).toBe('1E1E1E')
  })

  it('verschiebt eine Klasse wieder nach vorn', () => {
    const { rt, list, klasseOf } = setup({ E: 3, '1': 3 })
    const back = shiftClass(rt, 'E', klasseOf, 1)
    expect(pattern(shiftClass(back, 'E', klasseOf, -1), list)).toBe('E1E1E1')
  })

  it('lässt bereits gefahrene Starter unangetastet', () => {
    const { rt, klasseOf } = setup({ E: 3, '1': 3 })
    const running = advance(advance(rt, 1000), 2000)
    const after = shiftClass(running, 'E', klasseOf, 1)
    expect(after.slots.slice(0, 2).map((s) => s.id)).toEqual([rt.slots[0].id, rt.slots[1].id])
    expect(after.history).toEqual(running.history)
  })

  it('läuft am Ende der Liste nicht über', () => {
    const { rt, list, klasseOf } = setup({ E: 2, '1': 2 })
    const after = shiftClass(rt, 'E', klasseOf, 99)
    expect(after.slots).toHaveLength(4)
    expect(pattern(after, list)).toBe('11EE')
  })
})

describe('Lauf-Freigabe', () => {
  it('gibt anfangs nur Lauf 1 frei', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 3)
    expect(rt.releasedLauf).toBe(1)
    expect(releasedSlots(rt)).toHaveLength(4)
    expect(pendingSlots(rt)).toHaveLength(12)
  })

  it('schaltet am Ende von Lauf 1 nicht von selbst in Lauf 2', () => {
    // Lauf 2 ist am Nachmittag, Lauf 3 am nächsten Tag – die Tafel darf nach
    // dem letzten Starter nicht einfach weiterlaufen.
    let rt = setup({ E: 2, '1': 2 }, 3).rt
    for (let i = 0; i < 4; i++) rt = advance(rt, 1000 * i)

    expect(laufComplete(rt)).toBe(true)
    expect(nextSlot(rt)).toBeNull()

    const unveraendert = advance(rt, 99_000)
    expect(unveraendert.history).toHaveLength(4)
    expect(currentSlot(unveraendert)?.lauf).toBe(1)
  })

  it('nennt den nächsten freizugebenden Lauf', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 3)
    expect(nextReleasableLauf(rt)).toBe(2)
    expect(nextReleasableLauf(releaseLauf(rt, 2))).toBe(3)
    expect(nextReleasableLauf(releaseLauf(rt, 3))).toBeNull()
  })

  it('läuft nach der Freigabe in Lauf 2 weiter', () => {
    let rt = setup({ E: 2, '1': 2 }, 3).rt
    for (let i = 0; i < 4; i++) rt = advance(rt, 1000 * i)

    rt = releaseLauf(rt, 2)
    expect(laufComplete(rt)).toBe(false)

    rt = advance(rt, 10_000)
    expect(currentSlot(rt)?.lauf).toBe(2)
  })

  it('nimmt einen nach hinten geschobenen Lauf-1-Start in die Liste für Lauf 2 mit', () => {
    // Der Fall aus der Praxis: Jemand holt seinen ersten Lauf erst kurz vor
    // Beginn von Lauf 2 nach. Sein Start ist ein Lauf-1-Start, bleibt also
    // freigegeben – und steht an der Stelle, an die er verschoben wurde.
    let rt = setup({ E: 2, '1': 2 }, 3).rt
    const nachzuegler = rt.slots[0]

    rt = moveSlotToAnchor(rt, nachzuegler.id, { kind: 'beforeLauf', lauf: 2 })
    for (let i = 0; i < 3; i++) rt = advance(rt, 1000 * i)

    // Die drei anderen Starts aus Lauf 1 sind durch, der Nachzügler steht noch.
    expect(nextSlot(rt)?.id).toBe(nachzuegler.id)

    rt = releaseLauf(rt, 2)
    // Und er kommt vor den Startern aus Lauf 2 an die Reihe.
    expect(releasedSlots(rt)[0].id).toBe(nachzuegler.id)
    expect(releasedSlots(rt)[1].lauf).toBe(2)
  })

  it('holt beim Weiterschalten keinen Starter aus einem gesperrten Lauf vor', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 2)
    const alleLauf1 = releasedSlots(rt)
    expect(alleLauf1.every((s) => s.lauf === 1)).toBe(true)
  })

  it('lässt sich eine Freigabe zurücknehmen, aber nie unter Lauf 1', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 3)
    expect(releaseLauf(rt, 2).releasedLauf).toBe(2)
    expect(releaseLauf(rt, 0).releasedLauf).toBe(1)
    expect(releaseLauf(rt, -5).releasedLauf).toBe(1)
  })

  it('verschiebt eine Klasse nur innerhalb des freigegebenen Laufs', () => {
    const { rt, list, klasseOf } = setup({ E: 3, '1': 3 }, 2)
    const after = shiftClass(rt, 'E', klasseOf, 1)

    const byId = new Map(list.map((s) => [s.id, s]))
    const muster = (lauf: number) =>
      after.slots.filter((s) => s.lauf === lauf).map((s) => byId.get(s.starterId)?.klasse).join('')

    expect(muster(1)).toBe('1E1E1E')
    // Lauf 2 ist noch gesperrt und bleibt unangetastet.
    expect(muster(2)).toBe('E1E1E1')
  })
})

describe('Verzahnung beim Verschieben erhalten', () => {
  /** Spur-Zuordnung wie bei zwei Klassen auf zwei Spuren: E → 0, 1 → 1. */
  function trackLookup(list: Starter[]) {
    const byId = new Map(list.map((s) => [s.id, s.klasse]))
    return (starterId: string): number | null => {
      const klasse = byId.get(starterId)
      if (!klasse) return null
      return klasse === 'E' ? 0 : 1
    }
  }

  function zwoSpuren() {
    const base = setup({ E: 4, '1': 4 })
    return { ...base, options: { keepInterleave: true, trackOf: trackLookup(base.list) } }
  }

  it('hält das Wechselmuster, wenn ein Starter mittendrin woanders hin geht', () => {
    const { rt, list, options } = zwoSpuren()
    expect(pattern(rt, list)).toBe('E1E1E1E1')

    const after = moveSlotToIndex(rt, rt.slots[0].id, 3, options)

    expect(pattern(after, list)).toBe('E1E1E1E1')
    // Er ist wirklich gewandert – nur eben auf einen Platz seiner eigenen Spur.
    expect(after.slots[0].id).not.toBe(rt.slots[0].id)
    expect(after.slots[2].id).toBe(rt.slots[0].id)
  })

  it('zerreißt das Muster, wenn die Verzahnung abgeschaltet ist', () => {
    const { rt, list } = zwoSpuren()
    const after = moveSlotToIndex(rt, rt.slots[0].id, 3, {
      keepInterleave: false,
      trackOf: () => null,
    })

    // Genau das bisherige Verhalten: Der Starter landet exakt am Ziel – und
    // damit stehen zwei aus Klasse E hintereinander.
    expect(pattern(after, list)).toBe('1E1EE1E1')
  })

  it('macht aus einem Starter am Ende den letzten seiner Spur', () => {
    const { rt, list, options } = zwoSpuren()
    const after = moveSlotToIndex(rt, rt.slots[0].id, 7, options)

    expect(pattern(after, list)).toBe('E1E1E1E1')
    const eigeneSpur = after.slots.filter((_, i) => i % 2 === 0).map((s) => s.id)
    expect(eigeneSpur[eigeneSpur.length - 1]).toBe(rt.slots[0].id)
  })

  it('lässt die andere Spur vollständig unangetastet', () => {
    const { rt, list, options } = zwoSpuren()
    const andereVorher = rt.slots.filter((_, i) => i % 2 === 1).map((s) => s.id)

    const after = moveSlotToIndex(rt, rt.slots[0].id, 5, options)

    expect(after.slots.filter((_, i) => i % 2 === 1).map((s) => s.id)).toEqual(andereVorher)
    expect(pattern(after, list)).toBe('E1E1E1E1')
  })

  it('springt beim Schrittweise-Verschieben eine Position der eigenen Spur', () => {
    const { rt, options } = zwoSpuren()
    // Ein Schritt um eine Listenposition würde auf einem Platz der anderen Spur
    // landen – der Starter bliebe stehen. Gezählt wird deshalb in seiner Spur.
    const after = moveSlot(rt, rt.slots[0].id, 1, options)

    expect(after.slots[0].id).toBe(rt.slots[2].id)
    expect(after.slots[2].id).toBe(rt.slots[0].id)
    expect(after.slots[1].id).toBe(rt.slots[1].id)
  })

  it('bewegt beim Schrittweise-Verschieben ohne Verzahnung nur eine Position', () => {
    const { rt } = zwoSpuren()
    const after = moveSlot(rt, rt.slots[0].id, 1)
    expect(after.slots[1].id).toBe(rt.slots[0].id)
  })

  it('rührt bereits gefahrene Starts nicht an', () => {
    const { rt, options } = zwoSpuren()
    const running = advance(advance(rt, 1000), 2000)
    const after = moveSlotToIndex(running, running.slots[4].id, 7, options)

    expect(after.slots.slice(0, 2).map((s) => s.id)).toEqual([rt.slots[0].id, rt.slots[1].id])
    expect(after.history).toEqual(running.history)
  })

  it('lässt sich ein gefahrener Start nicht verschieben', () => {
    const { rt, options } = zwoSpuren()
    const running = advance(rt, 1000)
    expect(moveSlotToIndex(running, running.slots[0].id, 6, options)).toBe(running)
  })

  it('fällt auf einfaches Verschieben zurück, wenn die Spur unbekannt ist', () => {
    // Etwa direkt nach einem Import, bevor die Verzahnung wieder passt.
    const { rt, list } = zwoSpuren()
    const after = moveSlotToIndex(rt, rt.slots[0].id, 3, {
      keepInterleave: true,
      trackOf: () => null,
    })
    expect(pattern(after, list)).toBe('1E1EE1E1')
  })
})

describe('moveSlotToAnchor', () => {
  it('setzt einen Start ans Ende eines Laufs', () => {
    const { rt, list } = setup({ E: 2, '1': 2 }, 3)
    const lauf3 = rt.slots.find((s) => s.lauf === 3)!
    const after = moveSlotToAnchor(rt, lauf3.id, { kind: 'afterLauf', lauf: 2 })

    const index = after.slots.findIndex((s) => s.id === lauf3.id)
    // Direkt hinter dem letzten Start aus Lauf 2.
    expect(after.slots[index - 1].lauf).toBe(2)
    expect(after.slots[index + 1].lauf).toBe(3)
    expect(after.slots).toHaveLength(rt.slots.length)
    expect(list.length).toBeGreaterThan(0)
  })

  it('setzt einen Start vor den Beginn eines Laufs', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 3)
    const lauf1 = rt.slots.find((s) => s.lauf === 1)!
    const after = moveSlotToAnchor(rt, lauf1.id, { kind: 'beforeLauf', lauf: 3 })

    const index = after.slots.findIndex((s) => s.id === lauf1.id)
    expect(after.slots[index - 1].lauf).toBe(2)
    expect(after.slots[index + 1].lauf).toBe(3)
  })

  it('kennt Anfang und Ende der Liste', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 2)
    const letzter = rt.slots[rt.slots.length - 1]
    expect(moveSlotToAnchor(rt, letzter.id, { kind: 'start' }).slots[0].id).toBe(letzter.id)

    const erster = rt.slots[0]
    const ans = moveSlotToAnchor(rt, erster.id, { kind: 'end' })
    expect(ans.slots[ans.slots.length - 1].id).toBe(erster.id)
  })

  it('weicht auf den nächsthöheren Lauf aus, wenn der gesuchte fehlt', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 2)
    const erster = rt.slots[0]
    // Lauf 5 gibt es nicht – dann bleibt nur das Ende.
    const after = moveSlotToAnchor(rt, erster.id, { kind: 'afterLauf', lauf: 5 })
    expect(after.slots[after.slots.length - 1].id).toBe(erster.id)
  })

  it('schiebt keinen Start vor die bereits gefahrenen', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 2)
    const running = advance(advance(rt, 1000), 2000)
    const offener = running.slots[3]
    const after = moveSlotToAnchor(running, offener.id, { kind: 'start' })

    expect(after.slots.findIndex((s) => s.id === offener.id)).toBeGreaterThanOrEqual(2)
    expect(after.slots.slice(0, 2).map((s) => s.id)).toEqual([rt.slots[0].id, rt.slots[1].id])
  })

  it('lässt einen gefahrenen Start unverändert', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 2)
    const running = advance(rt, 1000)
    expect(moveSlotToAnchor(running, running.slots[0].id, { kind: 'end' })).toBe(running)
  })
})

describe('laeufeOf', () => {
  it('nennt die vorhandenen Läufe aufsteigend', () => {
    const { rt } = setup({ E: 2, '1': 2 }, 3)
    expect(laeufeOf(rt)).toEqual([1, 2, 3])
  })

  it('liefert für eine leere Liste nichts', () => {
    expect(laeufeOf(emptyRuntime('p1'))).toEqual([])
  })
})

describe('Listenpflege', () => {
  it('verschiebt einen Slot um n Positionen', () => {
    const { rt } = setup({ E: 3, '1': 3 })
    const after = moveSlot(rt, rt.slots[0].id, 2)
    expect(after.slots[2].id).toBe(rt.slots[0].id)
  })

  it('fügt einen nachzuholenden Lauf als nächsten ein', () => {
    const { rt, list } = setup({ E: 2, '1': 2 })
    const after = insertSlot(rt, list[0].id, 2, 'next')
    expect(after.slots[0].starterId).toBe(list[0].id)
    expect(after.slots[0].lauf).toBe(2)
    expect(after.slots).toHaveLength(5)
  })

  it('entfernt offene Slots, aber keine gefahrenen', () => {
    const { rt } = setup({ E: 2, '1': 2 })
    const running = advance(rt, 1000)
    expect(removeSlot(running, rt.slots[0].id).slots).toHaveLength(4)
    expect(removeSlot(running, rt.slots[3].id).slots).toHaveLength(3)
  })

  it('räumt Slots gelöschter Starter weg, behält aber die Historie', () => {
    const { rt, list } = setup({ E: 2, '1': 2 }, 2)
    const running = advance(rt, 1000)
    // Der Starter, der bereits gefahren ist, wird aus der Liste gelöscht.
    const gone = currentSlot(running)!.starterId
    const after = pruneSlots(running, new Set(list.filter((s) => s.id !== gone).map((s) => s.id)))

    // Sein gefahrener Start bleibt für die Historie und die Zeitmessung erhalten …
    expect(after.slots.filter((s) => s.starterId === gone)).toHaveLength(1)
    expect(after.history).toEqual(running.history)
    // … sein offener Start im zweiten Lauf ist weg.
    expect(pendingSlots(after).some((s) => s.starterId === gone)).toBe(false)
    expect(pendingSlots(after)).toHaveLength(6)
  })
})
