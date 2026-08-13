/**
 * Namen für Bediengeräte.
 *
 * Am Steg soll niemand ein Namensfeld ausfüllen müssen, während der nächste
 * Starter schon wartet. Das Gerät schlägt deshalb selbst etwas vor, und der Host
 * sorgt dafür, dass der Name eindeutig bleibt – nur er kennt alle Geräte.
 */

/**
 * Vorschlag aus der Geräte-Kennung des Browsers.
 *
 * Bewusst grob: „iPhone" oder „Android-Handy" reicht, um in der Geräteliste zu
 * erkennen, welches Telefon gemeint ist. Genauer geht ohnehin nicht verlässlich.
 *
 * Bekannte Ungenauigkeit: Neuere iPads melden sich als Mac. Das lässt sich am
 * Text allein nicht unterscheiden; die Oberfläche zieht dafür die Touch-Fähigkeit
 * hinzu (siehe {@link suggestDeviceName}).
 */
export function deviceNameFromUserAgent(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android-Handy' : 'Android-Tablet'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows-Rechner'
  if (/Linux|X11/i.test(ua)) return 'Linux-Rechner'
  return 'Gerät'
}

/**
 * Vorschlag für dieses Gerät. Ein Mac mit Mehrfinger-Bedienung ist in Wahrheit
 * ein iPad – seit iPadOS meldet es sich als Mac.
 */
export function suggestDeviceName(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  touchPoints: number = typeof navigator === 'undefined' ? 0 : (navigator.maxTouchPoints ?? 0),
): string {
  const name = deviceNameFromUserAgent(ua)
  if (name === 'Mac' && touchPoints > 1) return 'iPad'
  return name
}

/**
 * Macht einen Namen eindeutig, indem eine Zahl angehängt wird: „iPhone",
 * „iPhone 2", „iPhone 3". Endet der Wunsch schon auf eine Zahl, wird ab dieser
 * weitergezählt – aus „Steg 2" wird „Steg 3" und nicht „Steg 2 2".
 */
export function uniqueDeviceName(wunsch: string, vergeben: Iterable<string>): string {
  const gewuenscht = wunsch.trim() || 'Gerät'
  const belegt = new Set([...vergeben].map((n) => n.trim().toLowerCase()))
  if (!belegt.has(gewuenscht.toLowerCase())) return gewuenscht

  const match = gewuenscht.match(/^(.*?)\s*(\d+)$/)
  const stamm = (match ? match[1] : gewuenscht).trim() || 'Gerät'
  const start = match ? Number(match[2]) + 1 : 2

  for (let n = start; n < start + 1000; n++) {
    const kandidat = `${stamm} ${n}`
    if (!belegt.has(kandidat.toLowerCase())) return kandidat
  }
  return `${stamm} ${Date.now()}`
}
