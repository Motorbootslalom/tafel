import type { BoardMessage } from '../types'

/**
 * Vorgefertigte Meldungen für die Tafel.
 *
 * Die Begrüßungen und Pausentexte sind aus der bisherigen Word-Lösung
 * übernommen (siehe LASTENHEFT, Abschnitt 1) – sie haben sich über Jahre bewährt
 * und sollen nicht jedes Mal neu getippt werden.
 *
 * `{Veranstaltung}` wird beim Auswählen durch den eingestellten
 * Veranstaltungsnamen ersetzt. Der Text landet zuerst im Eingabefeld und lässt
 * sich vor dem Anzeigen noch ändern – Uhrzeiten und Tagesangaben stehen deshalb
 * als Beispielwerte drin.
 */
export interface MessageTemplate {
  /** Kurzbezeichnung im Auswahlmenü. */
  label: string
  text: string
  kind: BoardMessage['kind']
}

export interface MessageGroup {
  title: string
  items: MessageTemplate[]
}

export const EVENT_PLACEHOLDER = '{Veranstaltung}'

export const MESSAGE_GROUPS: MessageGroup[] = [
  {
    // Begrüßungen stehen groß und allein auf der Tafel, deshalb 'pause' und
    // nicht 'info': Sie richten sich an alle im Umfeld und werden gelesen,
    // bevor der erste Starter oben steht. Als kleine Zeile unter dem Starter
    // gingen sie in 50 m Entfernung unter.
    title: 'Begrüßung',
    items: [
      {
        label: 'Guten Morgen',
        text: `Guten Morgen und herzlich willkommen\nzum ${EVENT_PLACEHOLDER}`,
        kind: 'pause',
      },
      {
        label: 'Willkommen zurück (Tag 2)',
        text: `Willkommen zurück zum ${EVENT_PLACEHOLDER}\n– Tag 2 –\nUm 9:30 Uhr geht es los!`,
        kind: 'pause',
      },
      {
        label: 'Gleich geht es los',
        text: 'Gleich geht es los –\nbitte fertig machen',
        kind: 'pause',
      },
      { label: 'Viel Erfolg', text: 'Viel Erfolg allen Startern!', kind: 'pause' },
    ],
  },
  {
    title: 'Dank',
    items: [
      { label: 'Dank an die WKR', text: 'Vielen Dank an alle Wettkampfrichter!', kind: 'info' },
      {
        label: 'Dank an Helfer',
        text: 'Vielen Dank an alle Helfer\nam Steg und im Boot!',
        kind: 'info',
      },
      {
        label: 'Verabschiedung',
        text: `Danke fürs Mitfahren –\nbis zum nächsten Mal beim ${EVENT_PLACEHOLDER}`,
        kind: 'info',
      },
    ],
  },
  {
    title: 'Pause',
    items: [
      { label: 'Mittagspause', text: 'Mittagspause –\nweiter geht es um 13:00 Uhr', kind: 'pause' },
      { label: 'Guten Appetit', text: 'Lasst es euch schmecken!', kind: 'pause' },
      {
        label: 'Guten Appetit und erholen',
        text: 'Lasst es euch schmecken\nund erholt euch gut.',
        kind: 'pause',
      },
      {
        label: 'Werwolf vor der Tribüne',
        text: 'Lasst es euch schmecken und erholt euch gut.\n\nWer Lust auf ein paar Runden Werwolf hat,\nkann gern vor der Tribüne dazukommen.',
        kind: 'pause',
      },
      {
        label: 'Siegerehrung',
        text: 'Gleich Siegerehrung –\nbitte zur Tribüne kommen',
        kind: 'pause',
      },
    ],
  },
  {
    title: 'Störung',
    items: [
      { label: 'Kurze Störung', text: 'Kurze Störung – gleich geht es weiter', kind: 'stoerung' },
      {
        label: 'Störung im Betriebsablauf',
        text: 'Störung im Betriebsablauf.\nWir bitten um Ihr Verständnis.',
        kind: 'stoerung',
      },
      {
        label: 'Bootswechsel',
        text: 'Bootswechsel –\ngleich geht es weiter',
        kind: 'stoerung',
      },
      {
        label: 'Technische Pause',
        text: 'Technische Pause.\nDie Fachkraft ist bereits unterwegs.',
        kind: 'stoerung',
      },
      {
        label: 'Bojen sortieren',
        text: 'Wir sortieren noch kurz die Bojen –\ngleich geht es weiter',
        kind: 'stoerung',
      },
      {
        label: 'Warten auf den Wind',
        text: 'Kurze Unterbrechung –\nwir warten auf ruhigeres Wasser',
        kind: 'stoerung',
      },
    ],
  },
]

/** Alle Vorlagen flach – praktisch für Tests und Suche. */
export const ALL_TEMPLATES: MessageTemplate[] = MESSAGE_GROUPS.flatMap((g) => g.items)

/**
 * Setzt den Veranstaltungsnamen in eine Vorlage ein. Fehlt er, bleibt eine
 * allgemeine Formulierung stehen statt einer leeren Lücke im Satz.
 */
export function fillTemplate(text: string, eventName: string): string {
  const name = eventName.trim() || 'Wettkampf'
  return text.split(EVENT_PLACEHOLDER).join(name)
}
