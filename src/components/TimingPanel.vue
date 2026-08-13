<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../state/store'
import { classColor, CLASS_IDS } from '../lib/classes'
import { classStats, DEFAULT_INTERVAL_S, formatDuration } from '../lib/timing'
import { klasseLookup } from '../state/reducer'
import type { ClassId, TimingTable } from '../types'

/**
 * Startabstände: gemessen und vorkonfiguriert.
 *
 * Aus den gemessenen Werten wird die Wartezeit-Prognose der öffentlichen
 * Startliste gerechnet. Am Ende der Veranstaltung lassen sich die Messwerte als
 * Vorgabe übernehmen – dann startet der nächste Wettkampf nicht wieder bei null.
 */
const store = useStore()

const stats = computed(() => classStats(store.state.runtimes, klasseLookup(store.state.starters)))

/** Klassen, die überhaupt vorkommen – der Rest würde die Tabelle nur aufblähen. */
const relevant = computed(() => {
  const used = new Set(store.state.starters.map((s) => s.klasse))
  return CLASS_IDS.filter((k) => used.has(k) || store.state.timings[k])
})

function setPreset(klasse: ClassId, seconds: number): void {
  const timings: TimingTable = { ...store.state.timings }
  if (seconds > 0) timings[klasse] = { avg: seconds, samples: 0 }
  else delete timings[klasse]
  store.dispatch({ type: 'SET_TIMINGS', timings })
}

const totalSamples = computed(() => [...stats.value.values()].reduce((s, x) => s + x.samples, 0))

/** Vorgaben als TSV, damit sie in die Unterlagen der Veranstaltung wandern können. */
const asText = computed(() =>
  relevant.value
    .map((k) => `${k}\t${Math.round(store.state.timings[k]?.avg ?? 0)}`)
    .join('\n'),
)
</script>

<template>
  <section class="card">
    <h2>Startabstände</h2>
    <p class="hint">
      Vorgabe in Sekunden je Klasse. Sobald genügend Starts gemessen sind, zählt der Messwert;
      vorher – und für die Anzeige vor dem ersten Start – die Vorgabe. Ohne beides wird mit
      {{ DEFAULT_INTERVAL_S }} s gerechnet.
    </p>

    <div class="scroll-x">
      <table>
        <thead>
          <tr>
            <th>Klasse</th>
            <th>Vorgabe (s)</th>
            <th>Gemessen</th>
            <th>Starts</th>
            <th>Zuletzt</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="klasse in relevant" :key="klasse">
            <td>
              <span class="badge" :style="{ background: classColor(klasse) }">{{ klasse }}</span>
            </td>
            <td>
              <input
                type="number"
                min="0"
                max="600"
                style="width: 5.5rem"
                :value="Math.round(store.state.timings[klasse]?.avg ?? 0)"
                @change="setPreset(klasse, Number(($event.target as HTMLInputElement).value))"
              />
            </td>
            <td class="mono">
              {{ stats.get(klasse) ? formatDuration(stats.get(klasse)!.avg) : '–' }}
            </td>
            <td class="dim">{{ stats.get(klasse)?.samples ?? 0 }}</td>
            <td class="mono dim">
              {{ stats.get(klasse)?.last != null ? formatDuration(stats.get(klasse)!.last!) : '–' }}
            </td>
          </tr>
          <tr v-if="!relevant.length">
            <td colspan="5" class="dim">Noch keine Starter importiert.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="row" style="margin-top: 0.75rem">
      <button
        :disabled="!totalSamples"
        @click="store.dispatch({ type: 'ADOPT_MEASURED_TIMINGS' })"
      >
        Messwerte als Vorgabe übernehmen
      </button>
      <span class="dim small">{{ totalSamples }} gemessene Startabstände</span>
    </div>

    <details style="margin-top: 0.5rem">
      <summary class="small dim">Vorgaben als Text (für die Unterlagen)</summary>
      <pre class="mono small">{{ asText }}</pre>
    </details>
  </section>
</template>
