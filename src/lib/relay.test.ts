import { describe, expect, it } from 'vitest'
import { guessRelayUrl, parseRelayAddresses, preferredRelay } from './relay'

describe('guessRelayUrl', () => {
  it('leitet die Adresse aus einer http-Seite ab', () => {
    expect(guessRelayUrl({ protocol: 'http:', host: '192.168.1.20:8080' })).toBe(
      'ws://192.168.1.20:8080/ws',
    )
  })

  it('nutzt wss, wenn die Seite verschlüsselt geliefert wurde', () => {
    expect(guessRelayUrl({ protocol: 'https:', host: 'tafel.example' })).toBe(
      'wss://tafel.example/ws',
    )
  })

  it('liefert nichts, wenn die Seite als Datei geöffnet wurde', () => {
    // Basis-Version per Doppelklick: Es gibt gar keinen Server.
    expect(guessRelayUrl({ protocol: 'file:', host: '' })).toBeNull()
  })
})

describe('parseRelayAddresses', () => {
  it('liest die Antwort des Mini-Programms', () => {
    const antwort = {
      relais: ['ws://192.168.1.20:8080/ws', 'ws://172.17.0.1:8080/ws'],
      seite: ['http://192.168.1.20:8080/'],
    }
    expect(parseRelayAddresses(antwort)).toEqual(antwort)
  })

  it('kommt ohne Seiten-Adressen aus', () => {
    expect(parseRelayAddresses({ relais: ['ws://a/ws'] })).toEqual({
      relais: ['ws://a/ws'],
      seite: [],
    })
  })

  it('weist alles ab, was nicht danach aussieht', () => {
    for (const unsinn of [null, 'text', 42, {}, { relais: 'ws://a' }, { relais: [1, 2] }]) {
      expect(parseRelayAddresses(unsinn)).toBeNull()
    }
  })
})

describe('preferredRelay', () => {
  const adressen = ['ws://192.168.1.20:8080/ws', 'ws://172.17.0.1:8080/ws']

  it('bevorzugt die Adresse, über die diese Seite geladen wurde', () => {
    // Sie ist erwiesenermaßen erreichbar – die anderen sind Vermutungen.
    const gewaehlt = preferredRelay(adressen, { protocol: 'http:', host: '172.17.0.1:8080' })
    expect(gewaehlt).toBe('ws://172.17.0.1:8080/ws')
  })

  it('nimmt sonst die erste', () => {
    expect(preferredRelay(adressen, { protocol: 'http:', host: 'localhost:8080' })).toBe(adressen[0])
  })

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(preferredRelay([], { protocol: 'http:', host: 'localhost' })).toBeUndefined()
  })
})
