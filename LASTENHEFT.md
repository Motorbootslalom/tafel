# Lastenheft – Tafel

Fachliche Anforderungen an die Anzeigetafel und die Startlisten-Steuerung beim
Motorbootslalom. Dieses Dokument ist die **maßgebliche** Quelle: Es fasst den
ursprünglichen Entwicklungsauftrag und die beiden bisher eingesetzten Lösungen
zusammen (Abschnitt 1) und führt beides fort.

> Die Vorgänger-Lösungen selbst liegen **nicht** im Repository: Sie enthalten
> vollständige Starterlisten mit Namen, Vereinen und Geburtsdaten. Alles fachlich
> Relevante daraus steht hier in Textform.

## 1. Ausgangslage

### Die Word-Lösung für zwei Parcours

Die Tafel entstand aus einer Word-Datei mit Serienbrieffunktion. Datenquelle war
eine Excel-Tabelle mit den Spalten **S-Nr., Name, Vorname, Verein, Klasse** und
**Lauf** – je Parcours eine eigene Datei. Der Bediener wechselte in Word den
Serienbrief-Eintrag auf den nächsten Starter und speicherte das Ergebnis als
HTML.

Eine handgeschriebene Rahmenseite führte beide Parcours (See und Land)
untereinander zu einer Ansicht zusammen. Sie lud die beiden gespeicherten Seiten
alle zwei Sekunden in ein verstecktes `iframe`, verglich eine Prüfsumme des
Inhalts und blendete nur bei einer Änderung auf das zweite `iframe` um – damit
beim Wechsel kein weißer Blitz entsteht.

**Darstellung** (die Maße haben sich über Jahre bewährt und sind in Abschnitt 4
übernommen): schwarzer Grund, helle Schrift. Die Startnummer war mit Abstand das
Größte (etwa 120 pt), darunter Name (rund 40 pt) und Verein kleiner; eine
Kopfzeile mit dem Namen der Veranstaltung stand bei etwa 48 pt darüber. Neben
den Startern gab es freie Meldungen, die anstelle des Starters erschienen.

**Wiederkehrende Meldungstexte** aus den Datenquellen – sie sind als Vorlagen in
das neue Werkzeug übernommen:

- „Guten Morgen und Herzlich Willkommen" + „zum \<Veranstaltung>"
- „Willkommen zurück … – Tag 2 – Um 9:30 Uhr geht es los!"
- „Vielen Dank an alle WKR"
- „Lasst es euch schmecken" bzw. „Lasst es euch schmecken und erholt euch gut."

### Die Ein-Parcours-Fassung

Für Veranstaltungen mit nur einem Parcours gab es eine zweite Word-Vorlage mit
denselben Daten, zusätzlich aber mit **Logo** und einer farbigen **Kopfzeile**
mit dem Veranstaltungsnamen.

### Warum das ersetzt wird

Das funktionierte, war aber umständlich: für jeden Lauf eine eigene Word-Datei,
jeder Starterwechsel ein Klick in Word plus Speichern, und die Läufe mussten
vorab feststehen. Kurzfristige Änderungen am Steg – ein verhinderter Starter,
ein defektes Boot – waren praktisch nicht abbildbar.

## 2. Grundsätze

| Nr.  | Anforderung                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------- |
| G-1  | Die Tafel wird **nie neu geladen**. Kein weißer Blitz, unter keinen Umständen.                    |
| G-2  | Die Basis-Version braucht **nur einen Browser**. Kein Node, kein Python, keine Adminrechte.       |
| G-3  | Läuft auf Linux, Windows und macOS – auch ohne Internet.                                          |
| G-4  | Alle Daten liegen lokal im Browser (localStorage) und überleben ein Reload.                       |
| G-5  | Die Bedienung darf den Wettkampf nie blockieren: Jeder Handgriff ist am Steg in Sekunden möglich. |
| G-6  | Üblicher Betrieb sind **zwei Browserfenster**: eines im Vollbild auf dem Monitor der Anzeigetafel, eines für Verwaltung und Bedienung. |
| G-7  | **Auslieferung** auf drei Wegen: als einzelne Datei per Doppelklick, über GitHub Pages, oder vom Mini-Programm im lokalen Netz. |
| G-8  | Die **Tafel** bringt ihre Farben selbst mit (schwarz/hell, siehe T-1). **Verwaltung und Steg** folgen dagegen der Systemeinstellung hell/dunkel. |

