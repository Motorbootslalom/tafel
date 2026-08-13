/**
 * Adresse des Relais herausfinden.
 *
 * Wird die Seite vom Mini-Programm ausgeliefert, muss niemand eine Adresse
 * abtippen – sie steht schon in der Adresszeile. Nur: Der Browser kennt genau
 * die eine Adresse, über die er geladen hat, und das ist oft `localhost`. Damit
 * kann ein Handy nichts anfangen.
 *
 * Deshalb fragt die Anwendung den Server nach **allen** Adressen, unter denen er
 * im Netz erreichbar ist – dieselben, die er beim Start ausgibt.
 */

export interface RelayAddresses {
  /** WebSocket-Adressen für das Feld „Adresse des Relais". */
  relais: string[]
  /** Dieselben Adressen als Seitenaufruf. */
  seite: string[]
}

interface LocationLike {
  protocol: string
  host: string
}

/**
 * Leitet die Relais-Adresse aus der aktuellen Seitenadresse ab. Liefert `null`,
 * wenn die Seite als Datei geöffnet wurde – dann gibt es keinen Server.
 */
export function guessRelayUrl(loc: LocationLike = location): string | null {
  if (loc.protocol === 'https:') return `wss://${loc.host}/ws`
  if (loc.protocol === 'http:') return `ws://${loc.host}/ws`
  return null
}

/** Prüft die Antwort des Servers, bevor sie in die Oberfläche läuft. */
export function parseRelayAddresses(value: unknown): RelayAddresses | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<RelayAddresses>
  const isStrings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === 'string')
  if (!isStrings(data.relais)) return null
  return { relais: data.relais, seite: isStrings(data.seite) ? data.seite : [] }
}

/**
 * Fragt das Mini-Programm nach seinen Adressen.
 *
 * Schlägt fehl, sobald die Seite nicht von ihm kommt (GitHub Pages, einzelne
 * Datei) – das ist der Normalfall und kein Fehler, deshalb einfach `null`.
 */
export async function fetchRelayAddresses(timeoutMs = 2000): Promise<RelayAddresses | null> {
  if (typeof fetch !== 'function' || guessRelayUrl() === null) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('adressen', { signal: controller.signal })
    if (!response.ok) return null
    return parseRelayAddresses(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Wählt aus den bekannten Adressen die passende Vorauswahl: bevorzugt die, über
 * die diese Seite geladen wurde – sie ist erwiesenermaßen erreichbar.
 */
export function preferredRelay(
  addresses: string[],
  loc: LocationLike = location,
): string | undefined {
  const eigene = guessRelayUrl(loc)
  return addresses.find((a) => a === eigene) ?? addresses[0]
}
