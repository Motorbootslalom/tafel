# Tafel – Motorbootslalom

Anzeigetafel und Startlisten-Steuerung für den Motorbootslalom. Ersetzt die
bisherige Lösung aus Word-Serienbrief und von Hand gespeicherten HTML-Seiten.

Die Tafel steht 50 m entfernt mitten im See: schwarzer Grund, helle Schrift,
sehr große Startnummer. Und sie wird **nie neu geladen** – der weiße Blitz beim
Umschalten, der die alte Lösung geplagt hat, kann gar nicht mehr entstehen.

**Zum Ausprobieren:** <https://motorbootslalom.github.io/tafel/>

> Fachliche Anforderungen: [LASTENHEFT.md](LASTENHEFT.md)

## Was es kann

- **Anzeigetafel** für einen oder zwei Parcours (See/Land), untereinander,
  getrennt durch eine grüne Linie. Die Startnummer steht riesig **links**, Name
  und Verein daneben – so wird die volle Breite genutzt und die Nummer wird
  größer, als wenn sie sich die Höhe mit dem Namen teilen müsste. Der
  Parcours-Name steht links, Klasse und Lauf mittig darüber; optional der
  Starter davor. Kopfzeile und Logo sind einstellbar.
- **Starterliste aus Excel** per Copy & Paste – Kopfzeile wird erkannt, fehlende
  Startnummern werden je Klasse ergänzt. Ganz **ohne Lauf-Spalte**: Läufe
  entstehen erst beim Erzeugen der Startliste, damit jemand seinen dritten Lauf
  auch am Ende von Lauf 2 fahren kann.
- **Verzahnung** der Klassen über 1–4 Spuren, damit zwischen zwei Starts das
  Boot getauscht werden kann. Klassen lassen sich per **Drag & Drop** zwischen
  den Spuren und innerhalb einer Spur verschieben; **Pausen** sind Elemente wie
  Klassen und lassen sich an jede Stelle einer Spur ziehen – vorangestellt
  versetzen sie die ganze Spur, zwischen zwei Klassen nur deren Übergang, jeweils
  ohne eine Lücke in der Liste zu erzeugen. Die Vorschau zeigt die vollständige
  Startfolge.
- **Startliste nachbearbeiten**: Zeilen per Drag & Drop umsortieren oder über
  ein Menü direkt an eine Lauf-Grenze setzen („vor Lauf 3“, „nach Lauf 2“).
  Dabei bleibt die **Verzahnung erhalten** – die ganze Spur rutscht mit, damit
  nie zwei Starter derselben Klasse hintereinander stehen. Abschaltbar, wenn
  eine Reihenfolge bewusst genau so gewollt ist.
- **Läufe werden einzeln freigegeben.** Nach dem letzten Starter eines Laufs
  bleibt die Tafel stehen – Lauf 2 ist am Nachmittag, Lauf 3 meist am nächsten
  Tag. Das Stegpersonal gibt den nächsten Lauf frei, wenn es soweit ist. Wer
  seinen Lauf 1 nachholt, bleibt dabei freigegeben und steht in der Liste für
  Lauf 2 an der Stelle, an die er verschoben wurde.
- **Steg-Bedienung**: nächster Starter, Fehlklick zurücknehmen, Starter
  zurückstellen und wieder aktivieren, einen anderen Starter vorziehen (auch aus
  einer anderen Klasse), eine **Klasse aussetzen lassen**, wenn ihr Boot defekt
  ist – sie wird grau und startet nicht mehr; mit „Andere Klassen vorziehen"
  rückt die nächste Klasse derselben Spur auf ihre Plätze, sodass der Wechsel
  zwischen den Spuren erhalten bleibt. Ist das Boot zurück, wird der Rest des
  Laufs wieder mit ihr verzahnt. Die Klassen stehen dabei in der Reihenfolge, in
  der sie drankommen, und lassen sich per **Drag & Drop vorziehen** – innerhalb
  der Spuren, der Wechsel-Faktor bleibt also erhalten. Dazu
  **Meldungen** auf der Tafel, mit Vorlagen für Begrüßung, Pause, Dank und
  Störung (Veranstaltungsname wird eingesetzt).
