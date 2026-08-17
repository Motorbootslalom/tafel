# Tafel-Relais auf Cloudflare

> **Der Code ist da, ausgerollt wurde er noch nie.** Die Fachlogik ist durch
> Tests gedeckt (`npm run test:cloud`), die Anbindung in `src/worker.mjs`
> dagegen nicht – dafür bräuchte es ein Konto. Geprüft im August 2026 gegen die
> Dokumentation; die API war zuletzt in Bewegung, deshalb unten zu jedem heiklen
> Punkt die Quelle.

Dieselbe Aufgabe wie [`../server/`](../server/) (lokal) und [`../cloud/`](../cloud/)
(AWS): Verwaltung, Tafel und Handys am Steg sehen denselben Stand. Gebraucht wird
das nur, wenn die Geräte **nicht** im selben Netz hängen — am See ist das lokale
Programm der verlässlichere Weg.

Gegenüber AWS spricht dafür: Ein Durable Object je Raum ist fast wörtlich der Hub
aus `server/hub.go`, samt Zustandsspeicher. Kein API Gateway, keine
DynamoDB-Tabelle, kein Sekundärindex, keine TTL-Aufräumerei — eine Datei
Konfiguration.

## Der Aufbau in einem Satz

Ein **Worker** nimmt die WebSocket-Anfrage entgegen, prüft den Host-Schlüssel und
reicht sie an das **Durable Object** des angefragten Raums weiter; das Objekt hält
die Verbindungen des Raums und leitet nach den Regeln aus
[`../cloud/src/relay.mjs`](../cloud/src/relay.mjs) weiter.

```
Browser ──wss──▶ Worker (Eingang, Host-Schlüssel) ──▶ Durable Object je Raum
                                                        ├── offene WebSockets
                                                        └── letzter Gesamtzustand
```

Ein Objekt je Raum heißt: kein Nachschlagen, welche Verbindungen zu einem Raum
gehören. Genau das ist bei AWS der aufwendige Teil — hier fällt er ersatzlos weg.

## Die Dateien

```
wrangler.jsonc        Konfiguration (Objekt-Bindung, Ablage)
src/eingang.mjs       Prüfungen am Eingang – ohne Cloudflare-Abhängigkeit
src/raum.mjs          Fachlogik eines Raums – ohne Cloudflare-Abhängigkeit
src/worker.mjs        Anbindung: Worker + Durable Object
src/eingang.test.mjs  ⎫ laufen mit `node --test`,
src/raum.test.mjs     ⎭ ohne Konto und ohne Ausrollen
```

Die Aufteilung folgt derselben Regel wie bei AWS (`relay.mjs` rein,
`handler.mjs` Anbindung): Alles, was **entscheidet**, steht in Dateien ohne
Cloudflare-Abhängigkeit und ist geprüft — Weiterleiten, Freigeben, Entziehen,
Host-Verdrängung. In `worker.mjs` bleibt nur Übersetzung zwischen der
Laufzeitumgebung und diesen Teilen.

Die Weiterleitungsregeln selbst werden **unverändert** aus `../cloud/src/relay.mjs`
importiert; Wrangler bündelt die Datei mit ein. Damit sinkt die Zahl der
Umsetzungen derselben Regeln von drei auf zwei: einmal Go, einmal JavaScript für
AWS **und** Cloudflare.

## Der Stolperstein: Hibernation und die Lebenszeichen

Die einzige Stelle, an der das bestehende Protokoll nicht passte — und der Grund,
warum an der Anwendung überhaupt etwas zu ändern war.

Die Duration wird über die **Verbindungsdauer** abgerechnet, nicht über
Rechenzeit: 128 MB mal Wanduhr. Ein offener WebSocket kostet also, auch wenn
nichts passiert. Die Hibernation-API stoppt das, sobald das Objekt zehn Sekunden
untätig war.

Nur: `src/transport/socket.ts` schickt alle 25 Sekunden ein Lebenszeichen. Bei
acht Geräten käme damit etwa alle drei Sekunden eine Nachricht an — das Objekt
erreichte nie zehn untätige Sekunden und schliefe nie.

Cloudflare hat dafür `ctx.setWebSocketAutoResponse(...)`: Die Laufzeitumgebung
beantwortet eine passende Nachricht selbst, **ohne das Objekt zu wecken und ohne
Duration zu berechnen**. Der Haken: Verglichen wird auf **exakte
Zeichengleichheit**. Das bisherige Lebenszeichen war ein voller Umschlag mit
zufälliger `id` und aktuellem `ts` — es sah jedes Mal anders aus und hätte
niemals gepasst.

**Deshalb ist das Lebenszeichen jetzt die feste Zeichenkette `"ping"`**
(`KEEPALIVE` in `src/transport/protocol.ts`). An den beiden bestehenden Relais
war dafür **nichts** zu ändern, und das steht als Test fest:

- `server/hub.go` scheitert am Einlesen in eine Struktur und verwirft still —
  `TestFestesLebenszeichenStoertNicht` hält außerdem fest, dass die Verbindung
  danach unverändert nutzbar bleibt.
- `cloud/src/relay.mjs` gibt in `parseHead` `null` zurück und verwirft ebenfalls.
- Der Client verwirft die Antwort `"pong"`, weil sie kein gültiger Umschlag ist.

