<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore } from '../state/store'
import { clearState, downloadState, parseBackup } from '../lib/storage'
import type { AppState } from '../types'

/**
 * Sicherung herunterladen und wieder einspielen.
 *
 * Das Einspielen ist nicht nur für den Notfall da: Basis-Version und
 * Pro-Version laufen unter **verschiedenen Herkünften** – die eine als Datei
 * (`file://`), die andere über das Mini-Programm (`http://192.168…`). Browser
 * trennen den Speicher danach, ein Umzug geht also nur über eine Datei.
 *
 * Weil das Einspielen alles ersetzt, wird die Datei erst geprüft und mit ihrem
 * Inhalt vorgestellt; übernommen wird sie erst auf ausdrückliche Bestätigung.
 */
const store = useStore()

const fehler = ref('')
const geladen = ref<{ state: AppState; savedAt: string | null; dateiname: string } | null>(null)

function backup(): void {
  const datum = new Date().toISOString().slice(0, 10)
  const name = store.state.eventName.trim().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '')
  downloadState(store.state, `tafel-${name || 'sicherung'}-${datum}.json`)
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  fehler.value = ''
  geladen.value = null
  if (!file) return

  const result = parseBackup(await file.text())
  if (!result.ok) {
    fehler.value = result.reason
    return
  }
  geladen.value = { state: result.state, savedAt: result.savedAt, dateiname: file.name }
}

/** Was in der gewählten Datei steckt – vor dem Übernehmen zum Nachlesen. */
const inhalt = computed(() => {
  const state = geladen.value?.state
  if (!state) return null
  const starts = (state.runtimes ?? []).reduce((sum, rt) => sum + (rt.slots?.length ?? 0), 0)
  const gefahren = (state.runtimes ?? []).reduce(
    (sum, rt) => sum + (rt.slots ?? []).filter((s) => s.status === 'done').length,
    0,
  )
  return {
    eventName: state.eventName || '(ohne Namen)',
    starter: state.starters.length,
    parcours: state.parcoursList.length,
    starts,
    gefahren,
  }
})

const savedAtText = computed(() => {
  const iso = geladen.value?.savedAt
  if (!iso) return 'unbekannt'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'unbekannt' : date.toLocaleString('de-DE')
})

function uebernehmen(): void {
  const eintrag = geladen.value
  if (!eintrag) return
  const laufend = store.state.runtimes.some((rt) => rt.history.length > 0)
  if (
    laufend &&
    !confirm(
      'Auf diesem Rechner läuft bereits eine Veranstaltung. Die Sicherung ersetzt Starterliste, Startlisten und Einstellungen vollständig. Fortfahren?',
    )
  ) {
    return
  }
  store.dispatch({ type: 'LOAD_STATE', state: eintrag.state })
  geladen.value = null
}

function resetAll(): void {
  if (!confirm('Wirklich alles zurücksetzen? Starter, Startlisten und Einstellungen werden gelöscht.'))
    return
  store.dispatch({ type: 'RESET' })
  clearState()
}
</script>

<template>
  <section class="card stack">
    <h2>Sicherung</h2>

    <div class="row">
      <button @click="backup">Sicherung herunterladen</button>
      <label class="button">
        Sicherung laden …
        <input type="file" accept="application/json,.json" hidden @change="onFile" />
      </label>
      <button class="danger" style="margin-left: auto" @click="resetAll">Alles zurücksetzen</button>
    </div>

    <p class="hint">
      Alles liegt im Browser dieses Rechners. Vor der Veranstaltung eine Sicherung herunterzuladen
      kostet nichts und rettet den Tag, wenn der Rechner getauscht werden muss.
    </p>

    <p v-if="fehler" class="hint error">{{ fehler }}</p>

    <div v-if="geladen && inhalt" class="vorschau stack">
      <strong>{{ geladen.dateiname }}</strong>
      <div class="scroll-x">
        <table>
          <tbody>
            <tr>
              <th>Veranstaltung</th>
              <td>{{ inhalt.eventName }}</td>
            </tr>
            <tr>
              <th>Gespeichert am</th>
              <td>{{ savedAtText }}</td>
            </tr>
            <tr>
              <th>Starter</th>
              <td>{{ inhalt.starter }}</td>
            </tr>
            <tr>
              <th>Parcours</th>
              <td>{{ inhalt.parcours }}</td>
            </tr>
            <tr>
              <th>Starts in den Listen</th>
              <td>{{ inhalt.starts }} <span class="dim">({{ inhalt.gefahren }} davon gefahren)</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="hint warn">
        Übernehmen ersetzt Starterliste, Startlisten, Zeiten und Einstellungen dieses Rechners
        vollständig.
      </p>
      <div class="row">
        <button class="primary" @click="uebernehmen">Jetzt übernehmen</button>
        <button @click="geladen = null">Abbrechen</button>
      </div>
    </div>

    <details>
      <summary class="small dim">Von der Basis- auf die Pro-Version umziehen</summary>
      <ol class="hint" style="margin-top: 0.4rem">
        <li>In der Basis-Version <strong>Sicherung herunterladen</strong>.</li>
        <li>Das Mini-Programm aus <span class="mono">server/</span> starten und die angezeigte
          Adresse im Browser öffnen.</li>
        <li>Dort unter <strong>Geräte → Verbindung</strong> „Lokales Netz" einrichten.</li>
        <li>Hier die Datei über <strong>Sicherung laden</strong> einspielen.</li>
      </ol>
      <p class="hint">
        Der Umweg über die Datei ist nötig, weil die Basis-Version als Datei läuft und die
        Pro-Version über eine Adresse im Netz – Browser halten die Speicher beider strikt getrennt.
        Die Verbindungsdaten (Adresse und Host-Schlüssel) stecken bewusst <em>nicht</em> in der
        Sicherung; sie gehören zum Rechner, nicht zur Veranstaltung.
      </p>
    </details>
  </section>
</template>

<style scoped>
.vorschau {
  padding: 0.75rem 1rem;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.vorschau th {
  text-transform: none;
  font-size: 0.85rem;
  white-space: nowrap;
  width: 12rem;
}

label.button {
  cursor: pointer;
}

ol {
  padding-left: 1.2rem;
}
</style>
