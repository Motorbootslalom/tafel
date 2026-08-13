import type { AppState } from '../types'

const STATE_KEY = 'tafel:state:v1'

/**
 * Persistenz im localStorage. Bewusst tolerant: ein kaputter oder veralteter
 * Eintrag darf die Tafel nicht am Starten hindern – im Zweifel wird neu
 * aufgesetzt.
 */
export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.starters) || !Array.isArray(parsed.parcoursList)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // Speicher voll oder nicht verfügbar (privater Modus) – der Betrieb läuft
    // weiter, nur ohne Persistenz.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STATE_KEY)
  } catch {
    // ignorieren
  }
}

/**
 * Aufbau einer Sicherungsdatei.
 *
 * Der Zustand steckt in einem Umschlag mit Kennung und Zeitstempel – so lässt
 * sich beim Laden erkennen, ob die Datei überhaupt zu diesem Werkzeug gehört,
 * und der Benutzer sieht vor dem Übernehmen, von wann sie ist.
 */
export interface Backup {
  app: 'tafel'
  version: 1
  savedAt: string
  state: AppState
}

export const BACKUP_MARKER = 'tafel'

/** Exportiert den Zustand als JSON-Datei (Sicherung vor der Veranstaltung). */
export function downloadState(state: AppState, filename: string): void {
  const backup: Backup = {
    app: BACKUP_MARKER,
    version: 1,
    savedAt: new Date().toISOString(),
    state,
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type BackupResult =
  | { ok: true; state: AppState; savedAt: string | null }
  | { ok: false; reason: string }

/**
 * Liest eine Sicherungsdatei.
 *
 * Die Datei kommt von der Festplatte und kann alles Mögliche enthalten –
 * deshalb wird nichts vorausgesetzt. Ältere Sicherungen ohne Umschlag (der
 * Zustand stand direkt in der Datei) werden weiterhin gelesen.
 */
export function parseBackup(text: string): BackupResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'Die Datei ist kein gültiges JSON.' }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'Die Datei enthält keine Sicherung.' }
  }

  const envelope = parsed as Partial<Backup>
  const candidate =
    envelope.app === BACKUP_MARKER && envelope.state ? envelope.state : (parsed as AppState)
  const savedAt = typeof envelope.savedAt === 'string' ? envelope.savedAt : null

  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, reason: 'Die Datei enthält keine Sicherung.' }
  }
  if (!Array.isArray(candidate.starters) || !Array.isArray(candidate.parcoursList)) {
    return {
      ok: false,
      reason: 'Die Datei gehört nicht zur Tafel – Starterliste und Parcours fehlen.',
    }
  }

  return { ok: true, state: candidate, savedAt }
}
