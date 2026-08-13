import type { DeviceGrant, Role } from '../types'
import { OPERATOR_ACTIONS, actionParcoursId, type Action } from './actions'

/**
 * Rechteprüfung für eingehende Actions.
 *
 * Sie läuft beim **Host** (dem Rechner, der die Tafel bedient) – ein Handy kann
 * sich also nicht selbst mehr Rechte geben, indem es eine andere Rolle
 * behauptet. Maßgeblich ist immer der beim Host hinterlegte {@link DeviceGrant}.
 */
export function canPerform(action: Action, grant: DeviceGrant | null): boolean {
  if (!grant) return false

  switch (grant.role) {
    case 'admin':
      return true

    case 'steg': {
      // Stegpersonal darf nur den Betrieb der ihm zugewiesenen Parcours steuern.
      if (!OPERATOR_ACTIONS.has(action.type)) return false
      const parcoursId = actionParcoursId(action)
      return !!parcoursId && grant.parcoursIds.includes(parcoursId)
    }

    case 'board':
    case 'viewer':
      // Reine Anzeigen senden nichts – was doch kommt, wird verworfen.
      return false
  }
}

/**
 * Die Rechte, die für dieses Gerät im Zustand hinterlegt sind.
 *
 * Der Host verteilt nach jeder Änderung den Gesamtzustand. Ein Bediengerät liest
 * daraus seine eigenen Rechte neu – so wirkt eine Änderung in der
 * Geräteverwaltung sofort, ohne dass sich jemand neu anmelden muss. Steht das
 * Gerät nicht mehr in der Liste, sind ihm die Rechte entzogen worden.
 */
export function grantFor(devices: DeviceGrant[], deviceId: string): DeviceGrant | null {
  return devices.find((d) => d.deviceId === deviceId) ?? null
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  steg: 'Steg',
  board: 'Tafel',
  viewer: 'Zuschauer',
}

export const ROLE_HINT: Record<Role, string> = {
  admin: 'Darf alles: Starterliste, Konfiguration und Geräte.',
  steg: 'Darf die zugewiesenen Parcours weiterschalten und Meldungen setzen.',
  board: 'Reine Anzeige auf der Wettkampftafel.',
  viewer: 'Sieht nur die Startliste.',
}

/** Rollen, die ein Admin einem mobilen Gerät zuweisen kann. */
export const ASSIGNABLE_ROLES: Role[] = ['steg', 'viewer', 'board']
