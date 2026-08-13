// Tafel-Relais: ein einzelnes Programm, das die Anwendung im lokalen Netz
// ausliefert und Tafel, Verwaltung und Handys miteinander verbindet.
//
// Es ist bewusst so gebaut, dass am Wettkampfort nichts installiert werden muss:
// eine Datei herunterladen, doppelklicken, fertig. Kein Node, kein Python, keine
// Adminrechte, kein Internet.
package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/coder/websocket"
)

//go:embed all:web
var embeddedWeb embed.FS

// Alphabet ohne verwechselbare Zeichen – identisch zur Anwendung, damit ein
// vorgelesener Host-Schlüssel nicht an 0/O oder 1/l scheitert.
const keyAlphabet = "0123456789ACDEFGHJKMNPQRTVWXY"

func randomKey(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		// Ohne Zufallsquelle lieber abbrechen als einen ratbaren Schlüssel nutzen.
		log.Fatalf("keine Zufallsquelle verfügbar: %v", err)
	}
	out := make([]byte, n)
	for i, b := range buf {
		out[i] = keyAlphabet[int(b)%len(keyAlphabet)]
	}
	return string(out)
}

// lanAddresses sammelt die IPv4-Adressen, unter denen der Rechner im lokalen
// Netz erreichbar ist – genau die, die aufs Handy müssen.
func lanAddresses() []string {
	var out []string
	ifaces, err := net.Interfaces()
	if err != nil {
		return out
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ipnet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipnet.IP.To4()
			if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
				continue
			}
			out = append(out, ip.String())
		}
	}
	return out
}

func main() {
	addr := flag.String("addr", ":8080", "Adresse, auf der gelauscht wird")
	hostKey := flag.String("key", "", "Host-Schlüssel (leer = wird erzeugt)")
	webDir := flag.String("web", "", "Verzeichnis mit der Anwendung (leer = eingebaute Fassung)")
	flag.Parse()

	key := *hostKey
	if key == "" {
		key = randomKey(8)
	}

	h := newHub(key)

	var static http.Handler
	if *webDir != "" {
		static = http.FileServer(http.Dir(*webDir))
	} else {
		sub, err := fs.Sub(embeddedWeb, "web")
		if err != nil {
			log.Fatalf("eingebaute Anwendung nicht lesbar: %v", err)
		}
		if _, err := fs.Stat(sub, "index.html"); err != nil {
			// Ohne `make` gebaut: Das Relais funktioniert, aber es gibt nichts
			// auszuliefern. Lieber klar sagen als eine leere Seite zeigen.
			static = http.HandlerFunc(explainMissingWeb)
		} else {
			static = http.FileServer(http.FS(sub))
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", wsHandler(h))
	mux.HandleFunc("/adressen", addressHandler(*addr))
	mux.HandleFunc("/gesund", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.Handle("/", static)

	server := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	printBanner(*addr, key)

	// Verwaiste Räume regelmäßig wegräumen.
	stopCleanup := make(chan struct{})
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-stopCleanup:
				return
			case <-ticker.C:
				h.cleanup(30 * time.Minute)
			}
		}
	}()

	// Sauber beenden, damit offene Verbindungen ein Close bekommen.
	idleClosed := make(chan struct{})
	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint
		fmt.Println("\nWird beendet …")
		close(stopCleanup)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
		close(idleClosed)
	}()

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Start fehlgeschlagen: %v", err)
	}
	<-idleClosed
}

// portOf liest den Port aus einer Lauschadresse wie ":8080" oder "0.0.0.0:8080".
func portOf(addr string) string {
	if i := strings.LastIndex(addr, ":"); i >= 0 {
		return addr[i+1:]
	}
	return addr
}

// addressResponse nennt der Anwendung, unter welchen Adressen das Relais
// erreichbar ist.
type addressResponse struct {
	// WebSocket-Adressen für das Feld „Adresse des Relais“.
	Relais []string `json:"relais"`
	// Dieselben Adressen als Seitenaufruf – für QR-Code und Weitergabe.
	Seite []string `json:"seite"`
}