- **Öffentliche Startliste** mit Wartezeit-Prognose für den Lauf, der gerade
  gefahren wird – für einen späteren steht der Beginn noch nicht fest. Die
  Startabstände werden je Klasse gemessen (Ausreißer nach oben wie unten zählen
  nicht mit) und lassen sich am Ende als Vorgabe für die nächste Veranstaltung
  übernehmen. Bis dahin gelten die Werte der **DM 2025** – mittlere Fahrzeit je
  Klasse aus den Ergebnislisten plus 30 s für den Bootswechsel.
- **Mobile Bedienung** (Pro): Handys am Steg werden per QR-Code (wechselt alle
  30 s) oder sechsstelligem Geräte-Code (5 min gültig) freigeschaltet – mit
  genau den Rechten, die der Admin vorher festgelegt hat, etwa „nur Parcours
  See“. Rechte lassen sich jederzeit ändern; das Gerät übernimmt sie sofort,
  ohne sich neu anzumelden.

## Loslegen

### Ohne alles: eine Datei

Fertig zum Herunterladen:
**<https://motorbootslalom.github.io/tafel/tafel.html>** (Rechtsklick →
„Ziel speichern unter …“).

Das ist die ganze Anwendung in **einer** Datei. Auf einen USB-Stick kopieren, auf
dem Zielrechner doppelklicken – fertig. Kein Node, kein Python, kein Installer,
keine Adminrechte, kein Internet. Alles liegt im localStorage des Browsers.

Selbst bauen geht auch:

```
npm install
npm run build:single      # ergibt dist-single/index.html
```

Üblicher Betrieb sind zwei Fenster:

1. **Tafel** – im Vollbild auf dem Monitor der Anzeigetafel (Taste `F` oder
   Doppelklick). Am besten über den Knopf **„Tafel öffnen“** aus dem
   Bedienfenster starten; dann besteht eine direkte Fensterverbindung, die auch
   unter `file://` trägt.
2. **Verwaltung/Steg** – auf dem Bedienrechner.

### Als Webseite

Die jeweils aktuelle Fassung liegt auf GitHub Pages:

| Adresse | Was |
| --- | --- |
| <https://motorbootslalom.github.io/tafel/> | die Anwendung |
| <https://motorbootslalom.github.io/tafel/tafel.html> | dieselbe Anwendung als einzelne Datei zum Herunterladen |

Beides entsteht bei jedem Push auf `main`
([deploy.yml](.github/workflows/deploy.yml)). Für den Wettkampf ist die
heruntergeladene Datei die sichere Wahl – sie braucht kein Netz.

Selbst starten:

```
npm run dev       # Entwicklung
npm run build     # nach dist/, läuft auf GitHub Pages
```

### Mit Handys am Steg

Dafür braucht es eine Verbindung zwischen den Geräten – drei stehen bereit:

- **[`server/`](server/)** – ein Mini-Programm (eine Datei, kein Installer) für
  den Bedienrechner. Es liefert die Anwendung im WLAN oder Handy-Hotspot aus und
  verbindet die Geräte. Funktioniert **ohne Internet** und ist am See der
  verlässliche Weg.
- **[`cloud/`](cloud/)** – dasselbe über AWS (API Gateway WebSocket, Lambda,
  DynamoDB), wenn vor Ort verlässlich Netz steht.
- **[`cloudflare/`](cloudflare/)** – dasselbe als Worker mit Durable Object.
  Deutlich weniger bewegliche Teile als die AWS-Fassung und im kostenlosen Tarif.

Alle drei sind Umsetzungen derselben, kleinen Aufgabe; weitere Wege stehen unten.

## Andere Wege für die Verbindung

Das Relais ist bewusst dumm: 85 Zeilen Weiterleitungsregeln
([`cloud/src/relay.mjs`](cloud/src/relay.mjs)), ohne jede Kenntnis von
Starterlisten oder Rechten. Eine weitere Variante muss nur vier Dinge erfüllen:

1. Ein WebSocket-Endpunkt. Raum, Geräte-ID und Rolle kommen als Query-Parameter
   (`src/transport/socket.ts`).
