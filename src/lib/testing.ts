import type { ClassId, Parcours, Starter, WechselFaktor } from '../types'
import { makeStartNr } from './startnumbers'

/** Baut Test-Starter: `starters({ E: 2, '1': 3 })` → E01, E02, 101, 102, 103. */
export function starters(counts: Partial<Record<ClassId, number>>): Starter[] {
  const out: Starter[] = []
  for (const [klasse, n] of Object.entries(counts) as [ClassId, number][]) {
    for (let i = 1; i <= n; i++) {
      const startNr = makeStartNr(klasse, i)
      out.push({
        id: `s_${startNr}`,
        startNr,
        vorname: `Vor${i}`,
        nachname: `Nach${klasse}${i}`,
        verein: `Verein ${klasse}`,
        bundesland: 'Brandenburg',
        geburtsdatum: '',
        klasse,
      })
    }
  }
  return out
}

export function parcours(classIds: ClassId[], wechselFaktor: WechselFaktor = 2): Parcours {
  return { id: 'p1', name: 'Parcours 1', classIds, wechselFaktor }
}

/** Klassen-Nachschlag für die Startlisten-Funktionen. */
export function klasseLookup(list: Starter[]): (starterId: string) => ClassId | null {
  const map = new Map(list.map((s) => [s.id, s.klasse]))
  return (id) => map.get(id) ?? null
}

/** Kompakte Klassenfolge einer Sequenz, z. B. "E1E1E" – gut zum Vergleichen. */
export function classPattern(list: { klasse: ClassId }[]): string {
  return list.map((s) => s.klasse).join('')
}
