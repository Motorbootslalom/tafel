<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import type { ClassId, Parcours, TrackItem, WechselFaktor } from '../types'
import { useStore } from '../state/store'
import { classColor, CLASS_IDS } from '../lib/classes'
import { analyzeSequence, computeVerzahnung, itemDragId, presentClasses } from '../lib/verzahnung'
import { uid } from '../lib/ids'

/**
 * Verzahnung eines Parcours einstellen.
 *
 * Die Klassen werden auf Spuren verteilt und im Wechsel abgearbeitet – nur so
 * kann am Steg das Boot getauscht werden, während der andere Starter fährt.
 * Klassen lassen sich per Drag & Drop zwischen den Spuren und innerhalb einer
 * Spur verschieben; die Reihenfolge innerhalb einer Spur bestimmt, welche
 * Klasse dort zuerst fährt.
 *
 * Zusätzlich lassen sich **Pausen** in eine Spur einfügen: Sie setzen die Spur
 * um so viele Takte aus und verschieben alles, was in der Spur dahinter steht,
 * nach hinten – ohne eine Lücke in der Startliste zu erzeugen. Eine Pause ist
 * dabei ein Element wie eine Klasse und lässt sich ebenso an jede Stelle der
 * Spur ziehen: an den Anfang, um die ganze Spur zu versetzen, oder zwischen zwei
 * Klassen, um nur deren Übergang zu verschieben.
 */
const props = defineProps<{ parcours: Parcours }>()
const store = useStore()

const startersOfParcours = computed(() =>
  store.state.starters.filter((s) => props.parcours.classIds.includes(s.klasse)),
)

const result = computed(() => computeVerzahnung(props.parcours, store.state.starters))
const analysis = computed(() => analyzeSequence(result.value.sequence))
const classes = computed(() => presentClasses(props.parcours, startersOfParcours.value))

/**
 * Arbeitskopie der Spuren mit allen Elementen – Klassen wie Pausen. Drag & Drop
 * verändert Arrays an Ort und Stelle, deshalb braucht es eine eigene Liste, die
 * anschließend als Ganzes in den Zustand zurückgeschrieben wird.
 */
const localTracks = ref<TrackItem[][]>([])

watch(
  result,
  (value) => {
    localTracks.value = value.tracks.map((track) => track.map((item) => ({ ...item })))
  },
  { immediate: true },
)

/**
 * Schreibt die aktuelle Anordnung als manuelle Spur-Konfiguration zurück –
 * ab dann bleibt sie stehen, bis der Benutzer sie wieder freigibt.
 */
function commit(tracks: TrackItem[][]): void {
  store.dispatch({ type: 'SET_TRACKS', parcoursId: props.parcours.id, tracks })
}

/** Arbeitskopie in den Zustand übernehmen. */
function commitLocal(): void {
  commit(localTracks.value.map((track) => track.map((item) => ({ ...item }))))
}

/**
 * Nach dem Loslassen übernehmen. `nextTick`, weil vuedraggable die Listen bei
 * einem Wechsel zwischen zwei Spuren in zwei Schritten anpasst – erst danach
 * ist die Anordnung vollständig.
 */
function onDragEnd(): void {
  void nextTick(commitLocal)
}

/** Element eine Spur weiter – die Tastatur-/Touch-Alternative zum Ziehen. */
function moveToTrack(from: number, item: TrackItem, delta: number): void {
  const to = from + delta
  if (to < 0 || to >= localTracks.value.length) return
  const id = itemDragId(item)
  localTracks.value[from] = localTracks.value[from].filter((i) => itemDragId(i) !== id)
  localTracks.value[to] = [...localTracks.value[to], item]
  commitLocal()
}

/** Eine Pause ans Ende einer Spur hängen; von dort wird sie an ihren Platz gezogen. */
function addPause(trackIndex: number): void {
  const track = localTracks.value[trackIndex]
  if (!track) return
  localTracks.value[trackIndex] = [...track, { kind: 'pause', id: uid('pause'), length: 1 }]
  commitLocal()
}

function setPauseLength(trackIndex: number, id: string, length: number): void {
  localTracks.value[trackIndex] = localTracks.value[trackIndex].map((item) =>
    item.kind === 'pause' && item.id === id ? { ...item, length: Math.max(1, length) } : item,
  )
  commitLocal()
}

