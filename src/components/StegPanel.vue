<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { BoardMessage, Parcours, ParcoursRuntime, StartSlot } from '../types'
import { useStore } from '../state/store'
import { classColor } from '../lib/classes'
import { EVENT_PLACEHOLDER, MESSAGE_GROUPS, fillTemplate } from '../data/messages'
import {
  currentSlot,
  deferredSlots,
  laufComplete,
  nextReleasableLauf,
  nextSlot,
  previousSlot,
  releasedSlots,
} from '../lib/startlist'
import { formatDuration } from '../lib/timing'

const props = defineProps<{ parcours: Parcours; runtime: ParcoursRuntime }>()
const store = useStore()

const mayOperate = computed(() => store.mayOperate(props.parcours.id))

function label(slot: StartSlot | null | undefined): string {
  if (!slot) return '–'
  const s = store.starterById(slot.starterId)
  if (!s) return '?'
  return `${s.startNr} · ${s.vorname} ${s.nachname}`.trim()
}

function starterOf(slot: StartSlot) {
  return store.starterById(slot.starterId)
}

/**
 * Klasse, Lauf und Herkunft – dieselben Angaben wie auf der Tafel. Am Steg wird
 * der nächste Starter damit angesagt, deshalb steht hier alles zusammen.
 */
function details(slot: StartSlot | null | undefined): string {
  if (!slot) return ''
  const s = starterOf(slot)
  if (!s) return ''
  const herkunft =
    store.state.board.originMode === 'bundesland'
      ? s.bundesland || s.verein
      : s.verein || s.bundesland
  return [`Klasse ${s.klasse}`, `Lauf ${slot.lauf}`, herkunft].filter(Boolean).join(' · ')
}

const current = computed(() => currentSlot(props.runtime))
const previous = computed(() => previousSlot(props.runtime))
const next = computed(() => nextSlot(props.runtime))
const deferred = computed(() => deferredSlots(props.runtime))
const upcoming = computed(() => releasedSlots(props.runtime).slice(0, 12))

/** Wie viele Starts stehen im freigegebenen Lauf noch aus? */
const offen = computed(() => releasedSlots(props.runtime).length)
const fertig = computed(() => laufComplete(props.runtime))
const naechsterLauf = computed(() => nextReleasableLauf(props.runtime))

function releaseNext(): void {
  const lauf = naechsterLauf.value
  if (lauf === null) return
  store.dispatch({ type: 'RELEASE_LAUF', parcoursId: parcoursId.value, lauf })
}

/** Wie lange steht der aktuelle Starter schon auf der Tafel? */
const elapsed = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null

function updateElapsed(): void {
  const shownAt = current.value?.shownAt
  elapsed.value = shownAt ? (Date.now() - shownAt) / 1000 : 0
}

onMounted(() => {
  updateElapsed()
  ticker = setInterval(updateElapsed, 1000)
})

onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

/** Klassen, die im freigegebenen Lauf noch offene Starts haben. */
const openClasses = computed(() => {
  const seen = new Set<string>()
  for (const slot of releasedSlots(props.runtime)) {
    const klasse = store.klasseOf(slot.starterId)
    if (klasse) seen.add(klasse)
  }
  return [...seen]
})

const chooserOpen = ref(false)
const messageText = ref('')
const messageKind = ref<BoardMessage['kind']>('info')

/** Kurzfassung der laufenden Meldung für den eingeklappten Abschnitt. */
const kurzeMeldung = computed(() => {
  const text = props.runtime.message?.text.replace(/\s+/g, ' ').trim() ?? ''
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
})

const parcoursId = computed(() => props.parcours.id)

const advance = () => store.dispatch({ type: 'ADVANCE', parcoursId: parcoursId.value, now: Date.now() })
const undo = () => store.dispatch({ type: 'UNDO', parcoursId: parcoursId.value })

function show(slotId: string): void {
  store.dispatch({ type: 'SHOW_SLOT', parcoursId: parcoursId.value, slotId, now: Date.now() })
  chooserOpen.value = false
}

function deferNext(): void {
  const slot = next.value
  if (slot) store.dispatch({ type: 'DEFER_SLOT', parcoursId: parcoursId.value, slotId: slot.id })
}

function reactivate(slotId: string, where: 'next' | 'end'): void {
  store.dispatch({ type: 'REACTIVATE_SLOT', parcoursId: parcoursId.value, slotId, where })
}

function shift(klasse: string, steps: number): void {
  store.dispatch({
    type: 'SHIFT_CLASS',
    parcoursId: parcoursId.value,
    klasse: klasse as never,
    steps,
  })
}

function setMessage(text: string, kind: BoardMessage['kind']): void {
  store.dispatch({
    type: 'SET_MESSAGE',
    parcoursId: parcoursId.value,
    message: text ? { text, kind } : null,
  })
}

/**
 * Eine Vorlage landet zuerst im Eingabefeld, nicht direkt auf der Tafel:
 * Uhrzeiten und Tagesangaben wollen meist noch angepasst werden, und ein
 * Fehlgriff im Menü hätte sonst sofort Folgen für alle Zuschauer.
 */
