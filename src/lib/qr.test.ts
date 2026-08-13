import { describe, expect, it } from 'vitest'
import { qrSvg } from './qr'

describe('qrSvg', () => {
  it('erzeugt ein in sich geschlossenes SVG', () => {
    const svg = qrSvg('https://beispiel.de/#/pair?t=ABC123')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    // Kein Verweis nach außen – die Seite läuft auch als einzelne Datei.
    expect(svg).not.toContain('http://www.w3.org/1999/xlink')
    expect(svg).toContain('<path')
  })

  it('lässt sich als XML lesen', () => {
    const svg = qrSvg('kurz')
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.tagName).toBe('svg')
  })

  it('wächst mit der Länge des Inhalts', () => {
    const boxOf = (text: string) => qrSvg(text).match(/viewBox="0 0 (\d+)/)![1]
    expect(Number(boxOf('a'.repeat(200)))).toBeGreaterThan(Number(boxOf('a')))
  })

  it('lässt am Rand die vorgeschriebene Ruhezone', () => {
    // Ohne Rand erkennen viele Kameras den Code nicht.
    const svg = qrSvg('test', { margin: 4 })
    const size = Number(svg.match(/viewBox="0 0 (\d+)/)![1])
    const ohne = Number(qrSvg('test', { margin: 0 }).match(/viewBox="0 0 (\d+)/)![1])
    expect(size).toBe(ohne + 8)
  })
})
