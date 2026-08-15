<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import type { Parcours, ParcoursRuntime, StartSlot } from '../types'
import { useStore } from '../state/store'
import { classColor } from '../lib/classes'
import { laeufeOf, nextReleasableLauf, type LaufAnchor } from '../lib/startlist'
import { sortedByClassThenStartNr } from '../lib/startnumbers'
import { uid } from '../lib/ids'

/**
 * Die erzeugte Startliste nachbearbeiten.
 *
 * Der praktische Fall: Jemand holt seinen zweiten Lauf noch vor Beginn von Lauf
 * 3 nach, oder ein dritter Lauf wird ans Ende von Lauf 2 gehängt. Dafür gibt es
 * drei Wege – ziehen, schrittweise verschieben, oder direkt an eine Lauf-Grenze
 * springen. Der letzte ist bei langen Listen der einzige praktikable.
 */
const props = defineProps<{ parcours: Parcours; runtime: ParcoursRuntime }>()
const store = useStore()

const showDone = ref(false)
const insertStarterId = ref('')
const insertLauf = ref(1)

const visible = computed(() =>
  props.runtime.slots.filter((s) => showDone.value || s.status !== 'done'),
)

/**
 * Arbeitskopie für das Ziehen. Angezeigt wird je nach Einstellung nur ein Teil
 * der Liste – die ausgeblendeten Starts behalten beim Übernehmen ihre Position.
 */
const rows = ref<StartSlot[]>([])
watch(visible, (value) => (rows.value = [...value]), { immediate: true })

const laeufe = computed(() => laeufeOf(props.runtime))
const naechsterLauf = computed(() => nextReleasableLauf(props.runtime))

function releaseNext(): void {
  if (naechsterLauf.value === null) return
  store.dispatch({ type: 'RELEASE_LAUF', parcoursId: props.parcours.id, lauf: naechsterLauf.value })
}

function releasePrevious(): void {
  store.dispatch({
    type: 'RELEASE_LAUF',
    parcoursId: props.parcours.id,
    lauf: props.runtime.releasedLauf - 1,
  })
}

const candidates = computed(() =>
  sortedByClassThenStartNr(
    store.state.starters.filter((s) => props.parcours.classIds.includes(s.klasse)),
  ),
)

function starterOf(slot: StartSlot) {
  return store.starterById(slot.starterId)
}

function move(slot: StartSlot, delta: number): void {
  store.dispatch({ type: 'MOVE_SLOT', parcoursId: props.parcours.id, slotId: slot.id, delta })
}

function remove(slot: StartSlot): void {
  store.dispatch({ type: 'REMOVE_SLOT', parcoursId: props.parcours.id, slotId: slot.id })
}

/**
 * Nach dem Loslassen: Aus der Zielposition in der angezeigten Liste wird die
 * Position in der Gesamtliste. Maßgeblich ist der Eintrag davor – so stimmt es
 * auch dann, wenn gefahrene Starts ausgeblendet sind.
 */
function onDragEnd(event: { oldIndex?: number; newIndex?: number }): void {
  const { oldIndex, newIndex } = event
  if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return

  const moved = rows.value[newIndex]
  if (!moved) return
  const before = newIndex > 0 ? rows.value[newIndex - 1] : null
  const rest = props.runtime.slots.filter((s) => s.id !== moved.id)
  const index = before ? rest.findIndex((s) => s.id === before.id) + 1 : 0

  void nextTick(() => {
    store.dispatch({
      type: 'MOVE_SLOT_TO_INDEX',
      parcoursId: props.parcours.id,
      slotId: moved.id,
      index,
    })
  })
}

/** Auswahl im Lauf-Menü: „before:2" → vor Lauf 2. */
function parseAnchor(value: string): LaufAnchor | null {
  if (value === 'start') return { kind: 'start' }
  if (value === 'end') return { kind: 'end' }
  const [kind, lauf] = value.split(':')
  if (kind === 'before') return { kind: 'beforeLauf', lauf: Number(lauf) }
  if (kind === 'after') return { kind: 'afterLauf', lauf: Number(lauf) }
  return null
}

