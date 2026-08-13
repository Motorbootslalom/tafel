package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Die Adress-Auskunft ist offen erreichbar – sie darf deshalb nichts
// Vertrauliches enthalten.

func TestPortOf(t *testing.T) {
	fälle := map[string]string{
		":8080":         "8080",
		"0.0.0.0:8080":  "8080",
		"127.0.0.1:900": "900",
		"8080":          "8080",
	}
	for eingabe, erwartet := range fälle {
		if got := portOf(eingabe); got != erwartet {
			t.Errorf("portOf(%q) = %q, erwartet %q", eingabe, got, erwartet)
		}
	}
}

func TestAdressenLiefertWebSocketAdressen(t *testing.T) {
	rec := httptest.NewRecorder()
	addressHandler(":8080")(rec, httptest.NewRequest(http.MethodGet, "/adressen", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("erwartet 200, bekommen %d", rec.Code)
	}

	var out addressResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("Antwort unlesbar: %v", err)
	}

	// Ohne Netzwerkkarte kann die Liste leer sein – dann ist nichts zu prüfen.
	for _, adresse := range out.Relais {
		if !strings.HasPrefix(adresse, "ws://") || !strings.HasSuffix(adresse, ":8080/ws") {
			t.Errorf("unerwartete Relais-Adresse: %q", adresse)
		}
	}
	for _, adresse := range out.Seite {
		if !strings.HasPrefix(adresse, "http://") {
			t.Errorf("unerwartete Seiten-Adresse: %q", adresse)
		}
	}
	if len(out.Relais) != len(out.Seite) {
		t.Errorf("Relais und Seite passen nicht zusammen: %d vs %d", len(out.Relais), len(out.Seite))
	}
}

func TestAdressenVerraetDenHostSchluesselNicht(t *testing.T) {
	// Die Auskunft ist ohne Anmeldung erreichbar. Käme der Schlüssel mit, könnte
	// sich jeder im Netz als Host ausgeben und die Tafel übernehmen.
	h := newHub("GEHEIM12")
	mux := http.NewServeMux()
	mux.HandleFunc("/adressen", addressHandler(":8080"))
	mux.HandleFunc("/ws", wsHandler(h))

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/adressen", nil))

	if strings.Contains(rec.Body.String(), "GEHEIM12") {
		t.Fatal("der Host-Schlüssel steht in der Antwort")
	}
}

func TestAdressenIstNichtZwischenspeicherbar(t *testing.T) {
	// Beim Wechsel ins Hotspot-Netz ändern sich die Adressen; eine
	// zwischengespeicherte Antwort wäre dann falsch.
	rec := httptest.NewRecorder()
	addressHandler(":8080")(rec, httptest.NewRequest(http.MethodGet, "/adressen", nil))

	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("Cache-Control fehlt: %q", rec.Header().Get("Cache-Control"))
	}
}