## 3. Verwaltung

| Nr.  | Anforderung                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------- |
| A-1  | Die **Anzahl der Parcours** (1 oder 2) wird hier festgelegt.                                        |
| A-2  | Je Parcours werden die **teilnehmenden Klassen** gepflegt. Die Starterliste gilt für die ganze Veranstaltung; welcher Starter auf welchem Parcours fährt, ergibt sich aus seiner Klasse. |
| A-3  | Aus der Verzahnung werden die **Startlisten erzeugt** – je Lauf ein Durchgang.                       |
| A-4  | Die **Darstellung der Tafel** wird hier eingestellt: Kopfzeile, Logo, Verein oder Bundesland, Starter davor, Schriftgröße. |
| A-5  | Die **Startabstände** je Klasse werden hier vorgegeben und die gemessenen Werte übernommen.          |
| A-6  | **Sicherung** herunterladen und wieder einspielen.                                                  |
| A-7  | In der Pro-Version: **Geräte freischalten** und ihre Rechte verwalten.                               |

## 4. Anzeigetafel

| Nr.  | Anforderung                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------- |
| T-1  | Schwarzer Hintergrund, weiße/helle Schrift – bewährt für 50 m Leseabstand mitten im See.             |
| T-2  | Ein **oder** zwei Parcours, je nach Konfiguration, untereinander mit deutlicher Trennlinie.          |
| T-3  | Die **Startnummer** ist deutlich größer als alles andere.                                            |
| T-4  | Ebenfalls prominent: **Klasse** und **Lauf**.                                                        |
| T-5  | **Name** und **Verein/Bundesland** kleiner – sie sind für die Zuschauer, nicht für die Wertung.      |
| T-6  | Der **Starter davor** ist optional mit anzuzeigen – mit Startnummer, **Klasse** und Namen, damit ablesbar ist, welches Boot gerade zurückkommt. |
| T-7  | Platz für **Logo** und **Kopfzeile** (wie in der BSP-Fassung); beides abschaltbar.                   |
| T-8  | Freie **Meldungen** (Störung, Pause, Begrüßung). Störung und Pause verdrängen den Starter, der Parcours-Name bleibt aber stehen – sonst wäre bei zwei Parcours nicht erkennbar, für welchen Bereich die Meldung gilt. Begrüßungen zählen dabei zu „Pause": Sie richten sich an alle im Umfeld und gingen als kleine Zeile unter dem Starter unter. |
| T-9  | Zu lange Namen oder Vereinsnamen werden gestaucht, nie abgeschnitten.                                |
| T-10 | Vollbild ohne Mauszeiger.                                                                            |
| T-11 | Die Startnummer steht **neben** den Angaben zum Starter, nicht darüber. Untereinander teilten sich beide die Höhe, während links und rechts Platz frei blieb; nebeneinander begrenzt nur die Bereichshöhe die Nummer. |
| T-12 | Der Parcours-Name steht links, Klasse und Lauf mittig über der Startnummer.                           |
| T-13 | Passt der Inhalt nicht in den Bereich (etwa mit mehrzeiliger Meldung), verkleinert sich **alles gemeinsam** – die Größenverhältnisse bleiben erhalten.                     |
| T-14 | Beim Weiterschalten darf nichts nachspringen: Die Anpassung greift vor dem Zeichnen, nicht danach.    |

## 5. Starterliste

