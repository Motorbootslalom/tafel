# Baut das Relais als eigenständige Datei – mit eingebauter Weboberfläche.
#
#   make            → Programm für diesen Rechner (build/tafel-relais)
#   make alle       → Windows, macOS (Intel + Apple Silicon) und Linux
#   make sauber     → Aufräumen
#
# Die gebauten Dateien brauchen nichts weiter: kein Node, kein Installer, keine
# Adminrechte. Kopieren, doppelklicken, fertig.

BINARY  := tafel-relais
BUILD   := build
LDFLAGS := -s -w

.PHONY: standard alle web sauber test

standard: web
	go build -ldflags "$(LDFLAGS)" -o $(BUILD)/$(BINARY) .
	@echo "Fertig: $(BUILD)/$(BINARY)"

# Die Weboberfläche wird in das Programm eingebettet, damit Handys sie auch
# ohne Internet vom Bedienrechner laden können.
web:
	cd .. && npm run build
	rm -rf web
	mkdir -p web
	cp -r ../dist/. web/

alle: web
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BUILD)/$(BINARY)-windows-amd64.exe .
	GOOS=darwin  GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BUILD)/$(BINARY)-macos-intel .
	GOOS=darwin  GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o $(BUILD)/$(BINARY)-macos-apple .
	GOOS=linux   GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BUILD)/$(BINARY)-linux-amd64 .
	@echo "Fertig:"
	@ls -1sh $(BUILD)

test:
	go vet ./...
	go test ./...

sauber:
	rm -rf $(BUILD)
