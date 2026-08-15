<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useStore } from '../state/store'
import BoardRegion from '../components/BoardRegion.vue'

/**
 * Das Vollbild-Fenster auf dem Monitor der Wettkampftafel.
 *
 * Der springende Punkt gegenüber der alten Word-Lösung: Hier wird nie eine Seite
 * neu geladen. Der Zustand kommt über den Store herein, Vue tauscht nur die
 * betroffenen Textknoten aus und blendet sie weich um – es gibt keinen weißen
 * Blitz, weil der schwarze Hintergrund nie verschwindet.
 */
const store = useStore()

const regions = computed(() => store.state.parcoursList.length)
const hasHeader = computed(
  () => !!store.state.board.kopfzeile.trim() || !!store.state.board.logoDataUrl,
)

/** Kopfzeile bekommt einen festen Anteil der Höhe; ohne sie bleibt alles Starter. */
const headerFraction = computed(() => (hasHeader.value ? (regions.value > 1 ? 0.11 : 0.15) : 0))
const headerHeight = computed(() => `${headerFraction.value * 100}vh`)

/**
 * Nebeneinander oder untereinander?
 *
 * Die Startnummer ist so groß, wie der Bereich hoch ist. Bei zwei Parcours ist
 * ein Bereich flach und sehr breit – dort stehen Nummer und Angaben gut
 * nebeneinander. Bei einem Parcours ist der Bereich fast so hoch wie breit: Die
 * Nummer füllt dann zwei Drittel der Breite, für Name und Verein bleibt ein
 * schmaler Streifen, und die Breitenanpassung rechnet sie darin auf einen
 * Bruchteil herunter. Das Missverhältnis fällt sofort auf.
 *
 * Entschieden wird deshalb nicht nach der Zahl der Parcours, sondern nach dem
 * Seitenverhältnis des Bereichs – ein breites LED-Band bleibt so auch mit einem
 * Parcours nebeneinander.
 */
const STAPELN_UNTER = 2.4

const viewport = ref({ w: window.innerWidth, h: window.innerHeight })

const stacked = computed(() => {
  const regionH = (viewport.value.h * (1 - headerFraction.value)) / regions.value
  return regionH > 0 && viewport.value.w / regionH < STAPELN_UNTER
})

const cssVars = computed(() => ({
  '--regions': String(regions.value),
  '--header-h': headerHeight.value,
  '--scale': String(store.state.board.scale || 1),
}))

// Sekundentakt: nur damit ablaufende Meldungen von selbst verschwinden.
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

// Maus nach kurzer Ruhe ausblenden – auf der Tafel hat kein Zeiger etwas verloren.
const cursorHidden = ref(true)
let cursorTimer: ReturnType<typeof setTimeout> | null = null

function onViewportChange(): void {
  viewport.value = { w: window.innerWidth, h: window.innerHeight }
}

function onPointerMove(): void {
  cursorHidden.value = false
  if (cursorTimer) clearTimeout(cursorTimer)
  cursorTimer = setTimeout(() => (cursorHidden.value = true), 2500)
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    // Browser verweigert Vollbild ohne Nutzergeste – dann eben per Taste F11.
  }
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === 'f' || ev.key === 'F') void toggleFullscreen()
}

onMounted(() => {
  ticker = setInterval(() => (now.value = Date.now()), 1000)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('keydown', onKey)
  document.body.style.background = '#000'
})

onUnmounted(() => {
  if (ticker) clearInterval(ticker)
  if (cursorTimer) clearTimeout(cursorTimer)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('keydown', onKey)
  document.body.style.background = ''
})

const runtimeOf = (parcoursId: string) =>
  store.state.runtimes.find((rt) => rt.parcoursId === parcoursId)
</script>

<template>
  <div
    class="board"
    :class="{ 'cursor-hidden': cursorHidden }"
    :style="cssVars"
    @dblclick="toggleFullscreen"
  >
    <header v-if="hasHeader" class="board-header">
      <img v-if="store.state.board.logoDataUrl" :src="store.state.board.logoDataUrl" alt="" />
      <div v-fit class="title board-line">{{ store.state.board.kopfzeile }}</div>
      <img v-if="store.state.board.logoDataUrl" :src="store.state.board.logoDataUrl" alt="" />
    </header>

    <template v-for="(parcours, index) in store.state.parcoursList" :key="parcours.id">
      <div v-if="index > 0" class="board-separator"></div>
      <BoardRegion
        v-if="runtimeOf(parcours.id)"
        :parcours="parcours"
        :runtime="runtimeOf(parcours.id)!"
        :board="store.state.board"
        :starter-by-id="store.starterById"
        :show-parcours-name="store.state.board.showParcoursName"
        :stacked="stacked"
        :now="now"
      />
    </template>
  </div>
</template>
