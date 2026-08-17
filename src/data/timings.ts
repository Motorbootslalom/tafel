import type { TimingTable } from '../types'

/**
 * Vorkonfigurierte Startabstände je Klasse – die Grundlage der Wartezeit-Prognose,
 * solange bei einer Veranstaltung noch nichts gemessen wurde.
 *
 * Hergeleitet aus den Ergebnislisten der **Deutschen Meisterschaft 2025**
 * (Gesamt-Blätter je Klasse, Spalte „gef. Zeit", alle drei Läufe):
 *
 * | Klasse | Fahrten | Ø Fahrzeit | + Steg | Vorgabe |
 * | ------ | ------: | ---------: | -----: | ------: |
 * | E      |      27 |     87,7 s |   30 s |   120 s |
 * | 1      |      51 |     79,3 s |   30 s |   110 s |
 * | 2      |      66 |     82,9 s |   30 s |   115 s |
 * | 3      |      69 |     89,4 s |   30 s |   120 s |
 * | 4      |      69 |     91,8 s |   30 s |   120 s |
 * | 5      |      69 |    105,8 s |   30 s |   135 s |
 * | 6      |      40 |    107,0 s |   30 s |   135 s |
 * | 7      |      59 |    110,8 s |   30 s |   140 s |
 *
 * Zwei Dinge stecken in der Rechnung:
 *
 * - Die Ergebnislisten nennen die **Fahrzeit** von Start bis Ziel. Der
 *   Startabstand ist der Abstand zweier Starter auf der Tafel und schließt den
 *   Bootswechsel am Steg mit ein – dafür stehen die 30 Sekunden.
 * - Drei Zeiten sind nicht eingeflossen, weil sie keine durchgefahrenen Läufe
 *   sind, sondern Platzhalter für Abbrüche: 06:00,00 und 05:00,18 (Klasse 6)
 *   sowie 00:42,25 (Klasse 7). Nur Klasse 6 verschiebt sich dadurch nennenswert,
 *   von 117,7 s auf 107,0 s.
 *
 * Gerundet ist auf 5 s – genauer wäre die Zahl nicht, denn der Zuschlag ist eine
 * Schätzung. Klasse 3 und 4 fallen dadurch auf denselben Wert, ebenso 5 und 6.
 *
 * `samples: 0` heißt: reiner Vorgabewert, keine eigene Messung dieser
 * Veranstaltung. Sobald gemessen wird, zählt der Messwert (siehe
 * `lib/timing.estimator`).
 */
export const DM_2025_TIMINGS: TimingTable = {
  E: { avg: 120, samples: 0 },
  '1': { avg: 110, samples: 0 },
  '2': { avg: 115, samples: 0 },
  '3': { avg: 120, samples: 0 },
  '4': { avg: 120, samples: 0 },
  '5': { avg: 135, samples: 0 },
  '6': { avg: 135, samples: 0 },
  '7': { avg: 140, samples: 0 },
}

/** Frische Kopie – der Zustand darf die Vorgabe nicht versehentlich mitverändern. */
export function defaultTimings(): TimingTable {
  const out: TimingTable = {}
  for (const [klasse, wert] of Object.entries(DM_2025_TIMINGS)) {
    out[klasse as keyof TimingTable] = { ...wert }
  }
  return out
}
