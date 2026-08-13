package main

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Das Relais leitet ausschließlich weiter – es kennt weder Starterlisten noch
// Rechte. Die einzige Wahrheit ist der Host (der Rechner an der Tafel); er
// entscheidet, wer sich anmelden darf und was ein Gerät ändern kann.
//
// Damit ein noch nicht freigegebenes Gerät nicht einfach mitreden kann, gilt
// hier genau eine Regel: Wer nicht freigegeben ist, darf nur ein "hello"
// schicken. Alles andere wird verworfen, bevor es irgendwen erreicht.

const (
	writeTimeout = 10 * time.Second
	// Wer sich so lange nicht meldet, gilt als weg. Die Anwendung schickt alle
	// 25 s ein "ping", das Fenster ist also großzügig bemessen.
	readTimeout = 90 * time.Second
	// So viele Nachrichten dürfen sich pro Verbindung stauen, bevor sie als
	// hängend gilt und geschlossen wird.
	sendBuffer = 64
	maxMessage = 4 << 20 // 4 MiB – eine große Starterliste als Gesamtzustand
)

// envelopeHead ist der Teil des Protokolls, den das Relais verstehen muss.
// Der Rest der Nachricht wird unverändert durchgereicht.
type envelopeHead struct {
	From string `json:"from"`
	To   string `json:"to"`
	Msg  struct {
		Kind string `json:"kind"`
	} `json:"msg"`
}

type conn struct {
	ws        *websocket.Conn
	deviceID  string
	isHost    bool
	send      chan []byte
	closeOnce sync.Once
	done      chan struct{}
}

func newConn(ws *websocket.Conn, deviceID string, isHost bool) *conn {
	return &conn{
		ws:       ws,
		deviceID: deviceID,
		isHost:   isHost,
		send:     make(chan []byte, sendBuffer),
		done:     make(chan struct{}),
	}
}

// queueClose beendet die Verbindung, **nachdem** alles Eingestellte geschrieben
// wurde. Ein sofortiges Schließen würde die letzte Nachricht verschlucken – und
// genau die ist beim Rechteentzug die wichtige.
func (c *conn) queueClose() {
	c.queue(nil)
}

// queue stellt eine Nachricht zum Senden ein. Ist der Puffer voll, hängt die
// Gegenstelle – dann wird die Verbindung geschlossen, statt den Hub zu bremsen.
func (c *conn) queue(payload []byte) {
	select {
	case c.send <- payload:
	default:
		c.close()
	}
}

func (c *conn) close() {
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.ws.Close(websocket.StatusNormalClosure, "")
	})
}

// writeLoop serialisiert alle Schreibvorgänge – ein WebSocket verträgt immer
// nur einen Schreiber gleichzeitig.
func (c *conn) writeLoop() {
	for {
		select {
		case <-c.done:
			return
		case payload := <-c.send:
			if payload == nil {
				// Schließ-Marke: alles davor ist geschrieben.
				c.close()
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := c.ws.Write(ctx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				c.close()
				return
			}
		}
	}
}

type room struct {
	name     string
	mu       sync.Mutex
	host     *conn
	clients  map[*conn]bool
	approved map[string]bool
	// Letzter vom Host verteilter Gesamtzustand. Ein Gerät, das später dazukommt,
	// bekommt ihn sofort – auch wenn der Host gerade nichts zu senden hat.
	lastState []byte
	lastUsed  time.Time
}

func newRoom(name string) *room {
	return &room{
		name:     name,
		clients:  make(map[*conn]bool),
		approved: make(map[string]bool),
		lastUsed: time.Now(),
	}
}

type hub struct {
	mu      sync.Mutex
	rooms   map[string]*room
	hostKey string
}

func newHub(hostKey string) *hub {
	return &hub{rooms: make(map[string]*room), hostKey: hostKey}
}

func (h *hub) room(name string) *room {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[name]
	if !ok {
		r = newRoom(name)
		h.rooms[name] = r
	}
	r.lastUsed = time.Now()
	return r
}

// join meldet eine Verbindung im Raum an. Ein zweiter Host verdrängt den ersten –
// das ist der Fall „Tafelrechner neu gestartet".
func (r *room) join(c *conn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lastUsed = time.Now()

	if c.isHost {
		if r.host != nil && r.host != c {
			old := r.host
			go old.close()
		}
		r.host = c
		return
	}
	r.clients[c] = true
	if r.lastState != nil {
		// Nur ein Zustand für ein bereits freigegebenes Gerät; sonst wartet es
		// auf das "welcome" des Hosts.
		if r.approved[c.deviceID] {
			c.queue(r.lastState)
		}
	}
}

func (r *room) leave(c *conn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.host == c {
		r.host = nil
	}
	delete(r.clients, c)
}

func (r *room) hostConn() *conn {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.host
}

func (r *room) isApproved(deviceID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.approved[deviceID]
}

func (r *room) approve(deviceID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.approved[deviceID] = true
}

func (r *room) revoke(deviceID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.approved, deviceID)
}

