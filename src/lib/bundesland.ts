/**
 * Bundesländer erkennen – für die Flagge vor dem Bundesland auf der Tafel.
 *
 * Das Bundesland kommt als freier Text aus dem Import. Erkannt werden der
 * Name, das amtliche Kürzel nach ISO 3166-2 (BB, BE, NW …) und die gängigen
 * längeren Kürzel (BRB, BER, NRW …). Groß- und Kleinschreibung, Umlaute,
 * Leerzeichen und Bindestriche spielen keine Rolle.
 *
 * Mehrdeutiges bleibt bewusst draußen: „SA“ könnte Sachsen oder Sachsen-Anhalt
 * sein, und eine falsche Flagge auf der Tafel ist schlimmer als keine.
 */

export type BundeslandCode =
  | 'bw'
  | 'by'
  | 'be'
  | 'bb'
  | 'hb'
  | 'hh'
  | 'he'
  | 'mv'
  | 'ni'
  | 'nw'
  | 'rp'
  | 'sl'
  | 'sn'
  | 'st'
  | 'sh'
  | 'th'

/** Je Land: Name, weitere Schreibweisen und Kürzel. Der Code selbst gilt immer. */
const SCHREIBWEISEN: Record<BundeslandCode, string[]> = {
  bw: ['Baden-Württemberg', 'BaWü', 'BWB'],
  by: ['Bayern', 'Freistaat Bayern', 'BAY'],
  be: ['Berlin', 'B', 'BER', 'BLN'],
  bb: ['Brandenburg', 'BRB', 'BRA'],
  hb: ['Bremen', 'Freie Hansestadt Bremen', 'HB', 'BRE'],
  hh: ['Hamburg', 'Freie und Hansestadt Hamburg', 'HAM'],
  he: ['Hessen', 'HES'],
  mv: ['Mecklenburg-Vorpommern', 'MVP', 'MEV'],
  ni: ['Niedersachsen', 'NDS'],
  nw: ['Nordrhein-Westfalen', 'NRW'],
  rp: ['Rheinland-Pfalz', 'RLP'],
  sl: ['Saarland', 'SAR', 'SAL'],
  sn: ['Sachsen', 'Freistaat Sachsen', 'SAC', 'SAX'],
  st: ['Sachsen-Anhalt', 'LSA', 'SAN'],
  sh: ['Schleswig-Holstein', 'SHO'],
  th: ['Thüringen', 'Freistaat Thüringen', 'THÜ', 'THU'],
}

/** „Thüringen“, „thueringen“, „THÜRINGEN “ → „thueringen“. */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '')
}

const NACH_SCHREIBWEISE = new Map<string, BundeslandCode>()
for (const [code, namen] of Object.entries(SCHREIBWEISEN) as [BundeslandCode, string[]][]) {
  NACH_SCHREIBWEISE.set(code, code)
  for (const name of namen) NACH_SCHREIBWEISE.set(normalize(name), code)
}

/** Für die Prüfung, dass keine Schreibweise zwei Ländern zugeordnet ist. */
export const ALLE_SCHREIBWEISEN = SCHREIBWEISEN

/** Das Land zu einer Angabe aus der Starterliste – oder `null`, wenn unklar. */
export function bundeslandCode(text: string): BundeslandCode | null {
  if (!text) return null
  return NACH_SCHREIBWEISE.get(normalize(text)) ?? null
}

/**
 * Die Flaggen liegen als Dateien bei (`src/assets/flags`, Herkunft siehe
 * README dort). Vite macht daraus Adressen; in der Single-File-Fassung stecken
 * sie als Data-URL mit in der einen Datei.
 */
const FLAGGEN = import.meta.glob<string>('../assets/flags/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** Adresse der Flagge zu einer Angabe aus der Starterliste – oder `null`. */
export function flaggeZu(text: string): string | null {
  const code = bundeslandCode(text)
  return code ? (FLAGGEN[`../assets/flags/${code}.svg`] ?? null) : null
}
