import type { Starter } from '../types'

/**
 * Eine neu importierte Starterliste mit der bisherigen zusammenführen.
 *
 * Die Startlisten verweisen über die `id` auf die Starter. Bekäme beim
 * Ersetzen jeder Starter eine neue, fielen alle Einträge aus den Startlisten
 * heraus – mitten im Wettkampf, nur weil sich ein Name geändert hat. Deshalb
 * wird jeder importierte Starter dem bisherigen zugeordnet und behält dessen
 * `id`; übernommen werden nur seine Angaben.
 *
 * Wiedererkannt wird zuerst über Klasse und Startnummer, dann über Klasse und
 * Namen – so findet auch ein Starter zurück, dessen Nummer sich geändert hat
 * oder für den keine Nummer mitkam. Wer die Klasse wechselt, gilt als neu: Er
 * fährt dann womöglich auf einem anderen Parcours.
 */
export interface MergeResult {
  starters: Starter[]
  unchanged: number
  changed: Starter[]
  added: Starter[]
  removed: Starter[]
}

const nrKey = (s: Starter) => (s.startNr.trim() ? `${s.klasse}|${s.startNr.trim().toUpperCase()}` : null)

const nameKey = (s: Starter) =>
  `${s.klasse}|${`${s.vorname} ${s.nachname}`.toLowerCase().replace(/\s+/g, ' ').trim()}`

const FIELDS: (keyof Starter)[] = ['startNr', 'vorname', 'nachname', 'verein', 'bundesland', 'geburtsdatum']

export function mergeStarters(existing: Starter[], imported: Starter[]): MergeResult {
  const matchOf = new Map<Starter, Starter>()
  const taken = new Set<Starter>()

  const assign = (key: (s: Starter) => string | null) => {
    const pool = new Map<string, Starter>()
    for (const old of existing) {
      const k = key(old)
      if (k && !taken.has(old) && !pool.has(k)) pool.set(k, old)
    }
    for (const neu of imported) {
      if (matchOf.has(neu)) continue
      const k = key(neu)
      const old = k ? pool.get(k) : undefined
      if (!old || taken.has(old)) continue
      matchOf.set(neu, old)
      taken.add(old)
    }
  }
  assign(nrKey)
  assign(nameKey)

  const changed: Starter[] = []
  const added: Starter[] = []
  let unchanged = 0

  const starters = imported.map((neu) => {
    const old = matchOf.get(neu)
    if (!old) {
      added.push(neu)
      return neu
    }
    const merged: Starter = { ...neu, id: old.id, startNr: neu.startNr.trim() || old.startNr }
    if (FIELDS.some((f) => merged[f] !== old[f])) changed.push(merged)
    else unchanged++
    return merged
  })

  return { starters, unchanged, changed, added, removed: existing.filter((s) => !taken.has(s)) }
}