2. Weiterleiten nach den Regeln aus `relay.mjs`: vom Host an alle oder gezielt,
   von Geräten ausschließlich an den Host.
3. Wer nicht freigegeben ist, darf nur eine Anmeldung schicken.
4. Den zuletzt verteilten Gesamtzustand je Raum vorhalten, damit ein Handy nach
   einem Verbindungsabbruch sofort wieder aktuell ist.

In der Anwendung ist dafür nichts anzupassen: Die Betriebsart `cloud` ist nicht
an AWS gebunden, sie hängt allein an der eingetragenen Adresse.

### Die Randbedingung, die alles bestimmt

Wird die Anwendung über **https** geladen (GitHub Pages), verweigert der Browser
jede `ws://`-Verbindung. Genau deshalb liefert das lokale Programm die Anwendung
selbst aus – Seite und Relais sind dann beide `http://` im LAN, und es passt.
Jeder Weg über das Internet braucht dagegen zwingend `wss://` mit gültigem
Zertifikat. Das ist der eigentliche Aufwand, nicht der Server.

### Übersicht

| Weg | Ohne Internet | Aufwand | Kosten |
| --- | --- | --- | --- |
| `server/` lokal | **ja** | fertig | – |
| `server/` + Cloudflare Tunnel | ja, Tunnel nur für Auswärtige | Konfiguration, kein Code | – |
| `server/` auf einem kleinen VPS | nein | Deployment + TLS-Proxy | ~4–5 €/Monat |
| `server/` auf Fly.io / Railway / Render | nein | Container | tarifabhängig |
| `cloud/` (AWS) | nein | fertig | Centbeträge je Veranstaltung |
| [Cloudflare Worker + Durable Object](cloudflare/) | nein | Worker um `relay.mjs` herum | im kostenlosen Tarif |
| Tailscale / ZeroTier statt Relais | teilweise | VPN auf jedem Gerät | für kleine Netze kostenlos |
| Ably / Pusher / Supabase Realtime | nein | Adapter + Rechte-Token | Freikontingente – siehe Warnung |

**Den lokalen Server durchreichen** ist der unterschätzte Weg: Ein Cloudflare
Tunnel vor das laufende Go-Programm liefert eine `wss://`-Adresse samt
Zertifikat, kostenlos. Am See ohne Netz läuft alles wie bisher; sitzt jemand
woanders, kommt der Tunnel dazu. Vor allem kommt **kein zweiter Code-Pfad**
hinzu – die Regeln liegen heute schon zweimal vor (`server/hub.go` und
`cloud/src/relay.mjs`) und müssen von Hand synchron gehalten werden.

### Cloudflare Worker + Durable Object

Von den Fremd-Diensten der geringste Aufwand: Ein Durable Object je Raum
entspricht fast wörtlich dem Hub aus `server/hub.go`, samt Zustandsspeicher. Das
Nachschlagen, welche Verbindungen zu einem Raum gehören – bei AWS der aufwendige
Teil – fällt ersatzlos weg. `relay.mjs` ist bereits JavaScript und wird mitsamt
seinen Tests übernommen; neu ist nur die Anbindung, wie heute `handler.mjs` für
AWS. Damit sinkt die Zahl der Umsetzungen derselben Regeln von drei auf zwei.

Überschlag für einen Wettkampftag (8 Geräte, 10 Stunden, ~600 Zustands-Verteilungen):

| Posten | Verbrauch | Kostenloser Tarif |
| --- | --- | --- |
| Requests | ~640 | 100 000 / Tag |
| Duration | ~4 600 GB-s | 13 000 GB-s / Tag |
| Speicher | ~90 kB | 5 GB |

Ein Wettkampftag passt also mit großem Abstand in den kostenlosen Tarif. Zwei
Dinge sind dabei nicht offensichtlich: Cloudflare rechnet eingehende
WebSocket-Nachrichten im Verhältnis 20 : 1, und den Löwenanteil machen ohnehin
nicht die Starts aus, sondern die Lebenszeichen alle 25 Sekunden. Und die
Duration zählt **Verbindungsdauer**, nicht Rechenzeit – ein offener WebSocket
kostet, auch wenn nichts passiert.

