import { describe, expect, it } from 'vitest'
import { ALL_TEMPLATES, EVENT_PLACEHOLDER, MESSAGE_GROUPS, fillTemplate } from './messages'

describe('Meldungsvorlagen', () => {
  it('sind nach Anlässen gruppiert und nicht leer', () => {
    expect(MESSAGE_GROUPS.length).toBeGreaterThan(0)
    for (const group of MESSAGE_GROUPS) {
      expect(group.title).not.toBe('')
      expect(group.items.length).toBeGreaterThan(0)
    }
  })

  it('haben durchweg Beschriftung, Text und Art', () => {
    for (const template of ALL_TEMPLATES) {
      expect(template.label.trim()).not.toBe('')
      expect(template.text.trim()).not.toBe('')
      expect(['info', 'pause', 'stoerung']).toContain(template.kind)
    }
  })

  it('tragen eindeutige Beschriftungen', () => {
    const labels = ALL_TEMPLATES.map((t) => t.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('zeigt Störungen als Störung an', () => {
    const stoerung = ALL_TEMPLATES.find((t) => t.label === 'Störung im Betriebsablauf')
    expect(stoerung?.kind).toBe('stoerung')
  })

  it('stellt Begrüßungen groß auf die Tafel, nicht klein unter den Starter', () => {
    // Eine Begrüßung richtet sich an alle im Umfeld und wird gelesen, bevor der
    // erste Starter oben steht. Als Info-Zeile unter dem Starter ginge sie in
    // 50 m Entfernung unter.
    const gruesse = MESSAGE_GROUPS.find((g) => g.title === 'Begrüßung')!
    for (const template of gruesse.items) {
      expect(template.kind, template.label).toBe('pause')
    }
  })

  it('enthalten die bewährten Texte der bisherigen Word-Lösung', () => {
    const texte = ALL_TEMPLATES.map((t) => t.text).join('\n')
    expect(texte).toContain('Lasst es euch schmecken')
    expect(texte).toContain('Vielen Dank an alle Wettkampfrichter')
    expect(texte).toContain('herzlich willkommen')
  })
})

describe('fillTemplate', () => {
  it('setzt den Veranstaltungsnamen ein', () => {
    const text = `Willkommen zum ${EVENT_PLACEHOLDER}`
    expect(fillTemplate(text, '20. Beetzseepokal')).toBe('Willkommen zum 20. Beetzseepokal')
  })

  it('ersetzt jedes Vorkommen', () => {
    const text = `${EVENT_PLACEHOLDER} – ${EVENT_PLACEHOLDER}`
    expect(fillTemplate(text, 'DM')).toBe('DM – DM')
  })

  it('lässt keine Lücke im Satz, wenn kein Name gesetzt ist', () => {
    expect(fillTemplate(`Willkommen zum ${EVENT_PLACEHOLDER}`, '   ')).toBe(
      'Willkommen zum Wettkampf',
    )
  })

  it('lässt Texte ohne Platzhalter unverändert', () => {
    expect(fillTemplate('Kurze Pause', 'DM')).toBe('Kurze Pause')
  })

  it('lässt in keiner Vorlage einen Platzhalter stehen', () => {
    for (const template of ALL_TEMPLATES) {
      expect(fillTemplate(template.text, 'Beetzseepokal')).not.toContain(EVENT_PLACEHOLDER)
    }
  })
})
