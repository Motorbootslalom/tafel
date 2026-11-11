import { onUnmounted, ref, type Ref } from 'vue'

/**
 * Winziger Hash-Router. Bewusst kein vue-router: Die Anwendung hat fünf
 * Ansichten, und der Hash funktioniert auch dann, wenn die Seite als einzelne
 * Datei von `file://` geöffnet wird – dort gibt es keine History-API-Pfade.
 */
export type ViewName = 'start' | 'tafel' | 'admin' | 'steg' | 'liste' | 'pair'

const VIEWS: ViewName[] = ['start', 'tafel', 'admin', 'steg', 'liste', 'pair']

export interface Route {
  view: ViewName
  params: URLSearchParams
}

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const [path, query = ''] = clean.split('?')
  const view = (VIEWS as string[]).includes(path) ? (path as ViewName) : 'start'
  return { view, params: new URLSearchParams(query) }
}

export function currentRoute(): Route {
  return parse(location.hash)
}

export function navigate(view: ViewName, params?: Record<string, string>): void {
  const query = params ? `?${new URLSearchParams(params).toString()}` : ''
  location.hash = `#/${view}${query}`
}

/**
 * Absolute URL einer Ansicht – für „Tafel öffnen" und für den QR-Code.
 *
 * Bewusst aus `location.href` abgeleitet und nicht aus `origin` + `pathname`:
 * Unter `file://` ist `origin` der Wert `"null"`, was eine unbrauchbare Adresse
 * ergäbe.
 */
export function viewUrl(view: ViewName, params?: Record<string, string>): string {
  const query = params ? `?${new URLSearchParams(params).toString()}` : ''
  const base = location.href.split('#')[0]
  return `${base}#/${view}${query}`
}

/** Wo die Anwendung öffentlich liegt (GitHub Pages). */
export const PUBLIC_APP_URL = 'https://motorbootslalom.github.io/tafel/'

/**
 * Wie {@link viewUrl}, aber für ein **anderes** Gerät, das übers Internet
 * verbindet. Läuft dieser Rechner mit der heruntergeladenen Datei, wäre das eine
 * `file://`-Adresse, mit der kein Handy etwas anfangen kann – dann zeigt der
 * Link auf die öffentliche Fassung.
 */
export function shareableViewUrl(view: ViewName, params?: Record<string, string>): string {
  if (location.protocol !== 'file:') return viewUrl(view, params)
  const query = params ? `?${new URLSearchParams(params).toString()}` : ''
  return `${PUBLIC_APP_URL}#/${view}${query}`
}

export function useRoute(): Ref<Route> {
  const route = ref<Route>(currentRoute())
  const onChange = () => {
    route.value = currentRoute()
  }
  window.addEventListener('hashchange', onChange)
  onUnmounted(() => window.removeEventListener('hashchange', onChange))
  return route
}
