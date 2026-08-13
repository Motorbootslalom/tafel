import type { ClassId, Starter } from '../types'
import { CLASS_IDS, classOrder } from './classes'

/** Zweistellig auffüllen (E → E01); größere Zahlen bleiben unverändert. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Baut eine klassenbasierte Startnummer aus Klasse und laufender Nummer. */
export function makeStartNr(klasse: ClassId, n: number): string {
  return klasse + pad2(n)
}

/**
 * Liest die laufende Nummer aus einer klassenbasierten Startnummer (Präfix +
 * Zahl). Liefert `null`, wenn kein numerischer Teil vorhanden ist.
 */
export function parseClassNumber(startNr: string, klasse: ClassId): number | null {
  const num = parseInt(startNr.slice(klasse.length), 10)
  return Number.isNaN(num) ? null : num
}

/** Sortierschlüssel innerhalb einer Klasse: nach Nummer, fehlende ans Ende. */
function byNumber(a: Starter, b: Starter): number {
  const na = parseClassNumber(a.startNr, a.klasse) ?? Number.MAX_SAFE_INTEGER
  const nb = parseClassNumber(b.startNr, b.klasse) ?? Number.MAX_SAFE_INTEGER
  if (na !== nb) return na - nb
  return a.startNr.localeCompare(b.startNr, 'de', { numeric: true })
}

/** Starter in Startnummern-Reihenfolge (innerhalb einer Klasse). */
export function sortedByStartNr(list: Starter[]): Starter[] {
  return [...list].sort(byNumber)
}

/**
 * Starter über alle Klassen hinweg in Startreihenfolge.
 *
 * Maßgeblich ist zuerst die Klasse in ihrer kanonischen Reihenfolge (E, 1 … 7),
 * dann die Nummer innerhalb der Klasse. Ein reiner Textvergleich der
 * Startnummern taugt hier nicht: Er stellt `101` vor `E01`, weil Ziffern vor
 * Buchstaben einsortiert werden – Klasse E gehört aber nach vorn.
 */
export function sortedByClassThenStartNr(list: Starter[]): Starter[] {
  return [...list].sort((a, b) => {
    const d = classOrder(a.klasse) - classOrder(b.klasse)
    return d !== 0 ? d : byNumber(a, b)
  })
}

/**
 * Ergänzt fehlende Startnummern. Hat eine Klasse gar keine, wird sie in
 * Eingangsreihenfolge durchnummeriert; fehlen nur einzelne, werden sie hinten
 * angehängt (höchste vorhandene Nummer + 1).
 */
export function fillMissingStartNumbers(starters: Starter[]): void {
  for (const klasse of CLASS_IDS) {
    const inClass = starters.filter((s) => s.klasse === klasse)
    if (inClass.length === 0) continue

    const withNr = inClass.filter((s) => parseClassNumber(s.startNr, klasse) !== null)
    if (withNr.length === 0) {
      inClass.forEach((s, i) => {
        s.startNr = makeStartNr(klasse, i + 1)
      })
      continue
    }

    let max = 0
    for (const s of withNr) max = Math.max(max, parseClassNumber(s.startNr, klasse) ?? 0)
    for (const s of inClass) {
      if (parseClassNumber(s.startNr, klasse) === null) s.startNr = makeStartNr(klasse, ++max)
    }
  }
}

/** Startnummern, die innerhalb ihrer Klasse doppelt vergeben sind. */
export function duplicateStartNumbers(starters: Starter[]): Set<string> {
  const seen = new Map<string, number>()
  for (const s of starters) {
    const key = `${s.klasse}|${s.startNr}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  const dupes = new Set<string>()
  for (const [key, count] of seen) if (count > 1) dupes.add(key.split('|')[1])
  return dupes
}
