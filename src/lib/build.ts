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
