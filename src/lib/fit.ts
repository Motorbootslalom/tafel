import type { Directive } from 'vue'

/**
 * Zwei Anpassungen, damit auf der Tafel nichts abgeschnitten wird oder
 * übereinanderläuft.
 *
 * Die Schriftgrößen sind feste Bruchteile der Bereichshöhe – ausgelegt auf 50 m
 * Leseabstand. Sie dürfen nicht generell kleiner werden, müssen sich aber dort
 * beugen, wo der Inhalt länger ist als vorgesehen: ein sehr langer Vereinsname
 * (in der Breite) oder eine mehrzeilige Meldung unter dem Starter (in der Höhe).
 *
 * Beide laufen ausschließlich in den Vue-Hooks `mounted` und `updated`. Die
 * greifen **vor** dem Zeichnen, die Anpassung ist also unsichtbar. Bewusst kein
 * `ResizeObserver` auf den Elementen: Der meldet sich nach jedem `observe()`
 * einmal von selbst – und zwar nach dem Zeichnen. Beim Weiterschalten entsteht
 * jedes Mal ein neues Element, und dieser zusätzliche Durchgang war als Zucken
 * zu sehen. Fenstergrößen ändern sich dagegen selten; dafür genügt `resize`.
 */

/** Schrumpft eine einzelne Zeile, bis sie in ihre Breite passt. */
export function fitLine(el: HTMLElement): void {
  el.style.removeProperty('--fit-scale')
  const available = el.clientWidth
  const needed = el.scrollWidth
  if (available <= 0 || needed <= available) return

  // Die Breite skaliert nahezu linear mit der Schriftgröße; ein zweiter
  // Durchgang fängt den Rest ab (Zeichenabstände runden nicht exakt mit).
  let scale = available / needed
  el.style.setProperty('--fit-scale', String(scale))
  if (el.scrollWidth > el.clientWidth) {
    scale *= el.clientWidth / el.scrollWidth
    el.style.setProperty('--fit-scale', String(scale))
  }
}

/**
 * Verkleinert einen ganzen Block, bis er in die Höhe seines Bereichs passt.
 *
 * Das greift, wenn alle Angaben zusammenkommen – Parcours, Klasse und Lauf, die
 * große Startnummer, Name, Verein, der Starter davor und dazu noch eine
 * mehrzeilige Meldung. Verkleinert wird alles gemeinsam, damit die
 * Größenverhältnisse stimmen: Die Startnummer bleibt das mit Abstand Größte.
 */
export function fitBlock(el: HTMLElement): void {
  const region = el.parentElement
  if (!region) return

  el.style.removeProperty('--block-scale')

  // Der Innenabstand des Bereichs zählt nicht als Platz – sonst klebte der
  // Inhalt nach dem Verkleinern doch wieder an der Trennlinie.
  const style = getComputedStyle(region)
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const available = region.clientHeight - (Number.isFinite(padding) ? padding : 0)

  if (available > 0 && el.offsetHeight > available) {
    let scale = available / el.offsetHeight
    el.style.setProperty('--block-scale', String(scale))

    // Beim Verkleinern brechen Zeilen anders um – deshalb nachjustieren.
    for (let i = 0; i < 3 && el.offsetHeight > available; i++) {
      scale *= available / el.offsetHeight
      el.style.setProperty('--block-scale', String(scale))
    }
  }

  // Die Breitenanpassung der Zeilen danach erneut rechnen – sonst bliebe eine
  // Zeile schmaler als nötig, weil sie mit der alten Schriftgröße gemessen wurde.
  el.querySelectorAll<HTMLElement>('.board-line').forEach(fitLine)
}

/**
 * Hängt einen Fenster-Handler an ein Element und räumt ihn wieder ab.
 * Nur die Fenstergröße kann eine Anpassung nachträglich nötig machen.
 */
const onResize = new WeakMap<HTMLElement, () => void>()

function watchResize(el: HTMLElement, fn: () => void): void {
  const handler = () => fn()
  onResize.set(el, handler)
  window.addEventListener('resize', handler)
}

function unwatchResize(el: HTMLElement): void {
  const handler = onResize.get(el)
  if (handler) window.removeEventListener('resize', handler)
  onResize.delete(el)
}

/** `v-fit` auf eine einzelne Zeile mit fester Höhe. */
export const vFit: Directive<HTMLElement> = {
  mounted(el) {
    fitLine(el)
    watchResize(el, () => fitLine(el))
  },
  updated(el) {
    fitLine(el)
  },
  unmounted(el) {
    unwatchResize(el)
  },
}

/** `v-fit-block` auf den Inhalt eines Tafel-Bereichs. */
export const vFitBlock: Directive<HTMLElement> = {
  mounted(el) {
    fitBlock(el)
    watchResize(el, () => fitBlock(el))
  },
  updated(el) {
    fitBlock(el)
  },
  unmounted(el) {
    unwatchResize(el)
  },
}
