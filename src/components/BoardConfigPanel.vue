<script setup lang="ts">
import { ref } from 'vue'
import { useStore } from '../state/store'
import type { BoardConfig, OriginMode } from '../types'

/**
 * Darstellung der Tafel. Die Vorgaben stammen aus der alten Word-Vorlage:
 * schwarzer Grund, sehr große Startnummer, Verein kleiner. Einstellbar bleiben
 * Kopfzeile, Logo, Herkunftsangabe und ein Größenfaktor für Monitore, die von
 * der üblichen Geometrie abweichen.
 */
const store = useStore()
const logoError = ref('')

/** Logos werden als Data-URL gespeichert – dann ist die Tafel eine Datei ohne Anhang. */
const MAX_LOGO_BYTES = 400 * 1024

function onLogo(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > MAX_LOGO_BYTES) {
    logoError.value = `Datei ist ${Math.round(file.size / 1024)} kB groß – bitte unter ${
      MAX_LOGO_BYTES / 1024
    } kB bleiben, sonst wird der Speicher des Browsers knapp.`
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    logoError.value = ''
    store.dispatch({ type: 'SET_BOARD', patch: { logoDataUrl: String(reader.result) } })
  }
  reader.readAsDataURL(file)
}

const set = (patch: Partial<BoardConfig>) => store.dispatch({ type: 'SET_BOARD', patch })
</script>

<template>
  <section class="card stack">
    <h2>Darstellung der Tafel</h2>

    <label class="field">
      Kopfzeile (leer = keine)
      <!-- @input, damit die Tafel schon beim Tippen mitzieht (siehe Parcours-Name). -->
      <input
        :value="store.state.board.kopfzeile"
        placeholder="z. B. 20. Beetzseepokal"
        @input="set({ kopfzeile: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <div class="row">
      <label class="row-tight small">
        Logo
        <input type="file" accept="image/*" @change="onLogo" />
      </label>
      <img
        v-if="store.state.board.logoDataUrl"
        :src="store.state.board.logoDataUrl"
        alt="Logo"
        class="logo-preview"
      />
      <button
        v-if="store.state.board.logoDataUrl"
        class="danger"
        @click="set({ logoDataUrl: '' })"
      >
        Logo entfernen
      </button>
    </div>
    <p v-if="logoError" class="hint error">{{ logoError }}</p>

    <div class="row">
      <label class="row-tight">
        Herkunft
        <select
          :value="store.state.board.originMode"
          @change="set({ originMode: ($event.target as HTMLSelectElement).value as OriginMode })"
        >
          <option value="verein">Verein</option>
          <option value="bundesland">Bundesland</option>
        </select>
      </label>

      <label class="row-tight">
        <input
          type="checkbox"
          :checked="store.state.board.showPrevious"
          @change="set({ showPrevious: ($event.target as HTMLInputElement).checked })"
        />
        Starter davor anzeigen
      </label>

      <label class="row-tight">
        <input
          type="checkbox"
          :checked="store.state.board.showParcoursName"
          @change="set({ showParcoursName: ($event.target as HTMLInputElement).checked })"
        />
        Parcours-Namen anzeigen
      </label>

      <label class="row-tight">
        <input
          type="checkbox"
          :checked="store.state.board.showVorname"
          @change="set({ showVorname: ($event.target as HTMLInputElement).checked })"
        />
        Vorname anzeigen
      </label>
    </div>

    <label class="field">
      Schriftgröße ({{ Math.round(store.state.board.scale * 100) }} %)
      <input
        type="range"
        min="0.7"
        max="1.3"
        step="0.05"
        :value="store.state.board.scale"
        @input="set({ scale: Number(($event.target as HTMLInputElement).value) })"
      />
    </label>
    <p class="hint">
      Die Tafel steht in 50 m Entfernung. Die Startnummer ist bewusst deutlich größer als alles
      andere; Name und Verein sind für die Zuschauer gedacht und dürfen kleiner bleiben.
    </p>
  </section>
</template>

<style scoped>
.logo-preview {
  height: 2.5rem;
  width: auto;
  background: #000;
  border-radius: 6px;
  padding: 2px;
}
</style>