func (r *room) rememberState(payload []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	buf := make([]byte, len(payload))
	copy(buf, payload)
	r.lastState = buf
}

// broadcast schickt an alle freigegebenen Geräte (nicht an den Host selbst).
func (r *room) broadcast(payload []byte) {
	r.mu.Lock()
	targets := make([]*conn, 0, len(r.clients))
	for c := range r.clients {
		if r.approved[c.deviceID] {
			targets = append(targets, c)
		}
	}
	r.mu.Unlock()

	for _, c := range targets {
		c.queue(payload)
	}
}

func (r *room) sendTo(deviceID string, payload []byte) {
	for _, c := range r.connsOf(deviceID) {
		c.queue(payload)
	}
}

func (r *room) connsOf(deviceID string) []*conn {
	r.mu.Lock()
	defer r.mu.Unlock()
	targets := make([]*conn, 0, 1)
	for c := range r.clients {
		if c.deviceID == deviceID {
			targets = append(targets, c)
		}
	}
	return targets
}

/*
sendToAndClose stellt die Nachricht zu und trennt danach die Verbindung.

Beim Entzug der Rechte reicht es nicht, das Gerät nur als „nicht freigegeben“ zu
führen: Es soll die Verbindung verlieren und sich neu anmelden müssen. Die
Nachricht geht trotzdem zuerst raus, damit auf dem Gerät ein Grund erscheint und
nicht bloß eine tote Leitung.
*/
func (r *room) sendToAndClose(deviceID string, payload []byte) {
	for _, c := range r.connsOf(deviceID) {
		c.queue(payload)
		c.queueClose()
	}
}

// handleMessage entscheidet, wohin eine Nachricht geht.
func (r *room) handleMessage(from *conn, payload []byte) {
	var head envelopeHead
	if err := json.Unmarshal(payload, &head); err != nil {
		return
	}

	// Lebenszeichen gehen niemanden etwas an – das Lesen selbst hat die
	// Verbindung bereits als lebendig bestätigt.
	if head.Msg.Kind == "ping" {
		return
	}

	if from.isHost {
		switch head.Msg.Kind {
		case "welcome":
			if head.To != "" {
				r.approve(head.To)
				r.sendTo(head.To, payload)
			}
		case "denied", "revoked":
			if head.To != "" {
				r.revoke(head.To)
				// Der Zustand des Geräts wird ebenfalls vergessen – sonst bekäme
				// ein neu verbundenes Gerät gleicher Kennung ihn wieder.
				r.sendToAndClose(head.To, payload)
			}
		case "state":
			if head.To != "" {
				r.sendTo(head.To, payload)
			} else {
				r.rememberState(payload)
				r.broadcast(payload)
			}
		default:
			if head.To != "" {
				r.sendTo(head.To, payload)
			} else {
				r.broadcast(payload)
			}
		}
		return
	}

	// Alles von Clients geht ausschließlich an den Host.
	host := r.hostConn()
	if host == nil {
		return
	}
	if !r.isApproved(from.deviceID) && head.Msg.Kind != "hello" {
		// Nicht freigegeben: nur die Anmeldung darf durch.
		return
	}
	host.queue(payload)
}

// readLoop liest bis zum Verbindungsende.
func (r *room) readLoop(ctx context.Context, c *conn) {
	for {
		readCtx, cancel := context.WithTimeout(ctx, readTimeout)
		typ, data, err := c.ws.Read(readCtx)
		cancel()
		if err != nil {
			return
		}
		if typ != websocket.MessageText {
			continue
		}
		r.handleMessage(c, data)
	}
}

// cleanup räumt Räume weg, in denen seit einer Weile niemand mehr war.
func (h *hub) cleanup(maxIdle time.Duration) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for name, r := range h.rooms {
		r.mu.Lock()
		empty := r.host == nil && len(r.clients) == 0
		idle := time.Since(r.lastUsed) > maxIdle
		r.mu.Unlock()
		if empty && idle {
			delete(h.rooms, name)
			log.Printf("Raum %q aufgeräumt", name)
		}
	}
}
