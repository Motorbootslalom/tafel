import { describe, expect, it } from 'vitest'
import { deviceNameFromUserAgent, suggestDeviceName, uniqueDeviceName } from './deviceName'

describe('deviceNameFromUserAgent', () => {
  const geraete: [string, string][] = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'iPhone'],
    ['Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15', 'iPad'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36', 'Android-Handy'],
    ['Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Safari/537.36', 'Android-Tablet'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Windows-Rechner'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', 'Linux-Rechner'],
  ]

  it.each(geraete)('erkennt %s', (ua, erwartet) => {
    expect(deviceNameFromUserAgent(ua)).toBe(erwartet)
  })

  it('bleibt bei Unbekanntem allgemein', () => {
    expect(deviceNameFromUserAgent('irgendein Browser')).toBe('Gerät')
    expect(deviceNameFromUserAgent('')).toBe('Gerät')
  })
})

describe('suggestDeviceName', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

  it('erkennt ein iPad, das sich als Mac ausgibt', () => {
    // Seit iPadOS melden sich iPads als Mac – nur die Mehrfinger-Bedienung
    // verrät sie.
    expect(suggestDeviceName(mac, 5)).toBe('iPad')
  })

  it('lässt einen echten Mac einen Mac sein', () => {
    expect(suggestDeviceName(mac, 0)).toBe('Mac')
  })
})

describe('uniqueDeviceName', () => {
  it('lässt einen freien Namen unverändert', () => {
    expect(uniqueDeviceName('iPhone', ['Android-Handy'])).toBe('iPhone')
  })

  it('hängt eine Zahl an, wenn der Name schon vergeben ist', () => {
    expect(uniqueDeviceName('iPhone', ['iPhone'])).toBe('iPhone 2')
    expect(uniqueDeviceName('iPhone', ['iPhone', 'iPhone 2'])).toBe('iPhone 3')
  })

  it('zählt bei einem bereits nummerierten Namen weiter', () => {
    // „Steg 2" darf nicht zu „Steg 2 2" werden.
    expect(uniqueDeviceName('Steg 2', ['Steg 2'])).toBe('Steg 3')
  })

  it('ignoriert Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(uniqueDeviceName(' iphone ', ['iPhone'])).toBe('iphone 2')
  })

  it('füllt Lücken in der Nummerierung', () => {
    // „iPhone 2" wurde entfernt – die Zahl wird wiederverwendet.
    expect(uniqueDeviceName('iPhone', ['iPhone', 'iPhone 3'])).toBe('iPhone 2')
  })

  it('kommt mit einem leeren Wunsch zurecht', () => {
    expect(uniqueDeviceName('', [])).toBe('Gerät')
    expect(uniqueDeviceName('   ', ['Gerät'])).toBe('Gerät 2')
  })
})