function moveToAnchor(slot: StartSlot, event: Event): void {
  const select = event.target as HTMLSelectElement
  const anchor = parseAnchor(select.value)
  select.value = ''
  if (!anchor) return
  store.dispatch({
    type: 'MOVE_SLOT_TO_ANCHOR',
    parcoursId: props.parcours.id,
    slotId: slot.id,
    anchor,
  })
}

function insert(where: 'next' | 'end'): void {
  if (!insertStarterId.value) return
  store.dispatch({
    type: 'INSERT_SLOT',
    parcoursId: props.parcours.id,
    // Hier erzeugt, nicht im Reducer: Alle Fenster müssen denselben Eintrag
    // bekommen, sonst zeigt eine spätere Änderung daran ins Leere.
    slotId: uid('slot'),
    starterId: insertStarterId.value,
    lauf: insertLauf.value,
    where,
  })
}

const STATUS_LABEL: Record<StartSlot['status'], string> = {
  pending: 'offen',
  done: 'gefahren',
  deferred: 'zurückgestellt',
}

/** Über eine Funktion, weil die Slot-Eigenschaften von vuedraggable untypisiert sind. */
function statusLabel(slot: StartSlot): string {
  return STATUS_LABEL[slot.status]
}
</script>

<template>
  <div class="stack">
    <div class="row">
      <label class="row-tight small">
        <input v-model="showDone" type="checkbox" /> Gefahrene Starts mit anzeigen
      </label>
      <span class="dim small" style="margin-left: auto">
        {{ runtime.slots.filter((s) => s.status === 'pending').length }} offen ·
        {{ runtime.slots.length }} gesamt
      </span>
    </div>

    <div class="row lauf-status">
      <span>
        Freigegeben bis <strong>Lauf {{ runtime.releasedLauf }}</strong>
      </span>
      <button v-if="naechsterLauf !== null" @click="releaseNext">
        Lauf {{ naechsterLauf }} freigeben
      </button>
      <button v-if="runtime.releasedLauf > 1" @click="releasePrevious">
        Freigabe zurücknehmen
      </button>
      <span class="dim small">
        Spätere Läufe stehen zwar in der Liste, werden aber erst nach Freigabe gefahren – Lauf 2 ist
        am Nachmittag, Lauf 3 meist am nächsten Tag.
      </span>
    </div>

    <label class="row-tight small keep">
      <input
        type="checkbox"
        :checked="store.state.keepInterleave"
        @change="
          store.dispatch({
            type: 'SET_KEEP_INTERLEAVE',
            keepInterleave: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      Verzahnung beim Verschieben erhalten
    </label>
    <p class="hint" style="margin: 0">
      <template v-if="store.state.keepInterleave">
        Beim Verschieben rutscht die ganze Spur mit – es stehen nie zwei Starter derselben Klasse
        hintereinander, und am Steg bleibt Zeit für den Bootswechsel. Der Starter landet deshalb auf
        dem nächstgelegenen Platz seiner Spur, nicht zwingend genau dort, wo losgelassen wurde.
      </template>
      <template v-else>
        Ein Starter landet genau dort, wo er abgelegt wird. Dabei können zwei Starter derselben
        Klasse aufeinanderfolgen – dann fehlt am Steg die Zeit für den Bootswechsel.
      </template>
    </p>
    <p class="hint" style="margin: 0">
      Zeilen lassen sich am Griff <span class="grip-demo">⠿</span> ziehen. Über „verschieben nach …"
      springt ein Start direkt an den Anfang oder das Ende eines Laufs.
    </p>

    <div class="scroll-x list">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>#</th>
            <th>Start-Nr.</th>
            <th>Name</th>
            <th>Kl.</th>
            <th>Lauf</th>
            <th>Status</th>
            <th>verschieben nach …</th>
            <th></th>
          </tr>
        </thead>

        <draggable
          v-model="rows"
          tag="tbody"
          item-key="id"
          handle=".grip"
          filter="tr.done"
          ghost-class="row-ghost"
          :animation="150"
          @end="onDragEnd"
        >
          <template #item="{ element: slot, index }">
            <tr :class="[slot.status, { gesperrt: slot.lauf > runtime.releasedLauf }]">
              <td>
                <span
                  class="grip"
                  :class="{ locked: slot.status === 'done' }"
                  :title="slot.status === 'done' ? 'bereits gefahren' : 'zum Verschieben ziehen'"
                  >⠿</span
                >
              </td>
              <td class="dim">{{ index + 1 }}</td>
              <td class="mono">{{ starterOf(slot)?.startNr ?? '?' }}</td>
              <td>
                {{
                  starterOf(slot)
                    ? `${starterOf(slot)!.vorname} ${starterOf(slot)!.nachname}`
                    : 'gelöscht'
                }}
              </td>
              <td>
                <span
                  v-if="starterOf(slot)"
                  class="badge"
                  :style="{ background: classColor(starterOf(slot)!.klasse) }"
                >
                  {{ starterOf(slot)!.klasse }}
                </span>
              </td>
              <td>{{ slot.lauf }}</td>
              <td
                class="small"
                :class="{ dim: slot.status === 'done', warn: slot.status === 'deferred' }"
              >
                {{ statusLabel(slot) }}
              </td>
              <td>
                <select
                  class="anchor small"
                  :disabled="slot.status === 'done'"
                  @change="moveToAnchor(slot, $event)"
                >
                  <option value="">–</option>
                  <option value="start">an den Anfang</option>
                  <optgroup label="vor den Beginn von">
                    <option v-for="lauf in laeufe" :key="'b' + lauf" :value="`before:${lauf}`">
                      vor Lauf {{ lauf }}
                    </option>
                  </optgroup>
                  <optgroup label="ans Ende von">
                    <option v-for="lauf in laeufe" :key="'a' + lauf" :value="`after:${lauf}`">
                      nach Lauf {{ lauf }}
                    </option>
                  </optgroup>
                  <option value="end">ans Ende</option>
                </select>
              </td>
              <td class="row-tight">
                <button
                  :disabled="slot.status === 'done'"
                  title="nach oben"
                  @click="move(slot, -1)"
                >
                  ▲
                </button>
                <button
                  :disabled="slot.status === 'done'"
                  title="nach unten"
                  @click="move(slot, 1)"
                >
                  ▼
                </button>
                <button
                  class="danger"
                  :disabled="slot.status === 'done'"
                  title="entfernen"
                  @click="remove(slot)"
                >
                  ✕
                </button>
              </td>
            </tr>
          </template>

          <template #footer>
            <tr v-if="!rows.length">
              <td colspan="9" class="dim">Keine Einträge – Startliste noch nicht erzeugt.</td>
            </tr>
          </template>
        </draggable>
      </table>
    </div>

    <div class="row">
      <label class="row-tight small">
        Lauf nachtragen
        <select v-model="insertStarterId">
          <option value="">Starter wählen …</option>
          <option v-for="s in candidates" :key="s.id" :value="s.id">
            {{ s.startNr }} · {{ s.nachname }}, {{ s.vorname }}
          </option>
        </select>
      </label>
      <label class="row-tight small">
        Lauf
        <input v-model.number="insertLauf" type="number" min="1" style="width: 4rem" />
      </label>
      <button :disabled="!insertStarterId" @click="insert('next')">Als Nächsten</button>
      <button :disabled="!insertStarterId" @click="insert('end')">Ans Ende</button>
    </div>
  </div>
</template>

<style scoped>
.lauf-status {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.keep {
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  align-self: flex-start;
}

.list {
  max-height: 26rem;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

tr.done {
  opacity: 0.55;
}

/* Starts eines noch nicht freigegebenen Laufs stehen in der Liste, werden aber
   noch nicht gefahren. */
tr.gesperrt td:not(:first-child) {
  opacity: 0.6;
}

tr.deferred td {
  background: color-mix(in srgb, var(--warn) 12%, transparent);
}

.grip,
.grip-demo {
  color: var(--text-dim);
  font-size: 1.1rem;
  line-height: 1;
  user-select: none;
}

.grip {
  cursor: grab;
  padding: 0 0.15rem;
}

.grip:active {
  cursor: grabbing;
}

/* Gefahrene Starts bleiben, wo sie sind – ihr Griff ist nur Platzhalter. */
.grip.locked {
  cursor: default;
  opacity: 0.3;
}

.row-ghost {
  opacity: 0.4;
  outline: 2px dashed var(--accent);
}

.anchor {
  max-width: 11rem;
}
</style>
