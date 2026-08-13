import { beforeEach, describe, expect, it } from 'vitest'
import { BACKUP_MARKER, clearState, loadState, parseBackup, saveState } from './storage'
import { initialState } from '../state/reducer'
import { starters } from './testing'
import type { AppState } from '../types'

describe('loadState und saveState', () => {
  beforeEach(() => localStorage.clear())

  it('gibt den gespeicherten Zustand zurück', () => {
    const state: AppState = { ...initialState(), starters: starters({ E: 2 }) }
    saveState(state)
    expect(loadState()?.starters).toHaveLength(2)
  })

  it('liefert ohne Eintrag nichts', () => {
    expect(loadState()).toBeNull()
  })

  it('verschluckt sich nicht an kaputten Daten', () => {
    // Ein beschädigter Eintrag darf die Tafel nicht am Starten hindern.
    localStorage.setItem('tafel:state:v1', '{kein json')
    expect(loadState()).toBeNull()

    localStorage.setItem('tafel:state:v1', '{"starters":"keine Liste"}')
    expect(loadState()).toBeNull()
  })

  it('räumt den Eintrag wieder weg', () => {
    saveState(initialState())
    clearState()
    expect(loadState()).toBeNull()
  })
})

describe('parseBackup', () => {
  const state: AppState = { ...initialState(), eventName: 'Beetzseepokal', starters: starters({ E: 3 }) }

  function datei(inhalt: unknown): string {
    return JSON.stringify(inhalt)
  }

  it('liest eine Sicherung mit Umschlag samt Zeitstempel', () => {
    const gesichert = datei({
      app: BACKUP_MARKER,
      version: 1,
      savedAt: '2025-08-13T10:00:00.000Z',
      state,
    })

    const result = parseBackup(gesichert)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.eventName).toBe('Beetzseepokal')
    expect(result.state.starters).toHaveLength(3)
    expect(result.savedAt).toBe('2025-08-13T10:00:00.000Z')
  })

  it('liest auch eine ältere Sicherung ohne Umschlag', () => {
    // Frühere Fassungen schrieben den Zustand direkt in die Datei.
    const result = parseBackup(datei(state))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.eventName).toBe('Beetzseepokal')
    expect(result.savedAt).toBeNull()
  })

  it('meldet eine Datei, die kein JSON ist', () => {
    const result = parseBackup('das ist ein Word-Dokument')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('JSON')
  })

  it('meldet eine fremde JSON-Datei', () => {
    const result = parseBackup(datei({ irgendwas: true }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('Tafel')
  })

  it('weist Werte ab, die gar kein Objekt sind', () => {
    for (const unsinn of ['null', '[]', '"text"', '42']) {
      expect(parseBackup(unsinn).ok).toBe(false)
    }
  })

  it('weist einen Umschlag ohne verwertbaren Zustand ab', () => {
    const result = parseBackup(datei({ app: BACKUP_MARKER, version: 1, state: { starters: [] } }))
    expect(result.ok).toBe(false)
  })
})