function pickTemplate(event: Event): void {
  const select = event.target as HTMLSelectElement
  const value = select.value
  select.value = ''
  if (!value) return

  const [title, index] = value.split('|')
  const template = MESSAGE_GROUPS.find((g) => g.title === title)?.items[Number(index)]
  if (!template) return

  messageText.value = fillTemplate(template.text, store.state.eventName)
  messageKind.value = template.kind
}

function sendFreeMessage(): void {
  if (!messageText.value.trim()) return
  setMessage(messageText.value.trim(), messageKind.value)
  messageText.value = ''
}
</script>

<template>
  <section class="card">
    <div class="spread">
      <h2>{{ parcours.name }}</h2>
      <span class="row-tight small">
        <strong>Lauf {{ runtime.releasedLauf }}</strong>
        <span class="dim">· noch {{ offen }} Start{{ offen === 1 ? '' : 'e' }}</span>
      </span>
      <span v-if="!mayOperate" class="small warn">Nur ansehen – keine Berechtigung</span>
    </div>

    <!--
      Läufe folgen nicht unmittelbar aufeinander – Lauf 2 ist am Nachmittag,
      Lauf 3 meist am nächsten Tag. Deshalb schaltet die Tafel nie von selbst
      weiter; der nächste Lauf wird hier ausdrücklich freigegeben.
    -->
    <div v-if="fertig" class="lauf-ende">
      <strong>Lauf {{ runtime.releasedLauf }} ist durch.</strong>
      <template v-if="naechsterLauf !== null">
        <p class="hint" style="margin: 0.2rem 0 0.6rem">
          Die Tafel schaltet nicht von selbst weiter. Wenn es soweit ist, Lauf
          {{ naechsterLauf }} freigeben.
        </p>
        <button class="primary big" :disabled="!mayOperate" @click="releaseNext">
          Lauf {{ naechsterLauf }} freigeben
        </button>
      </template>
      <p v-else class="hint" style="margin: 0.2rem 0 0">
        Alle Läufe sind gefahren.
      </p>
    </div>

    <div class="steg-current">
      <span class="small dim">Auf der Tafel</span>
      <span class="steg-nr">{{ current ? starterOf(current)?.startNr ?? '?' : '–' }}</span>
      <span>{{ label(current) }}</span>
      <span class="small dim">
        <template v-if="current">
          Klasse {{ store.klasseOf(current.starterId) }} · Lauf {{ current.lauf }} · seit
          {{ formatDuration(elapsed) }}
        </template>
        <template v-else>Noch kein Starter angezeigt</template>
      </span>
      <span v-if="previous" class="small dim">davor: {{ label(previous) }}</span>
    </div>

    <div class="steg-next">
      <span class="dim small">Als Nächstes</span>
      <span class="next-name">{{ label(next) }}</span>
      <span v-if="next" class="dim small">{{ details(next) }}</span>
      <span v-else-if="naechsterLauf !== null" class="dim small">
        erst nach Freigabe von Lauf {{ naechsterLauf }}
      </span>
    </div>

    <div class="steg-actions">
      <button class="primary" :disabled="!mayOperate || !next" @click="advance">
        Nächster Starter
      </button>
      <button :disabled="!mayOperate || !runtime.history.length" @click="undo">
        Zurück (Fehlklick)
      </button>
      <button :disabled="!mayOperate || !next" @click="deferNext">Nächsten zurückstellen</button>
      <button :disabled="!mayOperate" @click="chooserOpen = !chooserOpen">
        Anderen Starter wählen
      </button>
    </div>

    <div v-if="chooserOpen" class="stack chooser">
      <p class="hint">
        Direkt auf die Tafel holen – auch aus einer anderen Klasse, wenn dort gerade ein Boot frei
        ist.
      </p>
      <div class="row">
        <button
          v-for="slot in upcoming"
          :key="slot.id"
          class="slot-button"
          :style="{ borderLeftColor: classColor(store.klasseOf(slot.starterId) ?? 'E') }"
          @click="show(slot.id)"
        >
          {{ label(slot) }}
          <span class="dim small">L{{ slot.lauf }}</span>
        </button>
      </div>
    </div>

    <template v-if="deferred.length">
      <h3>Zurückgestellt ({{ deferred.length }})</h3>
      <ul class="deferred">
        <li v-for="slot in deferred" :key="slot.id" class="row">
          <span class="grow">{{ label(slot) }} <span class="dim small">Lauf {{ slot.lauf }}</span></span>
          <button :disabled="!mayOperate" @click="reactivate(slot.id, 'next')">Als Nächsten</button>
          <button :disabled="!mayOperate" @click="reactivate(slot.id, 'end')">Ans Ende</button>
        </li>
      </ul>
    </template>

    <!--
      Beide Abschnitte sind eingeklappt: Im Normalbetrieb wird nur
      weitergeschaltet, und alles Weitere kostete sonst dauerhaft Bildschirmhöhe
      – am Steg wird sonst bei jedem Starter gescrollt.
    -->
    <details class="steg-section">
      <summary>Verzahnung verschieben</summary>
      <p class="hint">
        Wenn das Boot einer Klasse ausfällt: Klasse nach hinten schieben, eine andere springt ein.
        Sobald das Boot wieder da ist, wieder nach vorn holen.
      </p>
      <div class="row">
        <span v-for="klasse in openClasses" :key="klasse" class="row-tight shift">
          <span class="badge" :style="{ background: classColor(klasse as never) }">{{ klasse }}</span>
          <button :disabled="!mayOperate" title="nach vorn" @click="shift(klasse, -1)">◀</button>
          <button :disabled="!mayOperate" title="nach hinten" @click="shift(klasse, 1)">▶</button>
        </span>
        <span v-if="!openClasses.length" class="dim small">Keine offenen Starts mehr.</span>
      </div>
    </details>

    <details class="steg-section">
      <summary>
        Meldung auf der Tafel
        <!-- Eingeklappt darf nicht verborgen bleiben, dass etwas auf der Tafel steht. -->
        <span v-if="runtime.message" class="aktiv" :class="runtime.message.kind">
          steht auf der Tafel: „{{ kurzeMeldung }}"
        </span>
      </summary>

      <div class="row">
      <button :disabled="!mayOperate" @click="setMessage('Kurze Störung – bitte warten', 'stoerung')">
        Störung
      </button>
      <button :disabled="!mayOperate" @click="setMessage('Kurze Pause', 'pause')">Pause</button>
      <button :disabled="!mayOperate || !runtime.message" @click="setMessage('', 'info')">
        Meldung löschen
      </button>
    </div>

    <div class="row" style="margin-top: 0.5rem">
      <label class="row-tight small">
        Vorlage
        <select :disabled="!mayOperate" @change="pickTemplate($event)">
          <option value="">wählen …</option>
          <optgroup v-for="group in MESSAGE_GROUPS" :key="group.title" :label="group.title">
            <option
              v-for="(template, index) in group.items"
              :key="template.label"
              :value="`${group.title}|${index}`"
            >
              {{ template.label }}
            </option>
          </optgroup>
        </select>
      </label>
      <label class="row-tight small">
        Art
        <select v-model="messageKind" :disabled="!mayOperate">
          <option value="info">Info (unter dem Starter)</option>
          <option value="pause">Pause (statt Starter)</option>
          <option value="stoerung">Störung (statt Starter)</option>
        </select>
      </label>
    </div>

    <div class="row" style="margin-top: 0.5rem; align-items: flex-start">
      <textarea
        v-model="messageText"
        rows="2"
        placeholder="Eigene Meldung, z. B. „Lasst es euch schmecken“ – Zeilenumbrüche werden übernommen"
        :disabled="!mayOperate"
        style="flex: 1; min-width: 16rem; min-height: 3.4rem"
      ></textarea>
      <button
        class="primary"
        :disabled="!mayOperate || !messageText.trim()"
        @click="sendFreeMessage"
      >
        Anzeigen
      </button>
    </div>
    <p class="hint">
      In den Vorlagen steht <span class="mono">{{ EVENT_PLACEHOLDER }}</span> für den
      Veranstaltungsnamen – er wird beim Auswählen eingesetzt („{{ store.state.eventName }}").
    </p>

      <p v-if="runtime.message" class="hint">
        Aktuell auf der Tafel: „{{ runtime.message.text.replace(/\n/g, ' ') }}"
        <template v-if="runtime.message.kind !== 'info'"> (verdrängt den Starter)</template>
      </p>
    </details>
  </section>
</template>

<style scoped>
/* Eingeklappte Abschnitte sehen aus wie die Überschriften, die sie ersetzen. */
.steg-section {
  border-top: 1px solid var(--border);
  margin-top: 0.75rem;
  padding-top: 0.5rem;
}

.steg-section > summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  padding: 0.25rem 0;
  /* Kein `display: flex` – das entfernt das Aufklapp-Dreieck, und dann ist dem
     Abschnitt nicht mehr anzusehen, dass sich etwas dahinter verbirgt. */
  list-style-position: inside;
}

.steg-section > summary::marker {
  color: var(--text-dim);
}

.aktiv {
  display: inline-block;
  margin-left: 0.5rem;
  font-weight: 400;
  font-size: 0.85rem;
  padding: 0.05rem 0.4rem;
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--text-dim);
}

.aktiv.stoerung {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 14%, transparent);
}

.aktiv.pause {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 14%, transparent);
}

.steg-next {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin: 0.75rem 0;
  padding: 0.5rem 0.8rem;
  border-left: 3px solid var(--accent);
  background: var(--surface-2);
  border-radius: 0 var(--radius) var(--radius) 0;
}

.next-name {
  font-size: 1.15rem;
  font-weight: 600;
}

.lauf-ende {
  margin: 0.75rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.chooser {
  margin: 0.75rem 0;
  padding: 0.75rem;
  background: var(--surface-2);
  border-radius: var(--radius);
}

.slot-button {
  border-left: 4px solid var(--border);
}

.deferred {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
}

.deferred li {
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--border);
}

.grow {
  flex: 1;
  min-width: 8rem;
}

.shift {
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}
</style>
