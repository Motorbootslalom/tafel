import { beforeEach, describe, expect, it } from 'vitest'
import { deviceId, uid, windowId } from './ids'

describe('uid', () => {
  it('erzeugt unterschiedliche IDs mit dem gewünschten Präfix', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uid('slot')))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id.startsWith('slot_')).toBe(true)
  })
})

describe('deviceId', () => {
  beforeEach(() => localStorage.clear())

  it('bleibt über mehrere Aufrufe gleich', () => {
    expect(deviceId()).toBe(deviceId())
  })

  it('überlebt einen Reload, weil sie im localStorage liegt', () => {
    const first = deviceId()
    expect(localStorage.getItem('tafel:device-id')).toBe(first)
  })
})

describe('windowId', () => {
  it('unterscheidet sich von der Geräte-ID', () => {
    // Tafel und Bedienung laufen in zwei Fenstern desselben Browsers und teilen
    // sich damit den localStorage. Wäre die Absender-Kennung dieselbe, würde
    // jedes Fenster die Nachrichten des anderen für seine eigenen halten und
    // verwerfen – die Tafel bliebe stehen.
    expect(windowId()).not.toBe(deviceId())
  })

  it('bleibt innerhalb desselben Fensters stabil', () => {
    expect(windowId()).toBe(windowId())
  })
})