function removeItem(trackIndex: number, id: string): void {
  localTracks.value[trackIndex] = localTracks.value[trackIndex].filter(
    (item) => itemDragId(item) !== id,
  )
  commitLocal()
}

function setFaktor(faktor: WechselFaktor): void {
  // Beim Ändern der Spurzahl die manuelle Anordnung verwerfen – sie passt nicht mehr.
  store.dispatch({ type: 'SET_TRACKS', parcoursId: props.parcours.id, tracks: undefined })
  store.dispatch({
    type: 'UPDATE_PARCOURS',
    parcoursId: props.parcours.id,
    patch: { wechselFaktor: faktor },
  })
}

function resetTracks(): void {
  store.dispatch({ type: 'SET_TRACKS', parcoursId: props.parcours.id, tracks: undefined })
}

function toggleClass(klasse: ClassId): void {
  const has = props.parcours.classIds.includes(klasse)
  const classIds = has
    ? props.parcours.classIds.filter((c) => c !== klasse)
    : [...props.parcours.classIds, klasse].sort(
        (a, b) => CLASS_IDS.indexOf(a) - CLASS_IDS.indexOf(b),
      )
  store.dispatch({ type: 'SET_TRACKS', parcoursId: props.parcours.id, tracks: undefined })
  store.dispatch({ type: 'UPDATE_PARCOURS', parcoursId: props.parcours.id, patch: { classIds } })
}

/**
 * Die Startfolge als Klassenfolge – zeigt sofort, ob die Verzahnung greift.
 *
 * Bewusst **vollständig**: Gerade das Ende ist die interessante Stelle, weil
 * dort der un-verzahnte Block steht. Eine gekürzte Vorschau ließe genau das
 * ungesehen, was mit den Pausen ausgerichtet werden soll.
 */
const previewClasses = computed(() => result.value.sequence.map((s) => s.klasse))
</script>

<template>
  <div class="stack">
    <label class="field">
      Name des Parcours
      <!--
        Bewusst @input statt @change: `change` feuert erst, wenn das Feld den
        Fokus verliert. Steht die Tafel auf einem zweiten Monitor und man schaut
        nach dem Tippen nur hinüber, käme die Änderung dort nie an.
      -->
      <input
        :value="parcours.name"
        @input="
          store.dispatch({
            type: 'UPDATE_PARCOURS',
            parcoursId: parcours.id,
            patch: { name: ($event.target as HTMLInputElement).value },
          })
        "
      />
    </label>

    <div>
      <span class="small dim">Klassen auf diesem Parcours</span>
      <div class="row">
        <label v-for="klasse in CLASS_IDS" :key="klasse" class="row-tight class-toggle">
          <input
            type="checkbox"
            :checked="parcours.classIds.includes(klasse)"
            @change="toggleClass(klasse)"
          />
          <span class="badge" :style="{ background: classColor(klasse) }">{{ klasse }}</span>
        </label>
      </div>
    </div>

    <div class="row">
      <label class="row-tight">
        Spuren (Wechsel-Faktor)
        <select
          :value="parcours.wechselFaktor"
          @change="setFaktor(Number(($event.target as HTMLSelectElement).value) as WechselFaktor)"
        >
          <option v-for="n in 4" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <button v-if="result.manual" @click="resetTracks">Automatisch verteilen</button>
      <span v-else class="dim small">Automatisch verteilt</span>
    </div>

    <template v-if="classes.length">
      <p class="hint" style="margin: 0">
        Klassen lassen sich zwischen den Spuren und innerhalb einer Spur ziehen. Die Reihenfolge in
        einer Spur bestimmt, welche Klasse dort zuerst fährt. Eine <strong>Pause</strong> ist ein
        Element wie eine Klasse: Sie lässt sich an jede Stelle der Spur ziehen und setzt die Spur
        dort um die eingestellte Zahl von Takten aus – vorangestellt versetzt sie die ganze Spur,
        zwischen zwei Klassen nur deren Übergang.
      </p>

      <div class="tracks">
        <div v-for="(items, index) in localTracks" :key="index" class="track">
          <div class="spread">
            <strong>Spur {{ index + 1 }}</strong>
            <button class="small" @click="addPause(index)">+ Pause</button>
          </div>

          <draggable
            :list="items"
            :group="{ name: `spuren-${parcours.id}` }"
            :item-key="itemDragId"
            class="drop-zone"
            ghost-class="chip-ghost"
            drag-class="chip-drag"
            :animation="150"
            :force-fallback="true"
            filter=".nudge,.takte"
            :prevent-on-filter="false"
            @end="onDragEnd"
          >
            <template #item="{ element }">
              <span
                class="chip"
                :class="{ 'chip-pause': element.kind === 'pause' }"
                :style="
                  element.kind === 'class' ? { background: classColor(element.klasse) } : undefined
                "
              >
                <button
                  class="nudge"
                  :disabled="index === 0"
                  title="eine Spur nach oben"
                  @click.stop="moveToTrack(index, element, -1)"
                >
                  ▲
                </button>

                <span v-if="element.kind === 'class'" class="chip-label">{{ element.klasse }}</span>
                <template v-else>
                  <span class="chip-label">⏸</span>
                  <input
                    class="takte"
                    type="number"
                    min="1"
                    max="99"
                    :value="element.length"
                    title="Takte"
                    @click.stop
                    @change="
                      setPauseLength(
                        index,
                        element.id,
                        Number(($event.target as HTMLInputElement).value),
                      )
                    "
                  />
                  <button
                    class="nudge"
                    title="Pause entfernen"
                    @click.stop="removeItem(index, element.id)"
                  >
                    ✕
                  </button>
                </template>

                <button
                  class="nudge"
                  :disabled="index === localTracks.length - 1"
                  title="eine Spur nach unten"
                  @click.stop="moveToTrack(index, element, 1)"
                >
                  ▼
                </button>
              </span>
            </template>

            <template #footer>
              <span v-if="!items.length" class="empty-hint">Klasse hierher ziehen</span>
            </template>
          </draggable>
        </div>
      </div>
    </template>

    <div v-if="result.sequence.length">
      <span class="small dim">
        Vorschau der Startfolge ({{ analysis.total }} Starts je Lauf, {{ analysis.wechsel }} Wechsel,
        {{ analysis.nonWechsel }} ohne Wechsel<template v-if="analysis.trailingRun > 1">
          , {{ analysis.trailingRun }} am Ende unverzahnt (Klasse {{ analysis.trailingKlasse }})
        </template>)
      </span>
      <div class="row-tight preview">
        <span
          v-for="(klasse, i) in previewClasses"
          :key="i"
          class="badge"
          :style="{ background: classColor(klasse) }"
        >
          {{ klasse }}
        </span>
      </div>
    </div>
    <p v-else class="hint">Keine Starter in den gewählten Klassen.</p>
  </div>
