<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../state/store'
import AppNav from '../components/AppNav.vue'
import StegPanel from '../components/StegPanel.vue'
import { navigate } from '../lib/router'

const store = useStore()

/**
 * Ein Gerät sieht nur die Parcours, die es bedienen darf – am Steg soll niemand
 * versehentlich den anderen Parcours weiterschalten. Der Admin sieht alle.
 */
const parcoursList = computed(() =>
  store.state.parcoursList.filter(
    (p) => store.role.value === 'admin' || store.mayOperate(p.id) || store.role.value === 'viewer',
  ),
)

const runtimeOf = (id: string) => store.state.runtimes.find((rt) => rt.parcoursId === id)
const hasStartlist = computed(() => store.state.runtimes.some((rt) => rt.slots.length > 0))
</script>

<template>
  <div class="page">
    <AppNav active="steg" />

    <div v-if="!store.grant.value" class="card">
      <h2>Dieses Gerät ist nicht angemeldet</h2>
      <p class="dim">
        Für die Bedienung vom Handy aus braucht das Gerät eine Freigabe: QR-Code scannen oder den
        Geräte-Code eingeben, den die Verwaltung anzeigt.
      </p>
      <button class="primary" @click="navigate('pair')">Jetzt verbinden</button>
    </div>

    <div v-else-if="!hasStartlist" class="card">
      <h2>Noch keine Startliste</h2>
      <p class="dim">
        In der Verwaltung zuerst die Starterliste importieren und die Startlisten erzeugen.
      </p>
      <button v-if="store.role.value === 'admin'" class="primary" @click="navigate('admin')">
        Zur Verwaltung
      </button>
    </div>

    <template v-else>
      <StegPanel
        v-for="parcours in parcoursList"
        :key="parcours.id"
        :parcours="parcours"
        :runtime="runtimeOf(parcours.id)!"
      />
      <p v-if="!parcoursList.length" class="card dim">
        Diesem Gerät ist noch kein Parcours zugewiesen. Die Verwaltung kann das in der
        Geräteverwaltung ändern.
      </p>
    </template>
  </div>
</template>
