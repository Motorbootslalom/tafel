package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// Die Regeln des Relais lassen sich nur im Zusammenspiel prüfen: Ein Gerät, das
// noch nicht freigegeben ist, darf den Host nicht erreichen – außer mit seiner
// Anmeldung. Deshalb hier echte WebSocket-Verbindungen gegen einen Testserver.

const testKey = "TESTKEY1"

func startServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	h := newHub(testKey)
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", wsHandler(h))
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
}

// peer ist eine Testverbindung, die im Hintergrund liest.
//
// Ein Lese-Timeout würde die WebSocket-Verbindung schließen – „hier darf nichts
// ankommen" ließe sich damit nur einmal je Verbindung prüfen. Deshalb läuft das
// Lesen dauerhaft in einen Kanal, und die Zusicherungen schauen nur hinein.
type peer struct {
	ws     *websocket.Conn
	inbox  chan string
	closed chan struct{}
}

func dial(t *testing.T, base, query string) *peer {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, base+"?"+query, nil)
	if err != nil {
		t.Fatalf("Verbindung fehlgeschlagen (%s): %v", query, err)
	}

	p := &peer{ws: ws, inbox: make(chan string, 16), closed: make(chan struct{})}
	go func() {
		defer close(p.closed)
		for {
			_, data, err := ws.Read(context.Background())
			if err != nil {
				return
			}
			var head envelopeHead
			if err := json.Unmarshal(data, &head); err != nil {
				continue
			}
			p.inbox <- head.Msg.Kind
		}
	}()

	t.Cleanup(func() { _ = ws.Close(websocket.StatusNormalClosure, "") })
	return p
}

func send(t *testing.T, p *peer, from, to, kind string) {
	t.Helper()
	env := map[string]any{
		"v": 1, "id": kind + "-" + from, "from": from, "ts": 0,
		"msg": map[string]any{"kind": kind},
	}
	if to != "" {
		env["to"] = to
	}
	payload, err := json.Marshal(env)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := p.ws.Write(ctx, websocket.MessageText, payload); err != nil {
		t.Fatalf("Senden fehlgeschlagen: %v", err)
	}
}

// sendRaw schickt beliebigen Text – für alles, was kein Umschlag ist.
func sendRaw(t *testing.T, p *peer, payload string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := p.ws.Write(ctx, websocket.MessageText, []byte(payload)); err != nil {
		t.Fatalf("Senden fehlgeschlagen: %v", err)
	}
}

