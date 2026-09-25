/**
 * Stand der laufenden Fassung.
 *
 * Wichtig beim Pro-Betrieb: Das Mini-Programm trägt die Anwendung **im Binary**.
 * Wer die Oberfläche ändert und nur `npm run build` ausführt, bekommt vom Server
 * weiterhin die alte Fassung ausgeliefert – erst `make` im Ordner `server/`
 * bettet die neue ein. Dieser Stempel macht den Unterschied sichtbar.
 */
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''

/** Lesbarer Stand, z. B. „14.08.2026, 00:45". Leer, wenn unbekannt. */
export function buildLabel(): string {
  if (!BUILD_TIME) return 'unbekannt'
  const date = new Date(BUILD_TIME)
  return Number.isNaN(date.getTime()) ? 'unbekannt' : date.toLocaleString('de-DE')
}

export const BUILD_COMMIT = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : ''
export const BUILD_COMMIT_TIME = typeof __BUILD_COMMIT_TIME__ === 'string' ? __BUILD_COMMIT_TIME__ : ''

/**
 * Codestand für die Fußzeile, z. B. „a925c90 vom 25.09.2026, 14:35". So lässt
 * sich am Wettkampfort ablesen, welche Fassung gerade live ist.
 */
export function commitLabel(): string {
  if (!BUILD_COMMIT) return 'unbekannt'
  const date = new Date(BUILD_COMMIT_TIME)
  return Number.isNaN(date.getTime())
    ? BUILD_COMMIT
    : `${BUILD_COMMIT} vom ${date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`
}
