/**
 * Differenz zweier JSON-Werte – und das Nachziehen auf der Gegenseite.
 *
 * Gebraucht beim Verteilen über ntfy: Der Gesamtzustand passt nie in eine
 * Nachricht (4096 Byte), eine Änderung fast immer. Bewusst eine Differenz der
 * **Daten** und nicht der Actions: Ein Handy kann eine ältere Fassung der
 * Anwendung im Zwischenspeicher haben, und auf Datenebene spielt das keine
 * Rolle.
 *
 * Die Differenz kennt keine Fachlogik. Zwei Dinge sind aber auf diese Anwendung
 * zugeschnitten, weil sie den Großteil der Änderungen ausmachen:
 *
 * - An Listen wird gemeinsamer Anfang und gemeinsames Ende abgeschnitten. Ein
 *   Weiterschalten hängt einen Eintrag an die Historie und ändert eine Zeile der
 *   Startliste – übrig bleiben zwei kleine Änderungen.
 * - Ein **einzeln verschobenes** Element wird als Verschiebung erkannt. So sieht
 *   Umsortieren per Drag & Drop aus; ohne das ginge jede Zeile dazwischen mit.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Path = (string | number)[]

export type Op =
  /** Setzen – an der Wurzel ersetzt es den ganzen Wert. */
  | { p: Path; v: Json }
  /** Schlüssel eines Objekts entfernen. */
  | { p: Path; d: 1 }
  /** Liste: ab Index `s[0]` werden `s[1]` Einträge durch die übrigen ersetzt. */
  | { p: Path; s: [number, number, ...Json[]] }
  /** Liste: ein Eintrag wandert von Index `m[0]` nach `m[1]`. */
  | { p: Path; m: [number, number] }

const isObject = (v: Json): v is { [key: string]: Json } =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export function equal(a: Json, b: Json): boolean {
  if (a === b) return true
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false
    return true
  }
  if (isObject(a)) {
    if (!isObject(b)) return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    for (const k of keys) if (!(k in b) || !equal(a[k], b[k])) return false
    return true
  }
  return false
}

const size = (ops: Op[]) => JSON.stringify(ops).length

function rangeEqual(a: Json[], from: number, b: Json[], to: number, length: number): boolean {
  for (let i = 0; i < length; i++) if (!equal(a[from + i], b[to + i])) return false
  return true
}

function diffArray(a: Json[], b: Json[], path: Path, ops: Op[]): void {
  let start = 0
  while (start < a.length && start < b.length && equal(a[start], b[start])) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && equal(a[endA - 1], b[endB - 1])) {
    endA--
    endB--
  }
  const lenA = endA - start
  const lenB = endB - start
  if (lenA === 0 && lenB === 0) return

  const replace: Op = { p: path, s: [start, lenA, ...b.slice(start, endB)] }

  if (lenA === lenB && lenA >= 2) {
    // Nach hinten verschoben: der erste Eintrag steht jetzt am Ende des Abschnitts.
    if (equal(a[start], b[endB - 1]) && rangeEqual(a, start + 1, b, start, lenA - 1)) {
      ops.push({ p: path, m: [start, endB - 1] })
      return
    }
    // Nach vorn verschoben: der letzte steht jetzt am Anfang.
    if (equal(a[endA - 1], b[start]) && rangeEqual(a, start, b, start + 1, lenA - 1)) {
      ops.push({ p: path, m: [endA - 1, start] })
      return
    }
  }

  if (lenA === lenB) {
    // Gleich lang: meist sind nur einzelne Felder einzelner Einträge anders.
    const inner: Op[] = []
    for (let i = start; i < endA; i++) diffInto(a[i], b[i], [...path, i], inner)
    ops.push(...(size(inner) <= size([replace]) ? inner : [replace]))
    return
  }

  ops.push(replace)
}

function diffInto(a: Json, b: Json, path: Path, ops: Op[]): void {
  if (a === b) return
  if (Array.isArray(a) && Array.isArray(b)) {
    diffArray(a, b, path, ops)
    return
  }
  if (isObject(a) && isObject(b)) {
    for (const k of Object.keys(b)) {
      if (k in a) diffInto(a[k], b[k], [...path, k], ops)
      else ops.push({ p: [...path, k], v: b[k] })
    }
    for (const k of Object.keys(a)) if (!(k in b)) ops.push({ p: [...path, k], d: 1 })
    return
  }
  if (equal(a, b)) return
  ops.push({ p: path, v: b })
}

/** Was aus `a` zu tun ist, damit `b` herauskommt. */
export function diff(a: Json, b: Json): Op[] {
  const ops: Op[] = []
  diffInto(a, b, [], ops)
  return ops
}

// ---------------------------------------------------------------------------
// Nachziehen
// ---------------------------------------------------------------------------

/** Schlüssel, über die sich in JavaScript Prototypen verbiegen ließen. */
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor'])

function fail(): never {
  throw new Error('Änderung passt nicht zum Stand')
}

function step(container: Json, key: string | number): Json {
  if (Array.isArray(container)) {
    if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key >= container.length) fail()
    return container[key]
  }
  if (isObject(container)) {
    if (typeof key !== 'string' || FORBIDDEN.has(key) || !Object.hasOwn(container, key)) fail()
    return container[key]
  }
  return fail()
}

function walk(root: Json, path: Path): Json {
  let node = root
  for (const key of path) node = step(node, key)
  return node
}

function checkIndex(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) fail()
  return value
}

/**
 * Zieht die Änderungen nach. **Verändert `root`** und gibt die neue Wurzel
 * zurück (sie ist nur dann eine andere, wenn die ganze Wurzel ersetzt wird).
 *
 * Wirft, sobald etwas nicht passt – dann fehlt dem Empfänger offenbar ein
 * Zwischenstand, und er muss den vollen Zustand anfordern.
 */
export function applyPatch(root: Json, ops: Op[]): Json {
  for (const op of ops) {
    if (!op || typeof op !== 'object' || !Array.isArray(op.p)) fail()
    const path = op.p

    if ('m' in op || 's' in op) {
      const list = walk(root, path)
      if (!Array.isArray(list)) fail()
      if ('m' in op) {
        if (!Array.isArray(op.m) || op.m.length !== 2) fail()
        const from = checkIndex(op.m[0], list.length - 1)
        const to = checkIndex(op.m[1], list.length - 1)
        const [moved] = list.splice(from, 1)
        list.splice(to, 0, moved)
      } else {
        if (!Array.isArray(op.s) || op.s.length < 2) fail()
        const start = checkIndex(op.s[0], list.length)
        const count = checkIndex(op.s[1], list.length - start)
        list.splice(start, count, ...op.s.slice(2))
      }
      continue
    }

    if (path.length === 0) {
      if (!('v' in op)) fail()
      root = op.v
      continue
    }

    const parent = walk(root, path.slice(0, -1))
    const key = path[path.length - 1]

    if ('d' in op) {
      if (!isObject(parent) || typeof key !== 'string' || FORBIDDEN.has(key)) fail()
      delete parent[key]
      continue
    }
    if (!('v' in op)) fail()

    if (Array.isArray(parent)) {
      parent[checkIndex(key, parent.length - 1)] = op.v
    } else if (isObject(parent)) {
      if (typeof key !== 'string' || FORBIDDEN.has(key)) fail()
      parent[key] = op.v
    } else {
      fail()
    }
  }
  return root
}