| Nr.  | Anforderung                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------ |
| S-1  | Import **ohne Lauf-Nummer**. Läufe entstehen erst beim Erzeugen der Startliste.                          |
| S-2  | Import per Copy & Paste aus Excel; Kopfzeile wird erkannt, sonst gilt eine feste Spaltenreihenfolge.     |
| S-3  | Fehlende Startnummern werden je Klasse ergänzt; doppelte werden gemeldet.                               |
| S-4  | Ein Starter kann seinen Lauf **zu einem anderen Zeitpunkt** fahren – etwa den dritten am Ende von Lauf 2 oder den zweiten vor Beginn von Lauf 3. |
| S-5  | Export zurück nach Excel, round-trip-fähig.                                                              |
| S-6  | Die Startliste lässt sich per **Drag & Drop** umsortieren; zusätzlich setzt ein Menü einen Start direkt an eine Lauf-Grenze („vor Lauf 3", „nach Lauf 2"). |
| S-7  | Startnummern werden klassenweise sortiert: Klasse E steht vor Klasse 1 – ein reiner Textvergleich stellte `101` vor `E01`. |
| S-8  | Läufe folgen **nicht** unmittelbar aufeinander: Lauf 2 ist am Nachmittag, Lauf 3 meist am nächsten Tag. Die Tafel schaltet nach dem letzten Starter eines Laufs deshalb **nicht** von selbst weiter – der nächste Lauf wird ausdrücklich freigegeben. |
| S-9  | Maßgeblich für die Freigabe ist die **Lauf-Nummer**, nicht die Position in der Liste. Ein Starter, dessen Lauf 1 vor den Beginn von Lauf 2 verschoben wurde, bleibt damit freigegeben und steht in der Liste für Lauf 2 an seiner Stelle. |

## 6. Verzahnung

Zwischen zwei Starts muss das Boot getauscht werden können – deshalb sollen
aufeinanderfolgende Starter möglichst aus verschiedenen Klassen kommen.

| Nr.  | Anforderung                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------- |
| V-1  | Die Klassen eines Parcours werden auf 1–4 **Spuren** verteilt und im Wechsel abgearbeitet.            |
| V-2  | Die automatische Verteilung gleicht die Starterzahlen aus, damit der unverzahnte End-Block kurz bleibt. |
| V-3  | Die Zuordnung Klasse → Spur ist von Hand änderbar.                                                    |
| V-4  | **Pausen** setzen eine Spur um n Takte aus – ohne Lücke in der Startliste. Eine Pause steht an jeder Stelle einer Spur: vorangestellt versetzt sie die ganze Spur, zwischen zwei Klassen nur deren Übergang. |
| V-5  | Fällt im laufenden Betrieb ein Boot aus, lässt sich die **Klasse aussetzen**: Sie wird übersprungen. Mit „Andere Klassen vorziehen" rückt die nächste Klasse **derselben Spur** auf ihre Plätze, damit der Wechsel zwischen den Spuren erhalten bleibt (`E2E21212121216163` → `E6E61111113`, wenn Klasse 2 ausfällt). Ohne die Einstellung schließen sich die Lücken nur (`EE111116163`). Die Starts der ausgesetzten Klasse wandern dabei ans **Ende ihres Laufs** – zwischen den anderen stehend sähe es aus, als sei die falsche Klasse herausgenommen worden; in Startliste und Editor sind sie als „Klasse setzt aus" gekennzeichnet. Ist das Boot wieder da, wird der Rest des Laufs erneut mit ihr verzahnt. Spätere Läufe bleiben auf der ursprünglichen Verzahnung. |
| V-6  | Klassen **und Pausen** lassen sich per **Drag & Drop** zwischen den Spuren und innerhalb einer Spur verschieben. Die Reihenfolge in einer Spur bestimmt, welche Klasse dort zuerst fährt. |
| V-7  | Wird ein Starter in der Startliste umgesetzt, **rutscht seine Spur mit**, damit nie zwei Starter derselben Klasse hintereinander stehen – sonst fehlt am Steg die Zeit für den Bootswechsel. Abschaltbar, wenn eine Reihenfolge bewusst genau so gewollt ist. |
| V-8  | Die Vorschau der Startfolge zeigt **alle** Starts eines Laufs – gerade das Ende ist die interessante Stelle, weil dort der unverzahnte Block steht. |