</template>

<style scoped>
.tracks {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.track {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 0.7rem;
  background: var(--surface-2);
}

/* Die Ablagefläche bleibt auch leer groß genug, um sicher zu treffen. */
.drop-zone {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  min-height: 3rem;
  margin-top: 0.4rem;
  padding: 0.3rem;
  border: 1px dashed var(--border);
  border-radius: 8px;
  align-content: flex-start;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.1rem 0.25rem;
  border-radius: 6px;
  color: #0d1117;
  font-weight: 700;
  cursor: grab;
  user-select: none;
}

.chip:active {
  cursor: grabbing;
}

/* Eine Pause gehört sichtbar nicht zu den Klassen – deshalb neutral und offen. */
.chip-pause {
  background: var(--surface);
  color: var(--text);
  border: 1px dashed var(--border);
}

.chip-label {
  min-width: 1.1rem;
  text-align: center;
}

.takte {
  width: 3rem;
  padding: 0 0.2rem;
  font-size: 0.8rem;
}

.chip-ghost {
  opacity: 0.4;
  outline: 2px dashed var(--accent);
}

.chip-drag {
  opacity: 0.95;
}

/* Zum Antippen auf Touch-Geräten und für die Bedienung ohne Ziehen. */
.nudge {
  border: none;
  background: rgb(255 255 255 / 0.45);
  color: #0d1117;
  border-radius: 4px;
  padding: 0 0.2rem;
  font-size: 0.7rem;
  line-height: 1.4;
  cursor: pointer;
}

.chip-pause .nudge {
  background: var(--surface-2);
  color: var(--text);
}

.nudge:disabled {
  opacity: 0.3;
  cursor: default;
}

.empty-hint {
  color: var(--text-dim);
  font-size: 0.8rem;
  align-self: center;
  padding: 0 0.3rem;
}

.class-toggle {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.15rem 0.4rem;
}

.preview {
  flex-wrap: wrap;
  gap: 2px;
}
</style>
