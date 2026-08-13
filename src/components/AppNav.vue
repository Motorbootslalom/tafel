<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../state/store'
import { navigate, viewUrl, type ViewName } from '../lib/router'
import { KIND_LABEL } from '../transport'
import { ROLE_LABEL } from '../state/permissions'

const props = defineProps<{ active: ViewName }>()
const store = useStore()

const status = computed(() => store.connectionStatus.value)

/**
 * Im Pro-Betrieb hält nur ein Fenster die Verbindung. Die anderen zeigen
 * denselben Zustand mit dem Zusatz, dass er von dort kommt – sonst sähe es dort
 * nach einem Defekt aus, obwohl alles läuft.
 */
const statusText = computed(() => {
  if (store.transportConfig.kind === 'local') return 'Nur dieser Rechner'
  const zusatz = store.relayLeader.value ? '' : ' (anderes Fenster)'
  switch (status.value) {
    case 'connected':
      return `${KIND_LABEL[store.transportConfig.kind]} verbunden${zusatz}`
    case 'connecting':
      return 'Verbinde …'
    case 'reconnecting':
      return `Verbindung unterbrochen – versuche erneut${zusatz}`
    case 'error':
      return store.transport.value?.error.value ?? 'Verbindungsfehler'
    default:
      return store.relayLeader.value ? 'Nicht verbunden' : 'Warte auf anderes Fenster'
  }
})

/**
 * Die Tafel läuft im zweiten Fenster. Wird sie von hier aus geöffnet, besteht
 * eine direkte Fensterverbindung – dadurch funktioniert die Aktualisierung auch
 * dann, wenn die Anwendung als einzelne Datei von `file://` geöffnet wurde.
 */
function openBoard(): void {
  const win = window.open(viewUrl('tafel'), 'tafel-anzeige')
  if (win) store.registerPeerWindow(win)
}

const links: { view: ViewName; label: string }[] = [
  { view: 'admin', label: 'Verwaltung' },
  { view: 'steg', label: 'Steg' },
  { view: 'liste', label: 'Startliste' },
]

const visible = computed(() =>
  links.filter((l) => (l.view === 'admin' ? store.role.value === 'admin' : true)),
)
</script>

<template>
  <header class="spread nav">
    <nav class="tabs" style="border: none; margin: 0">
      <button
        v-for="link in visible"
        :key="link.view"
        :class="{ active: link.view === props.active }"
        @click="navigate(link.view)"
      >
        {{ link.label }}
      </button>
    </nav>

    <div class="row small">
      <span class="row-tight dim">
        <span class="status-dot" :class="status"></span>
        {{ statusText }}
      </span>
      <span class="dim">
        ·
        <template v-if="store.grant.value">{{ ROLE_LABEL[store.grant.value.role] }}</template>
        <template v-else>keine Rechte</template>
      </span>
      <button @click="openBoard">Tafel öffnen</button>
    </div>
  </header>
</template>

<style scoped>
.nav {
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}
</style>
