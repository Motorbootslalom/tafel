import test from 'node:test'
import assert from 'node:assert/strict'
import { pruefeAnfrage } from './eingang.mjs'

const anfrage = (query = '', { pfad = '/ws', upgrade = 'websocket', hostKey = 'GEHEIM' } = {}) =>
  pruefeAnfrage({ pfad, upgrade, params: new URLSearchParams(query), hostKey })

test('pruefeAnfrage', async (t) => {
  await t.test('nimmt ein Gerät an', () => {
    assert.deepEqual(anfrage('room=beetzsee&device=g1'), {
      ok: true,
      raum: 'beetzsee',
      deviceId: 'g1',
      isHost: false,
    })
  })

  await t.test('setzt einen Standardraum, wenn keiner genannt ist', () => {
    assert.equal(anfrage('device=g1').raum, 'default')
  })

  await t.test('verlangt eine Geräte-Kennung', () => {
    assert.deepEqual(anfrage('room=see'), { ok: false, status: 400, text: 'device fehlt' })
  })

  await t.test('nimmt den Host nur mit passendem Schlüssel an', () => {
    assert.equal(anfrage('device=g1&role=host&key=GEHEIM').isHost, true)
    assert.equal(anfrage('device=g1&role=host&key=falsch').ok, false)
    assert.equal(anfrage('device=g1&role=host').ok, false)
  })

  await t.test('lässt ohne hinterlegten Schlüssel gar keinen Host zu', () => {
    // Sonst könnte sich jeder als Host ausgeben und die Tafel übernehmen.
    assert.equal(anfrage('device=g1&role=host', { hostKey: '' }).ok, false)
    assert.equal(anfrage('device=g1&role=host&key=', { hostKey: '' }).ok, false)
  })

  await t.test('weist andere Pfade ab', () => {
    assert.equal(anfrage('device=g1', { pfad: '/' }).status, 404)
  })

  await t.test('verlangt eine WebSocket-Anfrage', () => {
    assert.equal(anfrage('device=g1', { upgrade: null }).status, 426)
    // Groß-/Kleinschreibung des Kopfes ist nicht festgelegt.
    assert.equal(anfrage('device=g1', { upgrade: 'WebSocket' }).ok, true)
  })
})
