<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore } from '../state/store'

/**
 * Nach einem Update alle Geräte neu laden, statt jedes Handy einzeln
 * anzufassen. Am Rechner bleibt das Fenster stehen, in dem geklickt wurde; auf
 * einem Gerät (Poweruser) lädt es mit.
 */
const store = useStore()
const sent = ref(false)

const frage = computed(() =>
  store.isHost.value
    ? 'Alle Geräte und die anderen Fenster auf diesem Rechner neu laden?'
    : 'Alle Geräte neu laden, dieses eingeschlossen?',
)

function reloadAll(): void {
  if (!confirm(`${frage.value} Was dort gerade eingetippt, aber noch nicht bestätigt ist, geht verloren.`)) {
    return
  }
  store.reloadAll()
  sent.value = true
  setTimeout(() => (sent.value = false), 4000)
}
</script>

<template>
  <div class="row">
    <button @click="reloadAll">Alle Geräte neu laden</button>
    <span v-if="sent" class="small ok">Neu laden angestoßen.</span>
    <span v-else class="small dim">
      Nach einem Update: Tafel, Handys und Tablets holen sich die neue Fassung. Angemeldet bleiben
      sie dabei.
    </span>
  </div>
</template>
