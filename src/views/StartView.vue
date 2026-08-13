<script setup lang="ts">
import { useStore } from '../state/store'
import { navigate, viewUrl } from '../lib/router'
import { buildLabel } from '../lib/build'

const store = useStore()

/**
 * Beim Öffnen aus diesem Fenster besteht eine direkte Fensterverbindung – so
 * bekommt die Tafel ihre Aktualisierungen auch dann, wenn die Anwendung als
 * einzelne HTML-Datei von `file://` läuft.
 */
function openBoard(): void {
  const win = window.open(viewUrl('tafel'), 'tafel-anzeige')
  if (win) store.registerPeerWindow(win)
}
</script>

<template>
  <div class="page">
    <h1>Tafel – Motorbootslalom</h1>
    <p class="dim">
      Wähle, was dieses Fenster sein soll. Üblich sind zwei Fenster: die Tafel im Vollbild auf dem
      Anzeigemonitor und die Verwaltung auf dem Bedienrechner.
    </p>

    <div class="grid">
      <section class="card">
        <h2>Anzeigetafel</h2>
        <p class="dim small">
          Schwarzer Grund, große Startnummer, für 50 m Leseabstand. Im zweiten Fenster im Vollbild
          (Taste <kbd>F</kbd> oder Doppelklick).
        </p>
        <div class="row">
          <button class="primary" @click="openBoard">In neuem Fenster öffnen</button>
          <button @click="navigate('tafel')">Hier anzeigen</button>
        </div>
      </section>

      <section class="card">
        <h2>Verwaltung</h2>
        <p class="dim small">
          Starterliste importieren, Parcours und Verzahnung einstellen, Startlisten erzeugen,
          Darstellung der Tafel festlegen und mobile Geräte freischalten.
        </p>
        <button class="primary" @click="navigate('admin')">Verwaltung öffnen</button>
      </section>

      <section class="card">
        <h2>Steg</h2>
        <p class="dim small">
          Die Bedienung während des Wettkampfs: nächster Starter, Starter zurückstellen und wieder
          aktivieren, Klasse verschieben, Störung melden.
        </p>
        <button class="primary" @click="navigate('steg')">Steg-Bedienung öffnen</button>
      </section>

      <section class="card">
        <h2>Startliste</h2>
        <p class="dim small">
          Für Teilnehmer und Zuschauer: wer wann dran ist, mit geschätzter Wartezeit aus den
          gemessenen Startabständen.
        </p>
        <button class="primary" @click="navigate('liste')">Startliste anzeigen</button>
      </section>

      <section class="card">
        <h2>Dieses Gerät verbinden</h2>
        <p class="dim small">
          Für Handys und Tablets am Steg: QR-Code scannen oder den sechsstelligen Geräte-Code
          eingeben, den die Verwaltung anzeigt.
        </p>
        <button @click="navigate('pair')">Mit Code verbinden</button>
      </section>
    </div>

    <p class="hint">
      Alle Daten liegen im Browser dieses Rechners (localStorage). Ohne Verbindung nach außen läuft
      die Basis-Version vollständig offline.
    </p>
    <p class="hint">Stand dieser Oberfläche: {{ buildLabel() }}</p>
  </div>
</template>