/*
addressHandler liefert die Adressen, unter denen dieser Rechner im lokalen Netz
erreichbar ist.

Der Browser kennt immer nur die eine Adresse, über die er die Seite geladen hat –
und das ist oft `localhost`, mit der kein Handy etwas anfangen kann. Nur der
Server selbst kennt alle Netzwerkkarten. Der Host-Schlüssel wird hier bewusst
**nicht** ausgeliefert; die Auskunft ist offen erreichbar.
*/
func addressHandler(addr string) http.HandlerFunc {
	port := portOf(addr)
	return func(w http.ResponseWriter, _ *http.Request) {
		out := addressResponse{Relais: []string{}, Seite: []string{}}
		for _, ip := range lanAddresses() {
			out.Relais = append(out.Relais, fmt.Sprintf("ws://%s:%s/ws", ip, port))
			out.Seite = append(out.Seite, fmt.Sprintf("http://%s:%s/", ip, port))
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.NewEncoder(w).Encode(out); err != nil {
			log.Printf("Adressen konnten nicht ausgeliefert werden: %v", err)
		}
	}
}

// explainMissingWeb erklärt, warum keine Anwendung ausgeliefert wird.
func explainMissingWeb(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte(`<!doctype html><html lang="de"><meta charset="utf-8">
<title>Anwendung nicht eingebaut</title>
<body style="font-family:system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem">
<h1>Anwendung nicht eingebaut</h1>
<p>Dieses Programm wurde ohne die Weboberfläche gebaut. Im Ordner
<code>server/</code> einmal <code>make</code> ausführen – das baut die Anwendung
und bettet sie ein.</p>
<p>Das Relais selbst läuft: <code>/ws</code> nimmt Verbindungen an.</p>
</body></html>`))
}

func printBanner(addr, key string) {
	port := addr
	if i := strings.LastIndex(addr, ":"); i >= 0 {
		port = addr[i+1:]
	}

	fmt.Println("Tafel-Relais läuft.")
	fmt.Println()
	fmt.Println("  Host-Schlüssel:", key)
	fmt.Println("  (in der Verwaltung unter „Verbindung“ eintragen)")
	fmt.Println()

	ips := lanAddresses()
	if len(ips) == 0 {
		fmt.Println("  Keine Netzwerkadresse gefunden – ist WLAN oder Hotspot an?")
		fmt.Printf("  Nur auf diesem Rechner: http://localhost:%s/\n", port)
	} else {
		fmt.Println("  Im Browser öffnen (Tafel und Verwaltung):")
		for _, ip := range ips {
			fmt.Printf("    http://%s:%s/\n", ip, port)
		}
		fmt.Println()
		fmt.Println("  Adresse für die Verwaltung (Feld „Adresse des Relais“):")
		for _, ip := range ips {
			fmt.Printf("    ws://%s:%s/ws\n", ip, port)
		}
	}
	fmt.Println()
	fmt.Println("Beenden mit Strg+C.")
	fmt.Println()
}

func wsHandler(h *hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		roomName := query.Get("room")
		if roomName == "" {
			roomName = "default"
		}
		deviceID := query.Get("device")
		if deviceID == "" {
			http.Error(w, "device fehlt", http.StatusBadRequest)
			return
		}

		wantsHost := query.Get("role") == "host"
		if wantsHost && subtle.ConstantTimeCompare([]byte(query.Get("key")), []byte(h.hostKey)) != 1 {
			http.Error(w, "falscher Host-Schlüssel", http.StatusForbidden)
			return
		}

		// Die Seite kann von der eingebauten Fassung, von GitHub Pages oder als
		// einzelne Datei (Origin "null") kommen – Origin-Prüfung hilft hier nicht.
		// Der Schutz liegt beim Host-Schlüssel und beim Freigabe-Verfahren.
		ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: []string{"*"},
		})
		if err != nil {
			return
		}
		ws.SetReadLimit(maxMessage)

		c := newConn(ws, deviceID, wantsHost)
		room := h.room(roomName)
		room.join(c)

		role := "Gerät"
		if wantsHost {
			role = "Host"
		}
		log.Printf("%s %s verbunden (Raum %q)", role, deviceID, roomName)

		go c.writeLoop()
		room.readLoop(r.Context(), c)

		room.leave(c)
		c.close()
		log.Printf("%s %s getrennt (Raum %q)", role, deviceID, roomName)
	}
}
