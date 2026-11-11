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

Dafür braucht es eine Verbindung zwischen den Geräten – vier Wege stehen bereit:

- **[`server/`](server/)** – ein Mini-Programm (eine Datei, kein Installer) für
  den Bedienrechner. Es liefert die Anwendung im WLAN oder Handy-Hotspot aus und
  verbindet die Geräte. Funktioniert **ohne Internet** und ist am See der
  verlässliche Weg.
- **[`cloud/`](cloud/)** – dasselbe über AWS (API Gateway WebSocket, Lambda,
  DynamoDB), wenn vor Ort verlässlich Netz steht.
- **[`cloudflare/`](cloudflare/)** – dasselbe als Worker mit Durable Object.
  Deutlich weniger bewegliche Teile als die AWS-Fassung und im kostenlosen Tarif.
- **[ntfy](#ntfy-ohne-eigenen-server)** – ganz ohne eigenen Server, über einen
  öffentlichen ntfy-Server und verschlüsselt. Nichts zu bauen, nichts zu
  betreiben; die Seite kann weiter von GitHub Pages oder aus der
  heruntergeladenen Datei kommen. Braucht Internet am Wettkampfort.

Die ersten drei sind Umsetzungen derselben, kleinen Relais-Aufgabe; bei ntfy
übernimmt die Verschlüsselung in der Anwendung deren Regeln. Weitere Wege stehen
unten.

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
| [ntfy](#ntfy-ohne-eigenen-server) (z. B. ntfy.adminforge.de) | nein | fertig, **kein Server** | kostenlos, Kontingent je IP |
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

### ntfy: ohne eigenen Server

> **Umgesetzt und geprüft** (November 2026) gegen ntfy.adminforge.de, mit
> Bedienrechner und Handy in zwei getrennten Browsern – einmal von der Webseite,
> einmal aus der heruntergeladenen Datei (`file://`). Handy über Raum-Link und
> Geräte-Code freigeschaltet in 0,4 s, Weiterschalten in beide Richtungen je
> 0,2 s, danach Zustand auf beiden Seiten byte-gleich; Neuladen und Entzug
> verhalten sich wie beim Relais.

[ntfy](https://ntfy.sh) ist ein offener Benachrichtigungsdienst: Was an
`https://<server>/<thema>` geschickt wird, erreicht alle, die dieses Thema
abonniert haben – per WebSocket direkt aus dem Browser. Öffentliche Server wie
`ntfy.adminforge.de` nehmen das ohne Konto an und antworten mit
`Access-Control-Allow-Origin: *`. Damit fällt das Relais ganz weg: nichts zu
bauen, nichts zu betreiben, und die Seite kommt weiter von GitHub Pages oder
aus der heruntergeladenen Datei.

Was gegen fertige Pub/Sub-Dienste spricht ([siehe unten](#vorsicht-bei-fertigen-pubsub-diensten)),
löst hier die Kryptografie: Die Handys glauben nur, was der Host signiert hat.
Wer sonst noch in das Thema schreibt, wird verworfen.

| Aufgabe des Relais | mit ntfy |
| --- | --- |
| Host an alle oder an ein Gerät, Geräte nur an den Host | zwei Themen: `<thema>-h` beschreibt nur der Host, `<thema>-g` nur die Geräte; gezielte Nachrichten kann nur das Zielgerät entschlüsseln |
| nur der Host darf verteilen (Host-Schlüssel) | Signatur des Hosts |
| nicht Freigegebene schicken nur `hello` | der Host verwirft alles andere von Geräten, deren Schlüssel er nicht freigegeben hat |
| letzten Zustand vorhalten | entfällt – jedes Gerät fragt nach dem Verbinden nach (`request-state`), wie heute schon |

Die Weiterleitungsregeln wandern damit in die Anwendung. Es entsteht keine
dritte Umsetzung neben `server/hub.go` und `cloud/src/relay.mjs`.

#### Schlüssel

Verschlüsselt wird mit [tweetnacl](https://github.com/dchest/tweetnacl-js)
(geprüft, ohne Abhängigkeiten, wenige Kilobyte). Bewusst nicht mit WebCrypto:
X25519 und Ed25519 gibt es dort erst seit 2024/25 in allen großen Browsern, und
am Steg sind auch ältere Handys im Einsatz.

- Der Host erzeugt einmal je Raum ein Schlüsselpaar zum Signieren (Ed25519),
  eines zum Verschlüsseln (X25519), einen Raumschlüssel und ein zufälliges Thema
  (128 Bit).
- Der **QR-Code** trägt Server, Thema und die beiden öffentlichen Schlüssel des
  Hosts. Er ist der Vertrauensanker: Der Schlüssel kommt über den Bildschirm,
  nicht über ntfy – niemand kann sich dazwischenschalten.
- `hello`: Das Handy erzeugt ein eigenes Schlüsselpaar und schickt die Anmeldung
  mit `box` (X25519 + XSalsa20-Poly1305) an den Host. Der Code ist unterwegs
  nicht lesbar, und der Host weiß, mit welchem Schlüssel das Gerät spricht.
- `welcome`: an das Handy verschlüsselt, mit den Rechten und dem Raumschlüssel.
- **Verteilung an alle**: mit dem Raumschlüssel verschlüsselt (`secretbox`) und
  vom Host signiert. Den Raumschlüssel kennen alle Geräte, auch die Zuschauer –
  ohne Signatur könnte jedes freigegebene Handy den anderen eine Tafel
  unterschieben.
- **Gerät an Host**: mit `box`, der Host weiß also, welches Gerät es war.

Nebenbei schließt das eine Lücke, die das Relais hat: Geräte-IDs stehen im
Zustand, den alle Geräte bekommen. Wer eine kennt und den Raum erreicht, kann
sich damit melden, und der Host erkennt „ein bekanntes Gerät“ wieder. Bei ntfy
hängt die Freigabe am Schlüssel des Geräts, nicht an seiner ID.

#### Was man leicht übersieht

- **Wiedereinspielen.** Wer das Thema kennt, kann eine alte, gültig signierte
  Nachricht erneut schicken. Jede Nachricht trägt deshalb im verschlüsselten Teil
  einen streng steigenden Zeitstempel ihres Absenders; was nicht neuer ist, wird
  verworfen. Sonst zeigte die Tafel einen alten Stand, oder ein mitgeschnittenes
  „nächster Starter“ liefe zweimal.
- **Entzug.** Das Relais trennt ein entzogenes Gerät einfach ab. Bei ntfy kennt es
  Thema und Raumschlüssel weiterhin. Der Host wechselt deshalb beim Entzug den
  Raumschlüssel und schickt ihn einzeln an die übrigen Geräte. Schreiben kann das
  entzogene Gerät ohnehin nicht mehr – der Host nimmt von ihm nichts an.
- **Geräte-Code übers Funkgerät.** Sechs Zeichen tragen keinen Schlüssel. Das
  Handy braucht dafür vorher den **Raum-Link** (Server, Thema, öffentliche
  Schlüssel – nichts Geheimes, er darf per Messenger verschickt werden); der Code
  schaltet dann frei.
- **QR-Code unter `file://`.** Läuft der Bedienrechner mit der heruntergeladenen
  Datei, zeigt der QR-Code auf die Fassung bei GitHub Pages. Mit einer
  `file://`-Adresse kann kein Handy etwas anfangen.

#### Grenzen der öffentlichen Server

Abgefragt über `/v1/account` (November 2026), jeweils je IP:

| | ntfy.sh | ntfy.adminforge.de |
| --- | --- | --- |
| Nachrichten je Tag | **250** | 17 280 |
| Anhang je Datei | 2 MB | 15 MB |
| Anhänge gesamt (3 h vorgehalten) | 20 MB | 100 MB |

ntfy.sh scheidet damit aus: Ein Wettkampftag hat allein beim Host einige hundert
Verteilungen. Vorgabe ist deshalb ntfy.adminforge.de; der Server ist einstellbar,
ein eigener ntfy geht genauso. Die echten Zahlen der DM 2026 ließen sich nicht
mehr nachmessen – Cloudflare hält die Metriken nicht so lange vor.

Aus „je IP“ folgt zweierlei. Hängen Tafelrechner und Handys am selben Hotspot,
teilen sie sich ein Kontingent. Und kurze Spitzen – beim Umsortieren der
Startliste ist jedes Ziehen eine Änderung – fasst der Host zusammen, statt jede
einzeln zu schicken. Meldet der Server „zu viele Anfragen“ (429), wartet er und
schickt dann nur den neuesten Stand.

#### Änderungen statt Gesamtzustand

ntfy nimmt bis 4096 Byte als Nachricht; was größer ist, legt es als Anhang ab
(nachgemessen: 4097 Byte werden zur `attachment.txt`). Ein Anhang kostet jedes
Gerät eine zweite Anfrage und zählt aufs Anhang-Kontingent. Der Gesamtzustand
passt nie hinein: 150 Starter, drei Läufe und zwei Parcours ergeben 60–66 kB
JSON, gepackt etwa 8 kB – dazu käme ein Logo mit bis zu 530 kB.

Verteilt wird deshalb nur, was sich gegenüber dem zuletzt verteilten Stand
geändert hat, gepackt und mit fortlaufender Nummer. Ein Weiterschalten sind ein
paar hundert Byte. Fehlt einem Gerät eine Nummer, fordert es den vollen Stand an
und bekommt ihn einzeln, notfalls als Anhang. Das Logo reist nur mit, wenn es
sich ändert.

Bewusst eine Differenz der **Daten** und nicht die Actions, obwohl der Reducer
deterministisch ist: Ein Handy kann eine ältere Fassung der Anwendung im
Zwischenspeicher haben und rechnete dann anders als der Host. Und nicht jede
Änderung beim Host geht als Action an alle – die Freigabe eines Geräts etwa
nicht.

**Kein Offline-Betrieb.** ntfy ersetzt `cloud/` und `cloudflare/`, nicht
`server/` am See.

#### Einrichten

In der Verwaltung unter **Geräte → Verbindung** „Internet (ntfy)“ wählen und
**Übernehmen**. Der Rechner legt dabei einen Raum an (Thema und Schlüssel) und
behält ihn; der Server ist vorbelegt. Danach unter **Gerät freischalten** einen
Code ausgeben – das Handy scannt den QR-Code, oder es öffnet den angezeigten
**Raum-Link** und tippt den Geräte-Code.

„Neuen Raum anlegen“ erzeugt Thema und Schlüssel neu. Alle Geräte müssen danach
neu angemeldet werden; sinnvoll etwa zwischen zwei Veranstaltungen.

Die Schlüssel des Hosts liegen nur im Browser des Bedienrechners. Geht dessen
Speicher verloren, braucht es einen neuen Raum. Mehrere Fenster dort teilen sich
den Raum – wie beim Relais hält nur eines die Verbindung.

**Nachsehen beim ntfy-Server.** Die Raum-ID, die die Verwaltung anzeigt, ist
nicht selbst das Thema: Der Host schreibt nach `<Raum-ID>-h`, die Geräte nach
`<Raum-ID>-g`; unter der bloßen Raum-ID kommt nie etwas an. Wer eines der beiden
Themen in der Weboberfläche des Servers abonniert, sieht die Nachrichten – als
verschlüsselte Umschläge (`{"v":1,"e":…,"s":…,"n":…,"c":…}`), größere als
Anhang. Lesen lässt sich darin nichts, und das ist Absicht. ntfy.adminforge.de
hält sie 12 Stunden vor.

Packen können Browser seit 2023 (Safari 16.4, Chrome 80, Firefox 113); ältere
melden das beim Verbinden, statt still nichts zu empfangen.

#### Wo es steht

```
src/transport/ntfy/codec.ts      Base64url, Packen, Fingerabdruck, steigende Zeitstempel
src/transport/ntfy/patch.ts      Differenz zweier Zustände und ihr Nachziehen
src/transport/ntfy/room.ts       Raum und Schlüssel, im localStorage
src/transport/ntfy/wire.ts       Was über die Leitung geht: verschlüsseln, signieren, prüfen
src/transport/ntfy/transport.ts  Der Transport: Abo, Schlange, Wiederholen, Lücken
```

Im Store hat sich genau eine Stelle geändert: Meldet sich ein Gerät mit einem
Schlüssel, den der Host nicht als seinen kennt, entscheidet er wie bei einem
unbekannten Gerät – nur mit gültigem Code. Die Tests in `transport.test.ts`
laufen gegen einen nachgebauten ntfy-Server, der sich verhält wie der echte
(nachgemessen); die Prüfungen gegen gefälschte, wiederholte und nach dem Entzug
mitgelesene Nachrichten schlagen nachweislich an, wenn man die jeweilige
Sicherung im Transport ausbaut.

### Vorsicht bei fertigen Pub/Sub-Diensten

Ably, Pusher, Supabase Realtime oder ein MQTT-Broker sehen verlockend aus, weil
gar kein Relais mehr zu schreiben wäre. Bei einem reinen Broadcast-Kanal fällt
aber die Regel „wer nicht freigegeben ist, darf nur eine Anmeldung schicken"
ersatzlos weg. Wer den Kanalnamen kennt, könnte dann gefälschte
`state`-Nachrichten an die Handys schicken und ihnen eine andere Tafel
unterschieben. Der Host prüft zwar weiterhin jede Änderung – die **Anzeige**
ließe sich trotzdem manipulieren.

Wiederherstellen lässt sich das über kanalgenaue Rechte-Token (Ably kann das).
Damit ist man beim Aufwand aber schon nahe an einem eigenen Worker – und hat sich
eine Abhängigkeit eingehandelt, die das Relais heute nicht hat. Der andere Weg
sind Signaturen in der Anwendung selbst; dann genügt ein beliebiger Kanal, siehe
[ntfy](#ntfy-ohne-eigenen-server).

### Verworfen: https im WLAN über DNS-Namen und Let's Encrypt

Die Idee: Ein öffentlicher DNS-Name zeigt auf die Adresse des Bedienrechners im
WLAN, dazu kommt ein Zertifikat von Let's Encrypt. Dann wäre auch der Verkehr im
WLAN verschlüsselt – heute laufen dort Host-Schlüssel, Geräte-IDs und
Starterdaten im Klartext. Die Seite könnte von GitHub Pages kommen, und Internet
bräuchte es nur kurz, um das Zertifikat zu holen.

Durchdacht und verworfen (November 2026), aus diesen Gründen:

- **Geteilte Zertifikate taugen nicht.** Dienste wie traefik.me oder local-ip.co
  verteilten ein Zertifikat samt privatem Schlüssel an alle – mitlesen kann damit
  jeder, der es ebenfalls heruntergeladen hat. Let's Encrypt widerruft solche
  Zertifikate; traefik.me hat es deshalb mehrfach getroffen. sslip.io und nip.io
  liefern nur den Namen. Es bräuchte also ein **eigenes** Zertifikat je Verein,
  per DNS-01-Prüfung bei einem DNS-Anbieter mit Schnittstelle (eigene Domain,
  DuckDNS, deSEC …).
- **DNS-Rebind-Schutz.** Die Fritzbox verwirft ab Werk DNS-Antworten, die auf
  eine Adresse im eigenen Netz zeigen; OpenWrt und Pi-hole tun das oft ebenso.
  Ohne Ausnahme im Router lädt die Seite am Handy schlicht nicht – ein
  Fehlerbild, das sich am Steg kaum erklären lässt.
- **Internet nicht nur kurz.** Das Zertifikat hält Wochen, aber jedes Handy fragt
  den Namen beim Verbinden neu nach. Fällt das Netz am See aus, kommt kein Handy
  mehr neu dazu. Ein lokaler DNS-Eintrag im Router würde helfen, lässt sich aber
  längst nicht bei jedem Router einstellen.
- **Wechselnde Adresse.** An jedem Wettkampfort bekommt der Rechner eine andere
  Adresse im WLAN. Der DNS-Eintrag müsste beim Start nachgezogen werden – dafür
  läge ein Zugangsschlüssel zum DNS-Anbieter auf dem Laptop.
- **Chrome fragt nach.** Lädt die Seite von GitHub Pages und verbindet sich ins
  WLAN, verlangt Chrome inzwischen eine Erlaubnis für das lokale Netz, auch für
  WebSockets. Wer „Blockieren“ tippt, muss das in den Website-Einstellungen von
  Hand wieder freigeben.
- **Ein Dienst fürs ganze Projekt** – wie bei Plex, das jedem Gerät einen eigenen
  Namen samt Zertifikat gibt – nähme den Vereinen die Einrichtung ab. Das wäre
  aber wieder ein Server, den jemand betreiben muss; genau das erspart ntfy.

Unterm Strich viel Einrichtung und neue, schwer erklärbare Fehlerbilder – für
ein lokales Netz, das heute ohne all das funktioniert.

**Noch nicht umgesetzt, aber der einfachere Weg zum selben Ziel:** Die
Verschlüsselung aus dem ntfy-Weg hängt nicht an ntfy, und tweetnacl braucht kein
https. Dieselben versiegelten Nachrichten könnten über das lokale Relais laufen –
verschlüsselt im WLAN, ohne Zertifikat, DNS oder Internet. Das Relais reicht sie
dann nur noch blind weiter; seine Prüfungen übernimmt wie bei ntfy der Host.
Nicht abgedeckt wäre, dass jemand im WLAN die per `http://` ausgelieferte Seite
selbst verändert; davor schützt allein ein Zertifikat.

## Wie es aufgebaut ist

```
src/lib/         Fachlogik ohne Oberfläche (Verzahnung, Startliste, Zeiten, Pairing)
src/state/       Reducer, Rechte, Store
src/transport/   Wie Geräte miteinander sprechen (local · lan · ntfy · cloud)
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
Anmeldung schicken. Bei ntfy gibt es kein Relais; dieselbe Regel setzt dort der
Transport des Hosts durch, anhand der Schlüssel der Geräte.

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
