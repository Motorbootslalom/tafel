/**
 * Weiterleitungs-Regeln des Relais – als reine Funktion, damit sie sich ohne
 * AWS prüfen lässt.
 *
 * Es sind exakt dieselben Regeln wie im lokalen Programm (`server/hub.go`).
 * Die eine, die zählt: **Wer nicht freigegeben ist, darf nur eine Anmeldung
 * schicken.** Alles andere wird verworfen, bevor es irgendwen erreicht.
 */

/**
 * @typedef {Object} Head
 * @property {string} [to]      Ziel-Geräte-ID; fehlt = an alle
 * @property {{kind: string}} msg
 *
 * @typedef {Object} Sender
 * @property {boolean} isHost
 * @property {boolean} approved
 *
 * @typedef {Object} Decision
 * @property {'drop'|'toHost'|'toDevice'|'broadcast'} target
 * @property {string} [deviceId]  bei 'toDevice'
 * @property {boolean} [approve]  Gerät freischalten
 * @property {boolean} [revoke]   Freischaltung zurücknehmen
 * @property {boolean} [remember} Zustand zwischenspeichern
 */

/**
 * Entscheidet, wohin eine Nachricht geht.
 *
 * @param {Head} head
 * @param {Sender} sender
 * @returns {Decision}
 */
export function route(head, sender) {
  const kind = head?.msg?.kind
  if (typeof kind !== 'string') return { target: 'drop' }

  // Lebenszeichen gehen niemanden etwas an – der Empfang selbst hat die
  // Verbindung bereits als lebendig bestätigt.
  if (kind === 'ping') return { target: 'drop' }

  if (sender.isHost) {
    switch (kind) {
      case 'welcome':
        return head.to
          ? { target: 'toDevice', deviceId: head.to, approve: true }
          : { target: 'drop' }
      case 'denied':
      case 'revoked':
        return head.to
          ? { target: 'toDevice', deviceId: head.to, revoke: true }
          : { target: 'drop' }
      case 'state':
        return head.to
          ? { target: 'toDevice', deviceId: head.to }
          : { target: 'broadcast', remember: true }
      default:
        return head.to ? { target: 'toDevice', deviceId: head.to } : { target: 'broadcast' }
    }
  }

  // Alles von Geräten geht ausschließlich an den Host – und nur, wenn das Gerät
  // freigegeben ist oder sich gerade anmeldet.
  if (!sender.approved && kind !== 'hello') return { target: 'drop' }
  return { target: 'toHost' }
}

/**
 * Liest den Kopf einer Nachricht. Über einen offenen WebSocket kann alles
 * Mögliche ankommen, deshalb wird nichts vorausgesetzt.
 *
 * @param {string} body
 * @returns {Head|null}
 */
export function parseHead(body) {
  try {
    const parsed = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object') return null
    const msg = parsed.msg
    if (!msg || typeof msg !== 'object' || typeof msg.kind !== 'string') return null
    return { to: typeof parsed.to === 'string' ? parsed.to : undefined, msg: { kind: msg.kind } }
  } catch {
    return null
  }
}
