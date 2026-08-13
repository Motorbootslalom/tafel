# Tafel-Relais in AWS

Dieselbe Aufgabe wie das lokale Programm in [`../server/`](../server/), nur über
das Internet: Verwaltung, Tafel und Handys am Steg sehen denselben Stand.

Gebraucht wird das nur, wenn die Bediengeräte **nicht** im selben Netz hängen.
Am Wettkampfort ist das lokale Programm der verlässlichere Weg – es funktioniert
auch dann, wenn am See kein Netz steht.

## Bestandteile

| Dienst                     | Wofür                                              |
| -------------------------- | -------------------------------------------------- |
| API Gateway (WebSocket)    | Nimmt die Verbindungen an                          |
| Lambda (`src/handler.mjs`) | Leitet Nachrichten weiter und prüft die Freigabe    |
| DynamoDB                   | Offene Verbindungen und der letzte Gesamtzustand    |

Die Anwendung selbst wird **nicht** hier ausgeliefert – die läuft auf GitHub
Pages oder als einzelne HTML-Datei. Dieses Stück verbindet nur die Geräte.

## Aufbauen

Voraussetzung ist die [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
und ein eingerichtetes AWS-Konto.

```
cd cloud
sam build
sam deploy --guided
```

Beim geführten Aufbau wird nach dem **HostKey** gefragt – ein selbst gewählter
Schlüssel (mindestens 8 Zeichen), mit dem sich der Bedienrechner als Host
anmeldet. Er ist das Einzige, was verhindert, dass ein Fremder die Tafel
übernimmt; entsprechend wählen und nicht weitergeben.

Am Ende wird die Adresse ausgegeben:

```
Outputs
RelayUrl   wss://abc123.execute-api.eu-central-1.amazonaws.com/prod
```

Diese Adresse und den Host-Schlüssel in der Verwaltung unter
**Geräte → Verbindung → Internet (AWS)** eintragen.

Wieder abbauen:

```
sam delete
```

## Kosten

Ehrlich gesagt: **nicht dauerhaft kostenlos.**

- **Lambda** und **DynamoDB** haben ein unbefristetes kostenloses Kontingent
  (1 Mio. Aufrufe bzw. 25 GB pro Monat). Eine Veranstaltung liegt weit darunter.
- **API Gateway für WebSocket** ist nur in den **ersten 12 Monaten** eines neuen
  AWS-Kontos kostenlos (1 Mio. Nachrichten, 750 000 Verbindungsminuten). Danach
  kostet es rund 1 USD je Million Nachrichten und 0,25 USD je Million
  Verbindungsminuten.

Für einen Wettkampftag mit einer Handvoll Geräte sind das Centbeträge – aber es
ist eben nicht null. Wer sicher bei null bleiben will, nimmt das lokale
Programm.

Die Einträge in DynamoDB tragen eine TTL von 12 Stunden und verschwinden von
selbst; es bleibt nichts liegen, was Geld kostet.

## Sicherheit

Das Relais leitet nur weiter und kennt weder Starterlisten noch Rechte. Es setzt
genau zwei Dinge durch:

1. Wer sich als **Host** anmelden will, braucht den Host-Schlüssel.
2. Wer **nicht freigegeben** ist, darf nur eine Anmeldung schicken – alles
   andere wird verworfen, bevor es irgendwen erreicht.

Alle fachlichen Rechte („dieses Handy darf nur Parcours See") prüft der Host.
Ein Gerät kann sich also nicht selbst mehr Rechte geben, indem es eine andere
Rolle behauptet.

## Tests

Die Weiterleitungsregeln liegen als reine Funktion in `src/relay.mjs` und lassen
sich ohne AWS prüfen:

```
node --test 'src/*.test.mjs'
```
