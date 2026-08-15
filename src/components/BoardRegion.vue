<script setup lang="ts">
import { computed } from 'vue'
import type { BoardConfig, Parcours, ParcoursRuntime, Starter } from '../types'
import { currentSlot, previousSlot } from '../lib/startlist'

const props = defineProps<{
  parcours: Parcours
  runtime: ParcoursRuntime
  board: BoardConfig
  starterById: (id: string) => Starter | undefined
  /** Bei zwei Parcours steht der Name darüber, bei einem ist er überflüssig. */
  showParcoursName: boolean
  /** Startnummer über den Angaben statt daneben – siehe `BoardView`. */
  stacked: boolean
  now: number
}>()

interface Shown {
  startNr: string
  klasse: string
  lauf: number
  name: string
  origin: string
}

function describe(slotId: string | undefined): Shown | null {
  if (!slotId) return null
  const slot = props.runtime.slots.find((s) => s.id === slotId)
  if (!slot) return null
  const starter = props.starterById(slot.starterId)
  if (!starter) return null

  const name = props.board.showVorname
    ? `${starter.vorname} ${starter.nachname}`.trim()
    : starter.nachname
  const origin =
    props.board.originMode === 'bundesland'
      ? starter.bundesland || starter.verein
      : starter.verein || starter.bundesland

  return { startNr: starter.startNr, klasse: starter.klasse, lauf: slot.lauf, name, origin }
}

const current = computed(() => describe(currentSlot(props.runtime)?.id))
const previous = computed(() => describe(previousSlot(props.runtime)?.id))

/** Meldungen laufen ab, ohne dass jemand sie wegklicken muss. */
const message = computed(() => {
  const m = props.runtime.message
  if (!m) return null
  if (m.until !== undefined && m.until <= props.now) return null
  return m
})

/** Eine Störungs-/Pausenmeldung verdrängt den Starter, eine Info steht darunter. */
const messageReplaces = computed(() => !!message.value && message.value.kind !== 'info')

/** Wechselt der Inhalt, blendet Vue weich um – kein Neuladen, kein weißer Blitz. */
const swapKey = computed(() =>
  messageReplaces.value ? `msg:${message.value!.text}` : `slot:${currentSlot(props.runtime)?.id ?? 'leer'}`,
)
</script>

<template>
  <section class="board-region">
    <!--
      Bewusst **ohne** `<Transition>`.

      Eine Überblendung braucht zwei Fassungen gleichzeitig (Doppelbilder), ein
      `mode="out-in"` dagegen hängt das Einblenden des neuen Inhalts davon ab,
      dass die Ausblendung des alten zu Ende läuft – und die braucht
      Animationsframes. Bekommt das Fenster keine (verdeckt, minimiert,
      gedrosselt), bliebe die Tafel auf dem alten Starter stehen. Für eine
      Wettkampftafel ist das der schlimmste denkbare Fehler.

      Der Wechsel ist deshalb hart; das weiche Erscheinen macht eine reine
      CSS-Animation. Läuft die nicht, ist der Inhalt trotzdem sofort da.
    -->
    <div :key="swapKey" v-fit-block class="region-content" :class="{ stacked }">
        <template v-if="messageReplaces">
          <div v-fit class="board-line board-message" :class="message!.kind">
            {{ message!.text }}
          </div>
        </template>

        <template v-else-if="current">
          <!--
            Der Parcours steht ganz links – er ordnet den Block einem Bereich
            des Sees zu und wird nur beim Suchen gebraucht. Klasse und Lauf
            gehören zum laufenden Starter und bleiben deshalb mittig über der
            Startnummer.
          -->
          <div v-fit class="board-line board-meta">
            <span class="parcours">{{ showParcoursName ? parcours.name : '' }}</span>
            <span class="middle">
              <span class="klasse">Klasse {{ current.klasse }}</span>
              <span class="lauf">Lauf {{ current.lauf }}</span>
            </span>
            <span></span>
          </div>

          <!--
            Startnummer und Textblock nebeneinander: So begrenzt nur noch die
            Höhe die Nummer, statt sie sich mit Name und Verein teilen zu
            müssen – bei gleicher Bereichshöhe wird sie dadurch deutlich größer.

            In einem hohen Bereich (ein Parcours) reicht die Breite dafür nicht:
            Dort stehen beide untereinander, `stacked` schaltet um.
          -->
          <div class="board-main">
            <div v-fit class="board-line board-startnr">{{ current.startNr }}</div>
            <div class="board-info">
              <div v-fit class="board-line board-name">{{ current.name }}</div>
              <div v-fit class="board-line board-origin">{{ current.origin }}</div>
              <div v-if="board.showPrevious && previous" v-fit class="board-line board-previous">
                davor: {{ previous.startNr }} · {{ previous.name }}
              </div>
            </div>
          </div>

          <!-- Eine Info steht unter dem Starter und ist Zusatz – deshalb klein. -->
          <div v-if="message" class="board-line board-message info below">{{ message.text }}</div>
        </template>

        <template v-else>
          <!-- Gleicher Aufbau wie beim laufenden Starter, damit der Parcours-Name
               beim ersten Start nicht seine Position wechselt. -->
          <div v-if="showParcoursName && parcours.name" v-fit class="board-line board-meta">
            <span class="parcours">{{ parcours.name }}</span>
            <span class="middle"></span>
            <span></span>
          </div>
          <div class="board-empty">bereit</div>
        </template>
      </div>
  </section>
</template>

