/**
 * Kurze, kollisionsarme IDs. Bewusst nicht `crypto.randomUUID()`, weil das auf
 * `file://` in älteren Browsern fehlen kann und die IDs hier nur lokal eindeutig
 * sein müssen.
 */
export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

const DEVICE_ID_KEY = 'tafel:device-id'

/**
 * Stabile ID dieses Browsers/Geräts. Überlebt Reloads und identifiziert das
 * Gerät gegenüber dem Host bei der Rechtevergabe.
 */
export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const fresh = uid('dev')
    localStorage.setItem(DEVICE_ID_KEY, fresh)
    return fresh
  } catch {
    // Privater Modus o. ä.: für diese Sitzung eine flüchtige ID nutzen.
    return uid('dev')
  }
}

/**
 * Kennung **dieses Fensters** – nicht dieses Geräts. Wird bei jedem Seitenaufruf
 * neu vergeben und nirgends gespeichert.
 *
 * Der Unterschied ist für die Basis-Version entscheidend: Tafel und Bedienung
 * laufen in zwei Fenstern desselben Browsers und teilen sich damit den
 * localStorage. Bekämen beide dieselbe Kennung, würde jedes Fenster die
 * Nachrichten des anderen für seine eigenen halten und verwerfen – die Tafel
 * bliebe stehen, bis sie neu geladen wird.
 *
 * Bewusst **ohne** `sessionStorage`: Ein per „Tafel öffnen“ (`window.open`)
 * gestartetes Fenster bekommt davon eine Kopie mit – die beiden Fenster hätten
 * also wieder dieselbe Kennung. Da die Kennung nur dazu dient, eigene
 * Nachrichten zu erkennen, muss sie einen Reload gar nicht überleben.
 */
const WINDOW_ID = uid('win')

export function windowId(): string {
  return WINDOW_ID
}
