import test from 'node:test'
import assert from 'node:assert/strict'
import { Raum, ZUSTAND } from './raum.mjs'

/**
 * Attrappe der Laufzeitumgebung. Nachgebildet ist genau der Ausschnitt, den der
 * Raum benutzt – Verbindungen, Annehmen, Ablage. Damit lässt sich das
 * Weiterleiten prüfen, ohne etwas auszurollen.
 */
function umgebung() {
  const sockets = []
  const ablage = new Map()
  const ctx = {
    getWebSockets: () => sockets.filter((ws) => !ws.geschlossen),
    acceptWebSocket: (ws) => sockets.push(ws),
    storage: {
      get: async (k) => ablage.get(k) ?? null,
      put: async (k, v) => void ablage.set(k, v),
    },
  }
  return { ctx, sockets, ablage, raum: new Raum(ctx) }
}

/** Eine Verbindung, die mitschreibt, was bei ihr ankommt. */
function socket() {
  return {
    empfangen: [],
    anhang: null,
    geschlossen: false,
    schliessgrund: null,
    send(payload) {
      this.empfangen.push(payload)
    },
    close(_code, grund) {
      this.geschlossen = true
      this.schliessgrund = grund
    },
    serializeAttachment(wert) {
      this.anhang = wert
    },
    deserializeAttachment() {
      return this.anhang
    },
  }
}

/** Ein Umschlag, wie ihn die Anwendung schickt – nur der Kopf zählt hier. */
const umschlag = (from, msg, to) =>
  JSON.stringify({ v: 1, id: 'm1', from, ts: 1, ...(to ? { to } : {}), msg })

/** Raum mit angemeldetem Host und einem freigegebenen Gerät. */
function aufgebaut() {
  const u = umgebung()
  const host = socket()
  const geraet = socket()
  u.raum.verbinde(host, { deviceId: 'host', isHost: true })
  u.raum.verbinde(geraet, { deviceId: 'g1', isHost: false })
  u.raum.setzeFrei('g1', true)
  return { ...u, host, geraet }
}

test('Raum – anmelden', async (t) => {
  await t.test('ein Gerät startet ohne Rechte, der Host hat sie sofort', () => {
    const { raum } = umgebung()
    const host = socket()
    const geraet = socket()
    raum.verbinde(host, { deviceId: 'host', isHost: true })
    raum.verbinde(geraet, { deviceId: 'g1', isHost: false })

    assert.equal(host.anhang.approved, true)
    assert.equal(geraet.anhang.approved, false)
  })

  await t.test('ein neuer Host verdrängt den alten', () => {
    // Der Fall „Bedienrechner neu gestartet". Genauso hält es hub.go.
    const { raum } = umgebung()
    const alt = socket()
    raum.verbinde(alt, { deviceId: 'host', isHost: true })
    raum.verbinde(socket(), { deviceId: 'host', isHost: true })

    assert.equal(alt.geschlossen, true)
    assert.match(alt.schliessgrund, /Host/)
  })

  await t.test('ein Gerät verdrängt niemanden', () => {
    const { raum } = umgebung()
    const host = socket()
    raum.verbinde(host, { deviceId: 'host', isHost: true })
    raum.verbinde(socket(), { deviceId: 'g1', isHost: false })

    assert.equal(host.geschlossen, false)
  })
})

test('Raum – weiterleiten', async (t) => {
  await t.test('schickt eine Änderung ausschließlich an den Host', async () => {
    const { raum, host, geraet } = aufgebaut()
    const payload = umschlag('g1', { kind: 'action', action: { type: 'UNDO' } })

    await raum.nachricht(geraet, payload)

    assert.deepEqual(host.empfangen, [payload])
    assert.deepEqual(geraet.empfangen, [])
  })

  await t.test('verwirft alles von einem nicht freigegebenen Gerät außer der Anmeldung', async () => {
    const { raum, host } = aufgebaut()
    const fremd = socket()
    raum.verbinde(fremd, { deviceId: 'x', isHost: false })

    await raum.nachricht(fremd, umschlag('x', { kind: 'action', action: { type: 'UNDO' } }))
    assert.deepEqual(host.empfangen, [], 'die Änderung darf niemanden erreichen')

    const hallo = umschlag('x', { kind: 'hello', name: 'Steg', token: 't' })
    await raum.nachricht(fremd, hallo)
    assert.deepEqual(host.empfangen, [hallo], 'die Anmeldung muss durchkommen')
  })

  await t.test('verteilt den Zustand des Hosts an freigegebene Geräte, nicht an ihn selbst', async () => {
    const { raum, host, geraet } = aufgebaut()
    const payload = umschlag('host', { kind: 'state', state: {} })

    await raum.nachricht(host, payload)

    assert.deepEqual(geraet.empfangen, [payload])
    assert.deepEqual(host.empfangen, [])
  })

  await t.test('merkt sich den verteilten Zustand', async () => {
    const { raum, host, ablage } = aufgebaut()
    const payload = umschlag('host', { kind: 'state', state: {} })

    await raum.nachricht(host, payload)

    assert.equal(ablage.get(ZUSTAND), payload)
  })

  await t.test('verwirft eine unlesbare Nachricht', async () => {
    const { raum, host, geraet } = aufgebaut()
    await raum.nachricht(geraet, 'kein JSON')
    await raum.nachricht(geraet, '"ping"')
    assert.deepEqual(host.empfangen, [])
  })
})

test('Raum – freigeben und entziehen', async (t) => {
  await t.test('schaltet ein Gerät mit dem „welcome" frei und reicht den Zustand nach', async () => {
    const { raum, host, ablage } = aufgebaut()
    const neu = socket()
    raum.verbinde(neu, { deviceId: 'g2', isHost: false })

    const zustand = umschlag('host', { kind: 'state', state: {} })
    ablage.set(ZUSTAND, zustand)

    const welcome = umschlag('host', { kind: 'welcome', grant: {} }, 'g2')
    await raum.nachricht(host, welcome)

    assert.equal(neu.anhang.approved, true)
    assert.deepEqual(
      neu.empfangen,
      [welcome, zustand],
      'erst die Zusage, dann sofort der letzte Stand',
    )
  })

  await t.test('nimmt die Freigabe mit „revoked" zurück', async () => {
    const { raum, host, geraet } = aufgebaut()

    await raum.nachricht(host, umschlag('host', { kind: 'revoked' }, 'g1'))
    assert.equal(geraet.anhang.approved, false)

    // Ab jetzt kommt von diesem Gerät nichts mehr durch.
    host.empfangen.length = 0
    await raum.nachricht(geraet, umschlag('g1', { kind: 'action', action: { type: 'UNDO' } }))
    assert.deepEqual(host.empfangen, [])
  })

  await t.test('lässt eine geschlossene Verbindung außen vor', async () => {
    const { raum, host, geraet } = aufgebaut()
    geraet.geschlossen = true

    await raum.nachricht(host, umschlag('host', { kind: 'state', state: {} }))

    assert.deepEqual(geraet.empfangen, [])
  })
})
