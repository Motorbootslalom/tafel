/**
 * Die Prüfungen am Eingang – als reine Funktion, damit sie sich ohne Cloudflare
 * prüfen lässt. Es sind dieselben wie in `handleConnect` der AWS-Fassung.
 *
 * Durchgesetzt wird hier genau eine Regel: **Wer sich als Host anmelden will,
 * braucht den Host-Schlüssel.** Alles Weitere entscheidet das Relais anhand der
 * Regeln in `../../cloud/src/relay.mjs`, und die fachlichen Rechte prüft ohnehin
 * nur der Host.
 */

/**
 * @typedef {Object} Anfrage
 * @property {string} pfad        Pfad der URL, z. B. `/ws`
 * @property {string|null} upgrade  Wert des `Upgrade`-Kopfes
 * @property {URLSearchParams|Map<string,string>} params
 * @property {string} hostKey     Der hinterlegte Schlüssel
 *
 * @typedef {{ok: true, raum: string, deviceId: string, isHost: boolean}} Angenommen
 * @typedef {{ok: false, status: number, text: string}} Abgelehnt
 */

/**
 * @param {Anfrage} anfrage
 * @returns {Angenommen|Abgelehnt}
 */
export function pruefeAnfrage({ pfad, upgrade, params, hostKey }) {
  if (pfad !== '/ws') return { ok: false, status: 404, text: 'nicht gefunden' }

  // Der Browser schreibt „websocket“ klein, andere Gegenstellen nicht zwingend.
  if ((upgrade ?? '').toLowerCase() !== 'websocket') {
    return { ok: false, status: 426, text: 'WebSocket erwartet' }
  }

  const hole = (name) => params.get(name) ?? null

  const deviceId = hole('device')
  if (!deviceId) return { ok: false, status: 400, text: 'device fehlt' }

  const isHost = hole('role') === 'host'
  // Ohne hinterlegten Schlüssel könnte sich jeder als Host ausgeben – dann
  // lieber gar keinen Host zulassen als einen beliebigen.
  if (isHost && (!hostKey || hole('key') !== hostKey)) {
    return { ok: false, status: 403, text: 'falscher Host-Schlüssel' }
  }

  return { ok: true, raum: hole('room') || 'default', deviceId, isHost }
}
