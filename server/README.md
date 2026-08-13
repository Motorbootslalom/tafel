# Tafel-Relais

Ein einzelnes Programm, das am Wettkampfort zweierlei tut:

1. **Die Anwendung ausliefern** – Tafel, Verwaltung, Steg-Bedienung und
   Startliste. Handys holen sich die Seite vom Bedienrechner, es wird kein
   Internet gebraucht.
2. **Geräte verbinden** – ein WebSocket-Relais, über das Verwaltung, Tafel und
   die Handys am Steg denselben Stand sehen.

Am Wettkampfort ist nichts zu installieren: Datei kopieren, doppelklicken,
fertig. Kein Node, kein Python, keine Adminrechte.

## Starten

```
./tafel-relais
```

Beim Start erscheinen die Adressen, unter denen der Rechner im WLAN erreichbar
ist, sowie ein **Host-Schlüssel**:

```
Tafel-Relais läuft.

  Host-Schlüssel: 7KQMD3AH
  (in der Verwaltung unter „Verbindung“ eintragen)

  Im Browser öffnen (Tafel und Verwaltung):
    http://192.168.1.20:8080/

  Adresse für die Verwaltung (Feld „Adresse des Relais“):
    ws://192.168.1.20:8080/ws
```

Am Bedienrechner eine der angezeigten `http://…`-Adressen öffnen. In der
Verwaltung unter **Geräte → Verbindung** steht „Lokales Netz“ dann bereits
gewählt, und die Adresse ist **schon eingetragen** – sie muss nicht abgetippt
werden. Nur der Host-Schlüssel kommt von Hand dazu.

Zur Auswahl stehen alle Adressen, unter denen der Rechner im Netz erreichbar
ist. Das ist wichtig, wenn die Seite über `localhost` geöffnet wurde: Damit
erreicht kein Handy den Rechner, und die passende LAN-Adresse muss gewählt
werden. Vorausgewählt ist die Adresse, über die diese Seite geladen wurde –
sonst die erste.

Danach unter **Gerät freischalten** einen Code ausgeben – das Handy scannt den
QR-Code oder tippt den sechsstelligen Code.

### Optionen

| Option  | Bedeutung                                              | Standard |
| ------- | ------------------------------------------------------ | -------- |
| `-addr` | Adresse, auf der gelauscht wird                        | `:8080`  |
| `-key`  | Host-Schlüssel fest vorgeben (sonst wird einer erzeugt) | erzeugt  |
| `-web`  | Weboberfläche aus einem Verzeichnis statt eingebaut     | eingebaut |

Ein fester Schlüssel ist praktisch, wenn der Rechner während der Veranstaltung
neu gestartet werden muss – dann bleibt die Einstellung in der Verwaltung gültig:

```
./tafel-relais -key BEETZSEE -addr :8080
```

### Endpunkte

| Pfad         | Zweck                                                              |
| ------------ | ------------------------------------------------------------------ |
| `/`          | Die Anwendung (eingebaut oder aus `-web`)                          |
| `/ws`        | Das Relais                                                          |
| `/adressen`  | Adressen, unter denen der Rechner im Netz erreichbar ist (JSON)     |
| `/gesund`    | Kurze Lebendmeldung für Skripte                                     |

`/adressen` nennt der Anwendung, was nur der Server wissen kann – der Browser
kennt immer nur die eine Adresse, über die er geladen hat. Der **Host-Schlüssel
wird dort bewusst nicht ausgeliefert**; die Auskunft ist offen erreichbar.

## Ohne Internet: Handy-Hotspot

Wenn am See kein WLAN steht, reicht der Hotspot eines Telefons. Alle Geräte
hängen sich dort ein, das Relais läuft auf dem Bedienrechner. Es fließen keine
Daten ins Internet.

## Was das Relais weiß

Nichts Fachliches. Es kennt weder Starterlisten noch Rechte, sondern leitet nur
weiter. Die Wahrheit liegt beim **Host** – dem Rechner, der die Tafel bedient.
Er prüft jede eingehende Änderung gegen die Rechte des Geräts.

Durchgesetzt wird hier genau eine Regel: **Wer nicht freigegeben ist, darf nur
eine Anmeldung schicken.** Alles andere wird verworfen, bevor es irgendwen
erreicht. Deshalb ist es unkritisch, dass dasselbe Programm auch in der Cloud
laufen könnte.

Beim **Entzug der Rechte** trennt das Relais die Verbindung des Geräts – erst
wird die Begründung zugestellt, dann geschlossen. Ein abgemeldetes Gerät hängt
also nicht weiter in der Leitung, und ohne neue Freigabe kommt von ihm nichts
mehr durch.

Wer sich als Host anmelden will, braucht den Host-Schlüssel; ein neuer Host
verdrängt den alten (der Fall „Bedienrechner neu gestartet“). Der zuletzt
verteilte Gesamtzustand wird zwischengespeichert, damit ein Handy nach einem
Verbindungsabbruch sofort wieder aktuell ist.

## Bauen

```
make          # für diesen Rechner
make alle     # Windows, macOS (Intel + Apple Silicon), Linux
make test     # go vet + Tests
```

`make` baut zuerst die Weboberfläche (`npm run build` im Projektverzeichnis) und
bettet sie mit `go:embed` in das Programm ein. Das Ergebnis liegt in `build/`.

> **Wichtig:** Die Oberfläche steckt **im Programm**. Wer die Anwendung ändert
> und nur `npm run build` ausführt, bekommt vom laufenden Programm weiterhin die
> alte Fassung ausgeliefert – mit allen Fehlern, die längst behoben sind. Nach
> jeder Änderung an der Anwendung also `make` neu ausführen und das Programm neu
> starten.
>
> Woran man es erkennt: In der Verwaltung steht unter **Geräte → Verbindung**
> der **Stand dieser Oberfläche**. Passt er nicht zum letzten Build, liegt es
> daran.
