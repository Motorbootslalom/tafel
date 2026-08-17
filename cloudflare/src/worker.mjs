import { DurableObject } from 'cloudflare:workers'
import { pruefeAnfrage } from './eingang.mjs'
import { Raum as RaumLogik } from './raum.mjs'

/**
 * Tafel-Relais als Worker mit Durable Object.
 *
 * Dieselbe Aufgabe wie das lokale Programm in `../server/` und die AWS-Fassung
 * in `../cloud/` – gleiches Protokoll, gleiche Regeln. Gebraucht wird es nur,
 * wenn die Bediengeräte nicht im selben Netz hängen; am See ist das lokale
 * Programm der verlässlichere Weg.
 *
 * Diese Datei ist reine Anbindung: Sie übersetzt zwischen der Laufzeitumgebung
 * und den Teilen, die sich ohne Cloudflare prüfen lassen (`eingang.mjs`,
 * `raum.mjs`, `../cloud/src/relay.mjs`).
 */

/*
 * Doppelt gehalten – die Vorlage steht in `src/transport/protocol.ts`.
 *
 * Von dort zu importieren hieße, die halbe Anwendung in das Worker-Bündel zu
 * ziehen: `protocol.ts` hängt an den Typen, den Actions und der ID-Erzeugung.
 * Zwei Zeichenketten sind der kleinere Preis. Ändert sich das Lebenszeichen,
 * ist es hier nachzuziehen; passiert das nicht, schläft das Objekt nicht mehr
 * – auffallen würde es nur an der Rechnung.
 */
const KEEPALIVE = '"ping"'
const KEEPALIVE_ANSWER = '"pong"'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/gesund') return new Response('ok')

    const geprueft = pruefeAnfrage({
      pfad: url.pathname,
      upgrade: request.headers.get('Upgrade'),
      params: url.searchParams,
      hostKey: env.HOST_KEY ?? '',
    })
    if (!geprueft.ok) return new Response(geprueft.text, { status: geprueft.status })

    // Ein Objekt je Raum. Der Name genügt – Cloudflare findet es oder legt es
    // an, und alle Verbindungen desselben Raums landen zwangsläufig dort. Genau
    // deshalb entfällt hier das Nachschlagen, das bei AWS über DynamoDB läuft.
    const id = env.RAUM.idFromName(geprueft.raum)
    return env.RAUM.get(id).fetch(request)
  },
}

export class Raum extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.logik = new RaumLogik(ctx)

    /*
     * Das Lebenszeichen beantwortet die Laufzeitumgebung selbst – ohne dieses
     * Objekt zu wecken und ohne Abrechnung nach Verbindungsdauer.
     *
     * Verglichen wird auf exakte Zeichengleichheit. Deshalb schickt der Client
     * dafür eine feste Zeichenkette statt eines Umschlags: Der trüge eine
     * zufällige ID und einen Zeitstempel, sähe jedes Mal anders aus, und das
     * Objekt käme nie auf die zehn untätigen Sekunden, die es zum Schlafen
     * braucht. Siehe `src/transport/protocol.ts`.
     */
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE, KEEPALIVE_ANSWER))
  }

  async fetch(request) {
    const params = new URL(request.url).searchParams
    const [client, server] = Object.values(new WebSocketPair())

    // acceptWebSocket statt server.accept(): nur so darf das Objekt schlafen,
    // während die Verbindungen offen bleiben.
    this.logik.verbinde(server, {
      deviceId: params.get('device'),
      isHost: params.get('role') === 'host',
    })

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws, body) {
    // Binärnachrichten kennt das Protokoll nicht.
    if (typeof body !== 'string') return
    await this.logik.nachricht(ws, body)
  }
}
