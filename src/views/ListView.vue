<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useStore } from '../state/store'
import AppNav from '../components/AppNav.vue'
import { classColor } from '../lib/classes'
import { currentSlot, isClassPaused } from '../lib/startlist'
import { classStats, estimator, formatDuration, formatWait, waitEstimates } from '../lib/timing'
import { klasseLookup } from '../state/reducer'
import type { ClassId, ParcoursRuntime } from '../types'

/**
 * Die öffentliche Startliste: Wer ist dran, wer kommt, und – die eigentlich
 * gefragte Information – wie lange muss ich noch warten?
 *
 * Die Prognose stützt sich auf die gemessenen Startabstände dieser
 * Veranstaltung; solange zu wenige Messungen vorliegen, zählen die
 * vorkonfigurierten Werte aus früheren Wettkämpfen.
 */
const store = useStore()

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  ticker = setInterval(() => (now.value = Date.now()), 5000)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

const klasseOf = computed(() => klasseLookup(store.state.starters))
const stats = computed(() => classStats(store.state.runtimes, klasseOf.value))
const estimate = computed(() => estimator(store.state.timings, stats.value))

const filterClass = ref<ClassId | 'alle'>('alle')
const limit = ref(25)

interface Row {
  slotId: string
  startNr: string
  name: string
  verein: string
  klasse: ClassId
  lauf: number
  /** Sekunden bis zum Start – `null`, wenn sich das nicht seriös sagen lässt. */
  wait: number | null
  /** Klasse setzt gerade aus – das Boot fehlt, der Start verschiebt sich. */
  paused: boolean
}

function rowsFor(rt: ParcoursRuntime): Row[] {
  const estimates = new Map(waitEstimates(rt, klasseOf.value, estimate.value, now.value).map((e) => [e.slotId, e.seconds]))
  const out: Row[] = []
  for (const slot of rt.slots) {
    if (slot.status !== 'pending') continue
    const starter = store.starterById(slot.starterId)
    if (!starter) continue
    if (filterClass.value !== 'alle' && starter.klasse !== filterClass.value) continue
    out.push({
      slotId: slot.id,
      startNr: starter.startNr,
      name: `${starter.vorname} ${starter.nachname}`.trim(),
      verein:
        store.state.board.originMode === 'bundesland'
          ? starter.bundesland || starter.verein
          : starter.verein || starter.bundesland,
      klasse: starter.klasse,
      lauf: slot.lauf,
      // Kein Eintrag heißt: dieser Lauf wird noch nicht gefahren, sein Beginn
      // steht also gar nicht fest. Dann lieber nichts als eine erfundene Zahl.
      wait: estimates.get(slot.id) ?? null,
      paused: isClassPaused(rt, starter.klasse),
    })
  }
  return out.slice(0, limit.value)
}

function currentLabel(rt: ParcoursRuntime): string {
  const slot = currentSlot(rt)
  if (!slot) return 'noch nicht gestartet'
  const s = store.starterById(slot.starterId)
  // Mit Klasse: Wer wissen will, wann er dran ist, sucht seine Klasse – ohne sie
  // sagt die Startnummer allein nichts darüber, wie weit die Liste ist.
  return s ? `${s.startNr} · ${s.vorname} ${s.nachname} (Klasse ${s.klasse}, Lauf ${slot.lauf})` : '–'
}

/** Klassen, die überhaupt noch offene Starts haben – für den Filter. */
const availableClasses = computed(() => {
  const seen = new Set<ClassId>()
  for (const rt of store.state.runtimes) {
    for (const slot of rt.slots) {
      if (slot.status !== 'pending') continue
      const k = klasseOf.value(slot.starterId)
      if (k) seen.add(k)
    }
  }
  return [...seen]
})

const runtimeOf = (id: string) => store.state.runtimes.find((rt) => rt.parcoursId === id)
</script>

<template>
  <div class="page">
    <AppNav active="liste" />
    <h1>{{ store.state.eventName }} – Startliste</h1>

    <div class="card row">
      <label class="row-tight">
        Klasse
        <select v-model="filterClass">
          <option value="alle">alle</option>
          <option v-for="k in availableClasses" :key="k" :value="k">{{ k }}</option>
        </select>
      </label>
      <label class="row-tight">
        Anzahl
        <select v-model.number="limit">
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="100">100</option>
          <option :value="10000">alle</option>
        </select>
      </label>
      <span class="dim small">
        Wartezeiten sind Schätzungen aus den gemessenen Startabständen – und nur für den Lauf, der
        gerade gefahren wird. Wann ein späterer Lauf beginnt, steht noch nicht fest.
      </span>
    </div>

    <section v-for="parcours in store.state.parcoursList" :key="parcours.id" class="card">
      <div class="spread">
        <h2>{{ parcours.name }}</h2>
        <span class="dim small">Auf der Tafel: {{ currentLabel(runtimeOf(parcours.id)!) }}</span>
      </div>

      <div class="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Start-Nr.</th>
              <th>Name</th>
              <th>{{ store.state.board.originMode === 'bundesland' ? 'Bundesland' : 'Verein' }}</th>
              <th>Kl.</th>
              <th>Lauf</th>
              <th>ca. in</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rowsFor(runtimeOf(parcours.id)!)"
              :key="row.slotId"
              :class="{ ausgesetzt: row.paused }"
            >
              <td class="mono">{{ row.startNr }}</td>
              <td>{{ row.name }}</td>
              <td class="dim">{{ row.verein }}</td>
              <td>
                <span
                  class="badge"
                  :style="{ background: row.paused ? 'var(--text-dim)' : classColor(row.klasse) }"
                >
                  {{ row.klasse }}
                </span>
              </td>
              <td>{{ row.lauf }}</td>
              <!--
                Ein fehlendes Boot lässt sich nicht hochrechnen, und für einen
                Lauf, der noch gar nicht läuft, ist der Beginn unbekannt. Beides
                bleibt deshalb leer statt einer erfundenen Zahl.
              -->
              <td v-if="row.paused" class="warn small">Boot fehlt</td>
              <td v-else-if="row.wait === null" class="dim">–</td>
              <td v-else>{{ formatWait(row.wait) }}</td>
            </tr>
            <tr v-if="!rowsFor(runtimeOf(parcours.id)!).length">
              <td colspan="6" class="dim">Keine offenen Starts.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>Gemessene Startabstände</h2>
      <p class="hint">
        Grundlage der Prognose. Ausreißer über fünf Minuten (Pausen, Störungen) zählen nicht mit.
      </p>
      <div class="row">
        <span v-for="[klasse, stat] in stats" :key="klasse" class="row-tight stat">
          <span class="badge" :style="{ background: classColor(klasse) }">{{ klasse }}</span>
          <span class="mono">{{ formatDuration(stat.avg) }}</span>
          <span class="dim small">({{ stat.samples }} Starts)</span>
        </span>
        <span v-if="!stats.size" class="dim small">Noch keine Messungen.</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stat {
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}

/* Klasse setzt aus: Diese Starts stehen am Ende des Laufs und warten aufs Boot. */
tr.ausgesetzt td {
  opacity: 0.6;
}
</style>
