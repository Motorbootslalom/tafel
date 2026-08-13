import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { parseHead, route } from './relay.mjs'

const host = { isHost: true, approved: true }
const freigegeben = { isHost: false, approved: true }
const fremd = { isHost: false, approved: false }

const msg = (kind, to) => ({ ...(to ? { to } : {}), msg: { kind } })

describe('route – Geräte', () => {
  it('lässt ein nicht freigegebenes Gerät nur die Anmeldung schicken', () => {
    assert.deepEqual(route(msg('hello'), fremd), { target: 'toHost' })
    assert.deepEqual(route(msg('action'), fremd), { target: 'drop' })
    assert.deepEqual(route(msg('state'), fremd), { target: 'drop' })
  })

  it('leitet Änderungen freigegebener Geräte an den Host', () => {
    assert.deepEqual(route(msg('action'), freigegeben), { target: 'toHost' })
  })

  it('lässt ein Gerät niemals an andere Geräte senden', () => {
    assert.deepEqual(route(msg('state', 'anderes'), freigegeben), { target: 'toHost' })
  })

  it('verwirft Lebenszeichen', () => {
    assert.deepEqual(route(msg('ping'), freigegeben), { target: 'drop' })
  })
})

describe('route – Host', () => {
  it('schaltet mit welcome ein Gerät frei', () => {
    assert.deepEqual(route(msg('welcome', 'phone'), host), {
      target: 'toDevice',
      deviceId: 'phone',
      approve: true,
    })
  })

  it('nimmt mit denied und revoked die Freigabe zurück', () => {
    for (const kind of ['denied', 'revoked']) {
      assert.deepEqual(route(msg(kind, 'phone'), host), {
        target: 'toDevice',
        deviceId: 'phone',
        revoke: true,
      })
    }
  })

  it('verteilt den Zustand an alle und merkt ihn sich', () => {
    assert.deepEqual(route(msg('state'), host), { target: 'broadcast', remember: true })
  })

  it('schickt einen gezielten Zustand nur an das eine Gerät', () => {
    assert.deepEqual(route(msg('state', 'phone'), host), { target: 'toDevice', deviceId: 'phone' })
  })

  it('verwirft eine Freigabe ohne Empfänger', () => {
    assert.deepEqual(route(msg('welcome'), host), { target: 'drop' })
  })
})

describe('parseHead', () => {
  it('liest Ziel und Art', () => {
    assert.deepEqual(parseHead('{"v":1,"to":"a","msg":{"kind":"state"}}'), {
      to: 'a',
      msg: { kind: 'state' },
    })
  })

  it('weist Unsinn ab', () => {
    for (const bad of ['', 'null', '[]', '{}', '{"msg":{}}', '{"msg":"x"}', 'kein json']) {
      assert.equal(parseHead(bad), null, `sollte abgewiesen werden: ${bad}`)
    }
  })

  it('verwirft eine Nachricht ohne verwertbaren Kopf', () => {
    assert.deepEqual(route({ msg: {} }, host), { target: 'drop' })
  })
})