Genau daran hängt der einzige Punkt, an dem das bestehende Protokoll nicht passt:
Die Hibernation-API stoppt die Duration nach zehn untätigen Sekunden, aber
unsere Lebenszeichen würden das Objekt dauernd wecken. Die Auto-Antwort der
Laufzeitumgebung vergleicht auf exakte Zeichengleichheit – unser Lebenszeichen
ist ein Umschlag mit zufälliger ID und Zeitstempel und sieht jedes Mal anders
aus. Das Lebenszeichen ist deshalb jetzt eine feste Zeichenkette – an den
bestehenden Relais war dafür nichts zu ändern, was als Test festgehalten ist.
**Umsetzung und Einrichtung: [`cloudflare/`](cloudflare/).**

### Vorsicht bei fertigen Pub/Sub-Diensten

Ably, Pusher, Supabase Realtime oder ein MQTT-Broker sehen verlockend aus, weil
gar kein Relais mehr zu schreiben wäre. Bei einem reinen Broadcast-Kanal fällt
aber die Regel „wer nicht freigegeben ist, darf nur eine Anmeldung schicken"
ersatzlos weg. Wer den Kanalnamen kennt, könnte dann gefälschte
`state`-Nachrichten an die Handys schicken und ihnen eine andere Tafel
unterschieben. Der Host prüft zwar weiterhin jede Änderung – die **Anzeige**
ließe sich trotzdem manipulieren.

Wiederherstellen lässt sich das nur über kanalgenaue Rechte-Token (Ably kann
das). Damit ist man beim Aufwand aber schon nahe an einem eigenen Worker – und
hat sich eine Abhängigkeit eingehandelt, die das Relais heute nicht hat.

## Wie es aufgebaut ist

```
src/lib/         Fachlogik ohne Oberfläche (Verzahnung, Startliste, Zeiten, Pairing)
src/state/       Reducer, Rechte, Store
src/transport/   Wie Geräte miteinander sprechen (local · lan · cloud)
src/views/       Die fünf Ansichten
src/components/  Bausteine der Bedienoberfläche
server/          Lokales Relais (Go, eine Datei)
cloud/           Relais in AWS (SAM)
cloudflare/      Relais als Worker + Durable Object
```

Drei Entscheidungen tragen den Rest:

**Der Zustand ist eine Datenstruktur, Änderungen sind Actions.** Der Reducer in
`src/state/reducer.ts` ist eine reine Funktion. Ein Handy am Steg löst exakt
dieselbe Action aus wie das Admin-Fenster – nur läuft sie beim Host.

Sie muss **deterministisch** sein: Zwischen den Fenstern eines Browsers wird die
Action übertragen, nicht der Zustand, und jedes Fenster führt sie selbst aus.
Zeitstempel und IDs kommen deshalb in der Action mit oder stehen fest – sie
werden nie gewürfelt. `src/state/determinismus.test.ts` hält das fest.

**Was auf der Tafel stand, steht in der Historie.** Die geplante Startliste darf
sich beliebig ändern (umsortieren, nachtragen, zurückstellen); die tatsächliche
Reihenfolge und damit die gemessenen Zeiten bleiben davon unberührt.

**Rechte prüft immer der Host**, nie das Gerät und nie das Relais. Das Relais
setzt nur eine einzige Regel durch: Wer nicht freigegeben ist, darf nur eine
Anmeldung schicken.

**Fenster reden immer direkt miteinander.** Tafel, Verwaltung und Steg auf
demselben Rechner teilen sich den Browser-Speicher und tauschen Actions über
einen lokalen Kanal aus – in jeder Betriebsart. Zum Relais verbindet dagegen nur
**ein** Fenster: Das Relais kennt je Raum genau einen Host, und ein zweites
Fenster würde das erste hinauswerfen. Wer das sein darf, klären die Fenster über
einen kurzen Eintrag im localStorage untereinander (`src/lib/leader.ts`).

## Entwicklung

```
npm run check     # Typecheck + Tests (Anwendung und Cloud-Relais)
npm test          # nur die Tests der Anwendung
cd server && make test
```

Der Commit-Hook läuft `npm run check`; aktiviert wird er einmalig mit
`git config core.hooksPath .githooks` (macht `npm install` automatisch).