## 7. Betrieb am Steg

| Nr.  | Anforderung                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------ |
| B-1  | Ein Handgriff schaltet auf den **nächsten Starter**.                                              |
| B-2  | Ein Fehlklick lässt sich **zurücknehmen**.                                                        |
| B-3  | Ein kurzfristig verhinderter Starter wird **zurückgestellt** – er bleibt sichtbar.                |
| B-4  | Ein zurückgestellter Starter wird **wieder aktiviert**: als Nächster oder am Ende seines Laufs.   |
| B-5  | Ein **anderer Starter** kann direkt vorgezogen werden – auch aus einer anderen Klasse.            |
| B-6  | **Meldungen** (Störung, Pause, freier Text) setzt und löscht das Stegpersonal selbst.             |
| B-7  | Die geplante Liste folgt der Wirklichkeit: Was gezeigt wurde, bleibt in der Historie – unabhängig davon, wie umsortiert wurde. |
| B-8  | Für wiederkehrende Meldungen gibt es **Vorlagen** (Begrüßung, Dank, Pause, Störung) mit Platzhalter für den Veranstaltungsnamen. Sie landen zuerst im Eingabefeld, nicht direkt auf der Tafel. |
| B-9  | Eine **Klasse setzt aus**, wenn ihr Boot ausfällt: Sie wird grau dargestellt und startet nicht mehr – unabhängig von jeder Einstellung. „Andere Klassen vorziehen" entscheidet nur, ob die übrigen auf die freigewordenen Plätze aufrücken (siehe V-5). Je Klasse steht dabei, wie viele Starter noch ausstehen, und darunter die Folge, in der die Starts jetzt tatsächlich drankommen. |
| B-10 | Die Klassen stehen in der Reihenfolge, in der sie drankommen, und lassen sich per **Drag & Drop vorziehen**. Umsortiert wird dabei **innerhalb der Spuren**: Der Wechsel-Faktor gilt weiter, zwischen zwei Starts wechselt weiter die Spur. Eine Klasse, die ihre Spur für sich hat, lässt sich folglich nicht vorziehen – ihre Plätze gehören ihr ohnehin alle. |

## 8. Öffentliche Startliste

| Nr.  | Anforderung                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------- |
| L-1  | Zeigt, wer gerade dran ist und wer folgt – je Parcours, filterbar nach Klasse.                     |
| L-2  | Nennt für jeden offenen Start des **gerade gefahrenen Laufs** eine geschätzte Wartezeit. Für einen späteren Lauf steht der Beginn noch gar nicht fest – dort bleibt die Spalte leer statt eine Zahl zu erfinden. |
| L-3  | Die Startabstände werden **je Klasse gemessen**: Klasse 1 fährt am schnellsten, danach wird es klassenweise langsamer; Klasse E fällt heraus – kurze Bahn, aber mehr Zeit am Steg. |
| L-4  | Ausreißer verfälschen den Schnitt nicht – weder nach oben (Pause, Störung, Mittag) noch nach unten: Abstände unter 30 s entstehen beim Durchklicken und sind nie ein echter Lauf. |
| L-5  | Vor dem ersten Start zählen **vorkonfigurierte** Werte aus früheren Veranstaltungen. Ausgeliefert werden die der **DM 2025**: mittlere Fahrzeit je Klasse aus den Ergebnislisten (alle drei Läufe) plus 30 s für den Bootswechsel. |
| L-6  | Die gemessenen Werte lassen sich als Vorgabe für das nächste Mal übernehmen.                       |
| L-7  | Starts einer **ausgesetzten Klasse** stehen am Ende des Laufs und tragen statt einer Wartezeit den Hinweis „Boot fehlt" – eine hochgerechnete Zahl wäre dort schlicht falsch. |
| L-8  | Je nach Einstellung ohne Anmeldung einsehbar.                                                      |