## Einrichten

```
cd cloudflare
npx wrangler login
npx wrangler secret put HOST_KEY      # selbst gewählt, mindestens 8 Zeichen
npx wrangler deploy
```

Der Host-Schlüssel gehört bewusst **nicht** in `wrangler.jsonc`, sondern als
Geheimnis daneben. Er ist das Einzige, was verhindert, dass ein Fremder die Tafel
übernimmt.

> Registriert wird die Klasse über den `exports`-Block in `wrangler.jsonc`, mit
> `"storage": "sqlite"` — im kostenlosen Tarif Pflicht, die Schlüssel-Wert-Ablage
> gibt es dort nicht. Ältere Anleitungen zeigen stattdessen einen
> `migrations`-Block mit `new_sqlite_classes`; beides beschreibt dasselbe.
> Sollte Wrangler meckern, ist es der alte Weg.

Am Ende steht die Adresse:

```
https://tafel-relais.<konto>.workers.dev
```

In der Verwaltung unter **Geräte → Verbindung → Internet (Cloud)** eintragen als:

```
wss://tafel-relais.<konto>.workers.dev/ws
```

Dazu den Host-Schlüssel. Danach unter **Gerät freischalten** einen Code ausgeben
— das Handy scannt den QR-Code oder tippt den sechsstelligen Code.

Prüfen, ob der Worker steht: `https://…/gesund` antwortet mit `ok`.

Wieder abbauen:

```
npx wrangler delete
```

## Tests

```
npm run test:cloud     # AWS- und Cloudflare-Regeln, ohne Konto
```

Geprüft wird, was entscheidet: die Prüfungen am Eingang (Host-Schlüssel,
fehlende Geräte-Kennung, falscher Pfad) und das Weiterleiten im Raum — dass eine
Änderung ausschließlich beim Host landet, dass von einem nicht freigegebenen
Gerät nur die Anmeldung durchkommt, dass ein frisch freigegebenes Gerät sofort
den letzten Zustand bekommt, dass ein neuer Host den alten verdrängt.

Dafür genügt eine Attrappe der Laufzeitumgebung: Der Raum benutzt von
`DurableObjectState` nur `getWebSockets()`, `acceptWebSocket()` und die Ablage.

## Kosten und Grenzen

Überschlag für einen Wettkampftag (8 Geräte, 10 Stunden, ~600 Zustands-Verteilungen):

| Posten   | Verbrauch   | Kostenlos enthalten |
| -------- | ----------- | ------------------- |
| Requests | ~640        | 100 000 / Tag       |
| Duration | ~4 600 GB-s | 13 000 GB-s / Tag   |
| Speicher | ~90 kB      | 5 GB                |

Es passt also in den kostenlosen Tarif. Eingehende WebSocket-Nachrichten rechnet
Cloudflare 20 : 1; den Löwenanteil machen ohnehin die Lebenszeichen aus (rund
11 500 am Tag), nicht die Starts. Die Duration oben ist der Wert **ohne**
Hibernation — mit der Auto-Antwort geht sie gegen null.

Grenzen, die man kennen sollte:

- **128 MB** Arbeitsspeicher je Objekt — der zwischengespeicherte Zustand liegt
  bei ein paar hundert Kilobyte.
- **2 MB** je Zeile in der SQLite-Ablage. Gemessen: 200 Starter über drei Läufe
  ergeben 69 kB, nach der Veranstaltung 86 kB; dazu das Logo als Data-URL
  (Upload auf 400 kB begrenzt, base64 ~530 kB). Ungünstigster Fall rund 0,6 MB.
- **16 384 Byte** je `serializeAttachment` — wir legen dort drei Felder ab.
- **1 000 Anfragen je Sekunde** je Objekt (weiches Limit), Nachrichten bis 32 MiB.
- Eine Obergrenze für gleichzeitige WebSockets je Objekt **nennt Cloudflare
  nicht**.
- Im kostenlosen Tarif gelten die Tageskontingente fürs **ganze Konto**, nicht je
  Projekt.

## Was offen ist

- **Nie ausgerollt.** `worker.mjs` ist gegen die Dokumentation geschrieben, nicht
  gegen eine laufende Instanz. Beim ersten Ausrollen sind die wahrscheinlichsten
  Stolpersteine die Form des `exports`-Blocks und das `compatibility_date`.
- **`parseHead` liest den ganzen Umschlag.** Es schickt die **vollständige**
  Nachricht durch `JSON.parse`, nur um `to` und `msg.kind` zu erfahren. Bei einem
  90 kB großen Zustand ist das bei jedem Sprung vermeidbare Arbeit. Geändert
  werden müsste es an einer Stelle, die AWS und Cloudflare teilen.
- **Kein Offline-Betrieb.** Das ist keine Schwäche dieser Umsetzung, sondern der
  Grund, warum `server/` bestehen bleibt.

## Quellen

- [Durable Objects – Preise](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Durable Objects – Grenzwerte](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Durable Objects – WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [DurableObjectState – API](https://developers.cloudflare.com/durable-objects/api/state/)
- [Workers – Grenzwerte](https://developers.cloudflare.com/workers/platform/limits/)