// expect wartet auf die nächste Nachricht und prüft ihre Art.
func expect(t *testing.T, p *peer, want string) {
	t.Helper()
	select {
	case kind := <-p.inbox:
		if kind != want {
			t.Fatalf("erwartet %q, bekommen %q", want, kind)
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("keine Nachricht %q erhalten", want)
	}
}

// expectSilence stellt sicher, dass in der Wartezeit nichts ankommt.
func expectSilence(t *testing.T, p *peer) {
	t.Helper()
	select {
	case kind := <-p.inbox:
		t.Fatalf("unerwartete Nachricht durchgelassen: %q", kind)
	case <-time.After(300 * time.Millisecond):
	}
}

// expectClosed erwartet, dass die Verbindung beendet wurde.
func expectClosed(t *testing.T, p *peer) {
	t.Helper()
	select {
	case <-p.closed:
	case <-time.After(3 * time.Second):
		t.Fatal("Verbindung blieb entgegen der Erwartung offen")
	}
}

func TestHostKeyErforderlich(t *testing.T) {
	_, url := startServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, resp, err := websocket.Dial(ctx, url+"?room=r&device=d1&role=host&key=falsch", nil)
	if err == nil {
		t.Fatal("Verbindung mit falschem Schlüssel wurde angenommen")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("erwartet 403, bekommen %v", resp)
	}
}

func TestDeviceIdErforderlich(t *testing.T) {
	_, url := startServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, _, err := websocket.Dial(ctx, url+"?room=r", nil); err == nil {
		t.Fatal("Verbindung ohne Geräte-ID wurde angenommen")
	}
}

func TestNichtFreigegebenesGeraetErreichtNurMitHelloDenHost(t *testing.T) {
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	client := dial(t, url, "room=r&device=phone")

	// Eine Action ohne Freigabe darf den Host nicht erreichen.
	send(t, client, "phone", "", "action")
	expectSilence(t, host)

	// Die Anmeldung dagegen schon.
	send(t, client, "phone", "", "hello")
	expect(t, host, "hello")
}

func TestFreigabeSchaltetDasGeraetFrei(t *testing.T) {
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	client := dial(t, url, "room=r&device=phone")

	send(t, client, "phone", "", "hello")
	expect(t, host, "hello")

	// Host gibt frei – das Gerät bekommt die Bestätigung.
	send(t, host, "host", "phone", "welcome")
	expect(t, client, "welcome")

	// Ab jetzt kommen seine Actions beim Host an.
	send(t, client, "phone", "", "action")
	expect(t, host, "action")
}

func TestEntzugTrenntDieVerbindung(t *testing.T) {
	// „Keine Rechte mehr“ und „kommt nicht mehr durch“ sind zweierlei. Beim
	// Entzug muss beides gelten – sonst hinge ein abgemeldetes Gerät weiter in
	// der Leitung.
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	client := dial(t, url, "room=r&device=phone")

	send(t, client, "phone", "", "hello")
	expect(t, host, "hello")
	send(t, host, "host", "phone", "welcome")
	expect(t, client, "welcome")

	send(t, host, "host", "phone", "revoked")

	// Erst die Begründung, dann die Trennung – nicht umgekehrt.
	expect(t, client, "revoked")
	expectClosed(t, client)
}

func TestAbgewiesenesGeraetWirdGetrennt(t *testing.T) {
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	client := dial(t, url, "room=r&device=phone")

	send(t, client, "phone", "", "hello")
	expect(t, host, "hello")
	send(t, host, "host", "phone", "denied")

	expect(t, client, "denied")
	expectClosed(t, client)
}

// Dass die Sperre greift, lässt sich nur über eine neue Verbindung prüfen: Die
// alte wird beim Entzug geschlossen, ein Senden darüber wäre ein Rennen zwischen
// Schreiben und Trennen.
func TestNachEntzugKommtNichtsMehrDurch(t *testing.T) {
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	client := dial(t, url, "room=r&device=phone")

	send(t, client, "phone", "", "hello")
	expect(t, host, "hello")
	send(t, host, "host", "phone", "welcome")
	expect(t, client, "welcome")
	send(t, host, "host", "phone", "revoked")
	expect(t, client, "revoked")
	expectClosed(t, client)

	// Verbindet sich dasselbe Gerät neu, ist es wieder ein Fremder: Nur die
	// Anmeldung kommt durch, alles andere wird verworfen.
	wieder := dial(t, url, "room=r&device=phone")
	send(t, wieder, "phone", "", "action")
	expectSilence(t, host)
}

func TestZustandGehtNurAnFreigegebeneGeraete(t *testing.T) {
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	frei := dial(t, url, "room=r&device=frei")
	fremd := dial(t, url, "room=r&device=fremd")

	send(t, frei, "frei", "", "hello")
	expect(t, host, "hello")
	send(t, host, "host", "frei", "welcome")
	expect(t, frei, "welcome")

	send(t, host, "host", "", "state")
	expect(t, frei, "state")
	expectSilence(t, fremd)
}

func TestRaeumeSindGetrennt(t *testing.T) {
	_, url := startServer(t)
	hostA := dial(t, url, "room=see&device=hostA&role=host&key="+testKey)
	hostB := dial(t, url, "room=land&device=hostB&role=host&key="+testKey)
	client := dial(t, url, "room=see&device=phone")

	send(t, client, "phone", "", "hello")
	expect(t, hostA, "hello")
	expectSilence(t, hostB)
}

func TestGespeicherterZustandGehtAnEinRueckkehrendesGeraet(t *testing.T) {
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	client := dial(t, url, "room=r&device=phone")

	send(t, client, "phone", "", "hello")
	expect(t, host, "hello")
	send(t, host, "host", "phone", "welcome")
	expect(t, client, "welcome")

	send(t, host, "host", "", "state")
	expect(t, client, "state")

	// Verbindungsabbruch am See: Das Gerät kommt zurück und bekommt den
	// zwischengespeicherten Zustand sofort, ohne auf den Host zu warten.
	_ = client.ws.Close(websocket.StatusNormalClosure, "")
	expectClosed(t, client)

	wieder := dial(t, url, "room=r&device=phone")
	expect(t, wieder, "state")
}

func TestPingWirdNichtWeitergeleitet(t *testing.T) {
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	client := dial(t, url, "room=r&device=phone")

	send(t, client, "phone", "", "hello")
	expect(t, host, "hello")
	send(t, host, "host", "phone", "welcome")
	expect(t, client, "welcome")

	send(t, client, "phone", "", "ping")
	expectSilence(t, host)
}

// Das Lebenszeichen der Anwendung ist keine Umschlag-Nachricht mehr, sondern die
// feste Zeichenkette "ping" – nur so kann Cloudflare es beantworten, ohne das
// Durable Object zu wecken (siehe cloudflare/README.md). Hier bleibt deshalb
// festgehalten, dass dieses Relais sie verträgt: still verwerfen, Verbindung
// offen lassen, danach weiterarbeiten.
func TestFestesLebenszeichenStoertNicht(t *testing.T) {
	_, url := startServer(t)
	host := dial(t, url, "room=r&device=host&role=host&key="+testKey)
	client := dial(t, url, "room=r&device=phone")

	send(t, client, "phone", "", "hello")
	expect(t, host, "hello")
	send(t, host, "host", "phone", "welcome")
	expect(t, client, "welcome")

	sendRaw(t, client, `"ping"`)
	expectSilence(t, host)

	// Die Verbindung muss danach unverändert nutzbar sein.
	send(t, client, "phone", "", "action")
	expect(t, host, "action")
}

func TestNeuerHostVerdraengtDenAlten(t *testing.T) {
	_, url := startServer(t)
	alt := dial(t, url, "room=r&device=hostAlt&role=host&key="+testKey)
	neu := dial(t, url, "room=r&device=hostNeu&role=host&key="+testKey)

	// Der alte Host wird geschlossen …
	expectClosed(t, alt)

	// … und der neue empfängt ab jetzt die Anmeldungen.
	client := dial(t, url, "room=r&device=phone")
	send(t, client, "phone", "", "hello")
	expect(t, neu, "hello")
}

func TestCleanupRaeumtVerwaisteRaeume(t *testing.T) {
	h := newHub(testKey)
	r := h.room("alt")
	r.lastUsed = time.Now().Add(-time.Hour)

	h.cleanup(30 * time.Minute)

	h.mu.Lock()
	_, still := h.rooms["alt"]
	h.mu.Unlock()
	if still {
		t.Fatal("verwaister Raum wurde nicht aufgeräumt")
	}
}
