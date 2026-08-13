import type { Starter } from '../types'
import { parseKlasse } from './classes'
import { fillMissingStartNumbers } from './startnumbers'
import { uid } from './ids'

const TAB = '\t'

/** Logische Spalten, die der Import kennt. */
type Field = 'startNr' | 'klasse' | 'nachname' | 'vorname' | 'verein' | 'bundesland' | 'geburtsdatum'

/** Kopfzeilen-Aliasse (normalisiert, kleingeschrieben) → logische Spalte. */
const HEADER_ALIASES: Record<string, Field> = {
  startnummer: 'startNr',
  startnr: 'startNr',
  'start-nr': 'startNr',
  'start-nr.': 'startNr',
  's-nr': 'startNr',
  's-nr.': 'startNr',
  snr: 'startNr',
  nr: 'startNr',
  klasse: 'klasse',
  kl: 'klasse',
  'kl.': 'klasse',
  class: 'klasse',
  ak: 'klasse',
  nachname: 'nachname',
  name: 'nachname',
  familienname: 'nachname',
  surname: 'nachname',
  lastname: 'nachname',
  vorname: 'vorname',
  firstname: 'vorname',
  verein: 'verein',
  club: 'verein',
  mannschaft: 'verein',
  bundesland: 'bundesland',
  land: 'bundesland',
  region: 'bundesland',
  state: 'bundesland',
  geburtsdatum: 'geburtsdatum',
  geburtstag: 'geburtsdatum',
  'geb.-datum': 'geburtsdatum',
  'geb.': 'geburtsdatum',
  geb: 'geburtsdatum',
  gebdatum: 'geburtsdatum',
  birthdate: 'geburtsdatum',
  birthday: 'geburtsdatum',
}

/** Feste Spaltenreihenfolge, wenn keine Kopfzeile erkannt wird. */
const FIXED_ORDER: Field[] = [
  'startNr',
  'klasse',
  'nachname',
  'vorname',
  'verein',
  'bundesland',
  'geburtsdatum',
]

export const FIXED_ORDER_LABEL =
  'Startnummer · Klasse · Nachname · Vorname · Verein · Bundesland · Geburtsdatum'

function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, '')
}

/** Erkennt eine Kopfzeile ab zwei bekannten Spaltennamen. */
function detectHeader(cells: string[]): Field[] | null {
  const mapped = cells.map((c) => HEADER_ALIASES[normalizeHeaderCell(c)])
  const known = mapped.filter(Boolean).length
  return known >= 2 ? mapped.map((f) => f ?? ('' as Field)) : null
}

/** Geburtsdatum nach ISO normalisieren; toleriert TT.MM.JJJJ und reine Jahre. */
function parseGeburtsdatum(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (de) return `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`
  const yr = s.match(/^(\d{4})$/)
  if (yr) return `${yr[1]}-01-01`
  return s
}

export interface ImportSkip {
  line: number
  raw: string
  reason: string
}

export interface ImportResult {
  starters: Starter[]
  usedHeader: boolean
  imported: number
  skipped: ImportSkip[]
}

/**
 * Parst eine aus Excel kopierte TSV-Starterliste. Eine Kopfzeile wird
 * automatisch erkannt (Spaltenreihenfolge dann egal); fehlt sie, gilt
 * {@link FIXED_ORDER}. Zeilen ohne gültige Klasse oder ohne Namen werden
 * übersprungen und in `skipped` gemeldet.
 *
 * Eine Lauf-Spalte wird bewusst **nicht** gelesen: Läufe entstehen erst beim
 * Erzeugen der Startliste, damit ein Starter seinen Lauf jederzeit an anderer
 * Stelle fahren kann.
 */
export function parseStartersTsv(text: string): ImportResult {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim() !== '')

  const skipped: ImportSkip[] = []
  if (lines.length === 0) return { starters: [], usedHeader: false, imported: 0, skipped }

  const header = detectHeader(lines[0].split(TAB))
  const usedHeader = header !== null
  const fields = header ?? FIXED_ORDER
  const dataLines = usedHeader ? lines.slice(1) : lines

  const starters: Starter[] = []
  dataLines.forEach((line, idx) => {
    const lineNo = usedHeader ? idx + 2 : idx + 1
    const cells = line.split(TAB)
    const get = (f: Field): string => {
      const i = fields.indexOf(f)
      return i >= 0 && i < cells.length ? cells[i].trim() : ''
    }

    const klasse = parseKlasse(get('klasse'))
    if (!klasse) {
      skipped.push({ line: lineNo, raw: line, reason: `unbekannte Klasse „${get('klasse')}"` })
      return
    }
    const nachname = get('nachname')
    const vorname = get('vorname')
    if (!nachname && !vorname) {
      skipped.push({ line: lineNo, raw: line, reason: 'kein Name' })
      return
    }

    starters.push({
      id: uid('s'),
      startNr: get('startNr'),
      vorname,
      nachname,
      verein: get('verein'),
      bundesland: get('bundesland'),
      geburtsdatum: parseGeburtsdatum(get('geburtsdatum')),
      klasse,
    })
  })

  fillMissingStartNumbers(starters)
  return { starters, usedHeader, imported: starters.length, skipped }
}

function formatGeburtsdatum(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso
}

function tsvRow(cells: (string | number)[]): string {
  return cells.map((c) => String(c).replace(/[\t\n\r]/g, ' ')).join(TAB)
}

/** Starterliste als TSV – round-trip-fähig, direkt nach Excel kopierbar. */
export function formatStartersTsv(starters: Starter[]): string {
  const header = tsvRow([
    'Startnummer',
    'Klasse',
    'Nachname',
    'Vorname',
    'Verein',
    'Bundesland',
    'Geburtsdatum',
  ])
  const rows = starters.map((s) =>
    tsvRow([
      s.startNr,
      s.klasse,
      s.nachname,
      s.vorname,
      s.verein,
      s.bundesland,
      formatGeburtsdatum(s.geburtsdatum),
    ]),
  )
  return [header, ...rows].join('\n')
}
