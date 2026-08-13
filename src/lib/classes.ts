import type { ClassId } from '../types'

export interface ClassDef {
  id: ClassId
  label: string
  /** Farbe zur visuellen Kennzeichnung in Listen und Verzahnung. */
  color: string
}

/**
 * Klassen des Motorbootslalom. Die Reihenfolge ist die kanonische Startfolge –
 * darauf verlassen sich Verzahnung und Sortierung.
 */
export const CLASSES: ClassDef[] = [
  { id: 'E', label: 'Klasse E', color: '#8b5cf6' },
  { id: '1', label: 'Klasse 1', color: '#3b82f6' },
  { id: '2', label: 'Klasse 2', color: '#06b6d4' },
  { id: '3', label: 'Klasse 3', color: '#10b981' },
  { id: '4', label: 'Klasse 4', color: '#eab308' },
  { id: '5', label: 'Klasse 5', color: '#f97316' },
  { id: '6', label: 'Klasse 6', color: '#ef4444' },
  { id: '7', label: 'Klasse 7', color: '#ec4899' },
]

export const CLASS_IDS: ClassId[] = CLASSES.map((c) => c.id)

const CLASS_MAP = new Map<ClassId, ClassDef>(CLASSES.map((c) => [c.id, c]))

export function getClass(id: ClassId): ClassDef {
  const c = CLASS_MAP.get(id)
  if (!c) throw new Error(`Unbekannte Klasse: ${id}`)
  return c
}

export function classColor(id: ClassId): string {
  return getClass(id).color
}

/** Position einer Klasse in der kanonischen Reihenfolge. */
export function classOrder(id: ClassId): number {
  return CLASS_IDS.indexOf(id)
}

/** Klasse aus Freitext lesen (E/D/Dolphin → 'E', Ziffern 1–7). */
export function parseKlasse(raw: string): ClassId | null {
  const s = raw.trim().toUpperCase()
  if (s === 'E' || s === 'D' || s === 'DOLPHIN') return 'E'
  if ((CLASS_IDS as string[]).includes(s)) return s as ClassId
  return null
}