## 9. Pro-Version: mobile Bedienung

| Nr.  | Anforderung                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------- |
| P-1  | Die Bedienung lässt sich auf Handys oder Tablets auslagern.                                           |
| P-2  | **Rechteverwaltung**: Ein Gerät darf nur bestimmte Parcours bedienen (z. B. nur See).                  |
| P-3  | Anmeldung per **QR-Code**, der alle 30 Sekunden wechselt.                                             |
| P-4  | Alternativ per **Geräte-Code**: 6 gut unterscheidbare alphanumerische Zeichen, 5 Minuten gültig, Groß-/Kleinschreibung egal. |
| P-5  | Rechte prüft immer der Host – nie das Gerät, nie das Relais.                                          |
| P-6  | Rechte lassen sich jederzeit ändern oder entziehen. Die Änderung wirkt **sofort** auf dem Gerät – ohne erneute Anmeldung. Beim **Entzug** wird zusätzlich die Verbindung getrennt und die gespeicherte Anmeldung verworfen: Das Gerät kommt nur mit einem neuen Code zurück. |
| P-7  | Nach einem Verbindungsabbruch meldet sich ein bekanntes Gerät **von selbst** wieder an, ohne neuen Code. |
| P-8  | Der Betrieb läuft ohne Internet: ein Mini-Programm auf dem Bedienrechner im WLAN oder Hotspot.        |
| P-9  | Alternativ über AWS, solange verlässliches Internet vorhanden ist.                                    |
| P-10 | Mehrere Fenster auf dem Bedienrechner (Tafel, Verwaltung, Steg) sehen einander in **jeder** Betriebsart. Zum Relais verbindet nur eines von ihnen – ein zweites würde das erste verdrängen. |
| P-11 | Eine Sicherung lässt sich wieder einspielen. Das ist der Weg von der Basis- in die Pro-Version: Beide laufen unter verschiedenen Herkünften (`file://` bzw. `http://…`) und haben getrennte Browser-Speicher. |
| P-12 | Die Rechte sind Teil des Zustands: Sie überleben einen Neustart und stecken in jeder Sicherung.       |

## 10. Abgrenzung

Nicht Teil dieses Werkzeugs – dafür gibt es eigene Projekte:

- Wertung, Fehlerpunkte und Ergebnislisten (Projekt „Fehlerpunkte")
- Erzeugen der Startnummern nach Konfektionsgröße (Projekt „Verzahnung")
- Parallel-Slalom

Die Verzahnungs-Logik in Abschnitt 6 ist aus dem Projekt „Verzahnung"
übernommen und hier auf das nötige Maß gekürzt: ohne Boot-Budget, dafür mit
Pausen als Mittel, eine Spur nach hinten zu verschieben.

## 11. Offene Punkte

- **Zwei Parcours gleichzeitig in einem Browser:** In der Basis-Version geben die
  Fenster einander Actions weiter, nicht den Gesamtzustand – zwei parallel
  bediente Parcours geraten sich damit nicht ins Gehege. Ob das im Betrieb
  reicht oder es doch einen ausgewiesenen Host braucht, muss der erste
  Wettkampf zeigen.
- **AWS-Kosten:** API Gateway für WebSocket ist nur im ersten Jahr eines neuen
  Kontos kostenlos (siehe [cloud/README.md](cloud/README.md)). Dauerhaft
  kostenfrei bleibt nur der lokale Weg.
- **Mehrere Läufe gleichzeitig:** Aktuell wird je Lauf ein kompletter Durchgang
  erzeugt. Ob Läufe auch verschränkt geplant werden sollen, ist offen.
