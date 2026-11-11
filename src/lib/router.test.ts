import { describe, expect, it, vi } from 'vitest'
import { PUBLIC_APP_URL, currentRoute, shareableViewUrl, viewUrl } from './router'

describe('currentRoute', () => {
  it('liest Ansicht und Parameter aus dem Hash', () => {
    location.hash = '#/pair?t=ABC123&u=ws%3A%2F%2Fhost%3A8080%2Fws'
    const route = currentRoute()
    expect(route.view).toBe('pair')
    expect(route.params.get('t')).toBe('ABC123')
    expect(route.params.get('u')).toBe('ws://host:8080/ws')
  })

  it('fällt bei unbekannter Ansicht auf die Startseite zurück', () => {
    location.hash = '#/gibtesnicht'
    expect(currentRoute().view).toBe('start')
  })

  it('kommt ohne Hash zurecht', () => {
    location.hash = ''
    expect(currentRoute().view).toBe('start')
  })
})

describe('viewUrl', () => {
  it('hängt Ansicht und Parameter an die aktuelle Adresse', () => {
    location.hash = '#/admin'
    const url = viewUrl('pair', { t: 'ABC' })
    expect(url.endsWith('#/pair?t=ABC')).toBe(true)
    // Der bisherige Hash darf nicht stehen bleiben.
    expect(url).not.toContain('admin')
  })

  it('erzeugt keine „null"-Adresse, wenn die Seite als Datei geöffnet wurde', () => {
    // Unter file:// ist location.origin der Wert "null" – daraus darf keine
    // Adresse gebaut werden, sonst zeigt der QR-Code ins Leere.
    expect(viewUrl('tafel').startsWith('null')).toBe(false)
  })
})

describe('shareableViewUrl', () => {
  it('nimmt die eigene Adresse, wenn die Seite von einem Server kommt', () => {
    location.hash = '#/admin'
    expect(shareableViewUrl('pair', { t: 'ABC' })).toBe(viewUrl('pair', { t: 'ABC' }))
  })

  it('zeigt bei einer geöffneten Datei auf die öffentliche Fassung', () => {
    vi.stubGlobal('location', { protocol: 'file:', href: 'file:///C:/Users/tafel.html#/admin' })
    try {
      expect(shareableViewUrl('pair', { k: 'ntfy' })).toBe(`${PUBLIC_APP_URL}#/pair?k=ntfy`)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
