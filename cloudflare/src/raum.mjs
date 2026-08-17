import { parseHead, route } from '../../cloud/src/relay.mjs'

/**
 * Ein Raum – die Fachlogik des Durable Objects, ohne Cloudflare-Abhängigkeit.
 *
 * Getrennt gehalten aus demselben Grund wie `relay.mjs` bei AWS: So lässt sich
 * das Weiterleiten mit einer Attrappe prüfen, ohne etwas auszurollen. Die
 * Anbindung an die Laufzeitumgebung steht in `worker.mjs`.
 *
 * Erwartet wird ein `ctx` mit dem Ausschnitt der `DurableObjectState`, den wir
 * tatsächlich brauchen:
 *
 * - `getWebSockets()` – die offenen Verbindungen dieses Raums
 * - `acceptWebSocket(ws)` – Verbindung annehmen (schlaffähig)
 * - `storage.get(key)` / `storage.put(key, wert)`
 *
 * Je Verbindung hängen die Merkmale am WebSocket selbst
 * (`serializeAttachment`) – sie überleben damit den Schlaf des Objekts. Eine
 * eigene Verbindungsliste gibt es bewusst nicht: Sie wäre eine zweite Wahrheit,
 * die nach jedem Aufwachen mit `getWebSockets()` abgeglichen werden müsste.
 */

/** Schlüssel, unter dem der zuletzt verteilte Gesamtzustand liegt. */
export const ZUSTAND = 'zustand'

export class Raum {
  /** @param {{getWebSockets: Function, acceptWebSocket: Function, storage: {get: Function, put: Function}}} ctx */
  constructor(ctx) {
    this.ctx = ctx
  }

  /**
   * Nimmt eine Verbindung an. `server` ist die Seite, die beim Relais bleibt.
   *
   * Ein neuer Host verdrängt den alten – der Fall „Bedienrechner neu
   * gestartet". Genauso hält es das lokale Programm in `server/hub.go`.
   *
   * @param {{deviceId: string, isHost: boolean}} merkmale
   */
  verbinde(server, merkmale) {
    if (merkmale.isHost) {
      for (const alt of this.ctx.getWebSockets()) {
        if (this.merkmale(alt)?.isHost) alt.close(4000, 'anderer Host übernimmt')
      }
    }

    this.ctx.acceptWebSocket(server)
    // Ein Gerät startet ohne Rechte; erst das „welcome" des Hosts schaltet frei.
    server.serializeAttachment({ ...merkmale, approved: merkmale.isHost })
  }

  /** Merkmale einer Verbindung, oder `null`, wenn keine hinterlegt sind. */
  merkmale(ws) {
    try {
      return ws.deserializeAttachment() ?? null
    } catch {
      return null
    }
  }

  /**
   * Eine eingegangene Nachricht weiterleiten. Die Entscheidung fällt in
   * `route()` – dieselbe Funktion, die auch AWS benutzt.
   */
  async nachricht(ws, body) {
    const absender = this.merkmale(ws)
    if (!absender) return

    const head = parseHead(body)
    if (!head) return

    const entscheidung = route(head, {
      isHost: !!absender.isHost,
      approved: !!absender.approved,
    })
    if (entscheidung.target === 'drop') return

    if (entscheidung.remember) await this.ctx.storage.put(ZUSTAND, body)

    switch (entscheidung.target) {
      case 'toHost':
        this.an((m) => m.isHost, body)
        return

      case 'toDevice': {
        const trifft = (m) => m.deviceId === entscheidung.deviceId
        if (entscheidung.approve) this.setzeFrei(entscheidung.deviceId, true)
        else if (entscheidung.revoke) this.setzeFrei(entscheidung.deviceId, false)

        this.an(trifft, body)

        // Ein frisch freigegebenes Gerät bekommt sofort den letzten Zustand –
        // sonst stünde es bis zur nächsten Änderung vor einer leeren Tafel.
        if (entscheidung.approve) {
          const zwischengespeichert = await this.ctx.storage.get(ZUSTAND)
          if (zwischengespeichert) this.an(trifft, zwischengespeichert)
        }
        return
      }

      case 'broadcast':
        this.an((m) => m.approved && !m.isHost, body)
        return
    }
  }

  /** An alle offenen Verbindungen, deren Merkmale passen. */
  an(passt, payload) {
    for (const ws of this.ctx.getWebSockets()) {
      const m = this.merkmale(ws)
      if (!m || !passt(m)) continue
      try {
        ws.send(payload)
      } catch {
        // Verbindung schon tot. Aufräumen erledigt die Laufzeitumgebung;
        // `getWebSockets()` nennt sie beim nächsten Mal nicht mehr.
      }
    }
  }

  /** Freigabe eines Geräts setzen oder zurücknehmen – über alle seine Verbindungen. */
  setzeFrei(deviceId, approved) {
    for (const ws of this.ctx.getWebSockets()) {
      const m = this.merkmale(ws)
      if (m?.deviceId === deviceId) ws.serializeAttachment({ ...m, approved })
    }
  }
}
