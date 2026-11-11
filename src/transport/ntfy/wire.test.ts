import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { envelope } from '../protocol'
import { fromBase64Url, toBase64Url } from './codec'
import {
  openBroadcast,
  openDirect,
  openFromDevice,
  parseDeviceWire,
  parseHostWire,
  sealBroadcast,
  sealDirect,
  sealFromDevice,
  verifyBroadcast,
  type HostWire,
} from './wire'

const host = { box: nacl.box.keyPair(), sign: nacl.sign.keyPair() }
const roomKey = nacl.randomBytes(32)
const broadcastKeys = { epoch: 3, roomKey, signSecret: host.sign.secretKey }
const reload = envelope('dev_host', { kind: 'reload' })

describe('an alle', () => {
  it('liest nur, wer den Raumschlüssel hat, und die Signatur stimmt', async () => {
    const wire = parseHostWire(await sealBroadcast({ t: 5, env: reload }, broadcastKeys))!
    expect(wire.e).toBe(3)
    expect(verifyBroadcast(wire, host.sign.publicKey)).toBe(true)
    expect(await openBroadcast(wire, roomKey)).toEqual({ t: 5, env: reload })
    expect(await openBroadcast(wire, nacl.randomBytes(32))).toBeNull()
  })

  it('verwirft, was ein anderer signiert hat – auch mit dem richtigen Raumschlüssel', async () => {
    // Ein freigeschalteter Zuschauer kennt den Raumschlüssel, aber nicht den des Hosts.
    const forger = nacl.sign.keyPair()
    const forged = parseHostWire(
      await sealBroadcast({ t: 9, env: reload }, { ...broadcastKeys, signSecret: forger.secretKey }),
    )!
    expect(verifyBroadcast(forged, host.sign.publicKey)).toBe(false)
  })

  it('verwirft eine veränderte Nachricht und eine umgeschriebene Schlüssel-Fassung', async () => {
    const wire = parseHostWire(await sealBroadcast({ t: 5, env: reload }, broadcastKeys))!
    const bytes = fromBase64Url(wire.c)!
    bytes[0] ^= 1
    expect(verifyBroadcast({ ...wire, c: toBase64Url(bytes) }, host.sign.publicKey)).toBe(false)
    expect(verifyBroadcast({ ...wire, e: 4 }, host.sign.publicKey)).toBe(false)
  })

  it('trägt nie einen Raumschlüssel', async () => {
    const wire = parseHostWire(
      await sealBroadcast({ t: 5, key: { e: 3, k: toBase64Url(roomKey) } }, broadcastKeys),
    )!
    expect(await openBroadcast(wire, roomKey)).toBeNull()
  })
})

describe('an ein Gerät', () => {
  it('öffnet nur das Gerät, an das es ging', async () => {
    const device = nacl.box.keyPair()
    const other = nacl.box.keyPair()
    const plain = { t: 7, key: { e: 3, k: toBase64Url(roomKey) } }
    const wire = parseHostWire(await sealDirect(plain, 'dev_a', device.publicKey, host.box.secretKey))!
    expect(wire.to).toBe('dev_a')
    expect(await openDirect(wire, host.box.publicKey, device.secretKey)).toEqual(plain)
    expect(await openDirect(wire, host.box.publicKey, other.secretKey)).toBeNull()
  })

  it('geht nicht auf, wenn es nicht vom Host stammt', async () => {
    const device = nacl.box.keyPair()
    const fake = nacl.box.keyPair()
    const wire = parseHostWire(await sealDirect({ t: 1 }, 'dev_a', device.publicKey, fake.secretKey))!
    expect(await openDirect(wire, host.box.publicKey, device.secretKey)).toBeNull()
  })
})

describe('vom Gerät an den Host', () => {
  it('liest nur der Host, und der Schlüssel des Absenders ist belegt', async () => {
    const device = nacl.box.keyPair()
    const plain = { t: 11, env: envelope('dev_a', { kind: 'request-state' }) }
    const text = await sealFromDevice(plain, 'dev_a', device, host.box.publicKey)
    const wire = parseDeviceWire(text)!
    expect(wire.pk).toBe(toBase64Url(device.publicKey))
    expect(await openFromDevice(wire, host.box.secretKey)).toEqual(plain)
    expect(await openFromDevice(wire, nacl.box.keyPair().secretKey)).toBeNull()

    // Wer den Schlüssel eines anderen Geräts davorschreibt, bekommt es nicht auf.
    const stolen = { ...wire, pk: toBase64Url(nacl.box.keyPair().publicKey) }
    expect(await openFromDevice(stolen, host.box.secretKey)).toBeNull()
  })
})

describe('Einlesen', () => {
  it('weist Unsinn und fremde Fassungen ab', () => {
    expect(parseHostWire('kein json')).toBeNull()
    expect(parseHostWire('[]')).toBeNull()
    expect(parseHostWire(JSON.stringify({ v: 2, n: 'x', c: 'y' }))).toBeNull()
    expect(parseDeviceWire(JSON.stringify({ v: 1, from: 'a', pk: 'kurz', n: 'x', c: 'y' }))).toBeNull()
  })

  it('verlangt an alle eine Signatur und gezielt keine', async () => {
    const wire = parseHostWire(await sealBroadcast({ t: 5 }, broadcastKeys))!
    const mixed: HostWire = { ...wire, to: 'dev_a' }
    expect(parseHostWire(JSON.stringify(mixed))).toBeNull()
    const unsigned = { ...wire }
    delete unsigned.s
    expect(parseHostWire(JSON.stringify(unsigned))).toBeNull()
  })
})
