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
  den Spuren und innerhalb einer Spur verschieben; Pausen verschieben eine Spur
  nach hinten, ohne eine Lücke in der Liste zu erzeugen.
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
  einer anderen Klasse), eine ganze Klasse nach hinten oder vorn schieben, wenn
  ein Boot defekt ist – und Meldungen auf die Tafel setzen, mit **Vorlagen** für
  Begrüßung, Pause, Dank und Störung (Veranstaltungsname wird eingesetzt).
- **Öffentliche Startliste** mit Wartezeit-Prognose. Die Startabstände werden je
  Klasse gemessen und lassen sich am Ende als Vorgabe für die nächste
  Veranstaltung übernehmen.
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

Dafür braucht es eine Verbindung zwischen den Geräten – zwei Wege:

- **[`server/`](server/)** – ein Mini-Programm (eine Datei, kein Installer) für
  den Bedienrechner. Es liefert die Anwendung im WLAN oder Handy-Hotspot aus und
  verbindet die Geräte. Funktioniert **ohne Internet** und ist am See der
  verlässliche Weg.
- **[`cloud/`](cloud/)** – dasselbe über AWS (API Gateway WebSocket, Lambda,
  DynamoDB), wenn vor Ort verlässlich Netz steht.

## Wie es aufgebaut ist

```
src/lib/         Fachlogik ohne Oberfläche (Verzahnung, Startliste, Zeiten, Pairing)
src/state/       Reducer, Rechte, Store
src/transport/   Wie Geräte miteinander sprechen (local · lan · cloud)
src/views/       Die fünf Ansichten
src/components/  Bausteine der Bedienoberfläche
server/          Lokales Relais (Go, eine Datei)
cloud/           Relais in AWS (SAM)
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
