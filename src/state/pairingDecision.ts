import type { DeviceGrant } from '../types'
import { verifyPairing, type PairingState } from '../lib/pairing'
import { uniqueDeviceName } from '../lib/deviceName'

/**
 * Die Entscheidung des Hosts über eine Anmeldung.
 *
 * Sie fällt an genau einer Stelle und nach genau diesen Regeln – herausgelöst
 * aus dem Store, weil hier entschieden wird, wer die Tafel bedienen darf.
 */
export type HelloDecision =
  | { kind: 'welcome'; grant: DeviceGrant }
  | { kind: 'denied'; reason: string }

export interface HelloRequest {
  /** Die aktuell ausgegebenen Codes. */
  pairing: PairingState
  /** Bereits freigeschaltete Geräte. */
  devices: DeviceGrant[]
  /** Wer sich meldet. */
  deviceId: string
  /** Vom Gerät vorgeschlagener Name. */
  name: string
  /** Eingetippter Code oder gescannter Token. */
  token: string
  now: number
}

/**
 * Prüft eine Anmeldung.
 *
 * Zwei Wege führen zur Freigabe:
 *
 * 1. Ein **gültiger Code**. Die damit verbundenen Rechte hat der Admin beim
 *    Ausgeben festgelegt; das Gerät kann daran nichts ändern.
 * 2. Ein **bereits bekanntes Gerät**. Nach einem Verbindungsabbruch – am WLAN-Rand
 *    der Normalfall – behält es seine Rechte, ohne dass jemand am See einen neuen
 *    Code vorlesen muss.
 */
export function decideHello(request: HelloRequest): HelloDecision {
  const { pairing, devices, deviceId, name, token, now } = request

  const intent = verifyPairing(pairing, token, now)
  const known = devices.find((d) => d.deviceId === deviceId) ?? null

  if (!intent) {
    if (!known) return { kind: 'denied', reason: 'Code ungültig oder abgelaufen' }
    // Bekanntes Gerät kommt zurück: Rechte bleiben, Name bleibt.
    return { kind: 'welcome', grant: { ...known, lastSeen: now } }
  }

  // Den Namen eindeutig machen kann nur der Host – nur er kennt alle Geräte.
  const vergeben = devices.filter((d) => d.deviceId !== deviceId).map((d) => d.name)

  return {
    kind: 'welcome',
    grant: {
      deviceId,
      name: uniqueDeviceName(name || known?.name || 'Gerät', vergeben),
      role: intent.role,
      parcoursIds: intent.parcoursIds,
      lastSeen: now,
    },
  }
}
