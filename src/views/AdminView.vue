<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore } from '../state/store'
import AppNav from '../components/AppNav.vue'
import StarterImport from '../components/StarterImport.vue'
import VerzahnungEditor from '../components/VerzahnungEditor.vue'
import StartlistEditor from '../components/StartlistEditor.vue'
import BoardConfigPanel from '../components/BoardConfigPanel.vue'
import TimingPanel from '../components/TimingPanel.vue'
import ConnectionPanel from '../components/ConnectionPanel.vue'
import PairingPanel from '../components/PairingPanel.vue'
import DeviceList from '../components/DeviceList.vue'
import BackupPanel from '../components/BackupPanel.vue'

const store = useStore()

type Tab = 'starter' | 'parcours' | 'startliste' | 'tafel' | 'geraete'
const tab = ref<Tab>('starter')

const tabs: { id: Tab; label: string }[] = [
  { id: 'starter', label: 'Starter' },
  { id: 'parcours', label: 'Parcours & Verzahnung' },
  { id: 'startliste', label: 'Startlisten' },
  { id: 'tafel', label: 'Tafel & Zeiten' },
  { id: 'geraete', label: 'Geräte' },
]

const runtimeOf = (id: string) => store.state.runtimes.find((rt) => rt.parcoursId === id)
const hasStarters = computed(() => store.state.starters.length > 0)

/** Erneutes Erzeugen wirft den Betriebsstand weg – deshalb nachfragen. */
function regenerateAll(): void {
  const running = store.state.runtimes.some((rt) => rt.history.length > 0)
  if (running && !confirm('Die Startlisten werden neu erzeugt. Der bisherige Verlauf (bereits gefahrene Starts und gemessene Zeiten) geht dabei verloren. Fortfahren?')) {
    return
  }
  store.dispatch({ type: 'GENERATE_ALL_STARTLISTS' })
}

function regenerateOne(parcoursId: string): void {
  const rt = runtimeOf(parcoursId)
  if (rt && rt.history.length > 0 && !confirm('Startliste dieses Parcours neu erzeugen? Der bisherige Verlauf geht verloren.')) {
    return
  }
  store.dispatch({ type: 'GENERATE_STARTLIST', parcoursId })
}


</script>

<template>
  <div class="page">
    <AppNav active="admin" />

    <div class="tabs">
      <button v-for="t in tabs" :key="t.id" :class="{ active: tab === t.id }" @click="tab = t.id">
        {{ t.label }}
      </button>
    </div>

    <!-- Starter ------------------------------------------------------------->
    <template v-if="tab === 'starter'">
      <section class="card">
        <h2>Veranstaltung</h2>
        <div class="row">
          <label class="field" style="flex: 2; min-width: 14rem">
            Name
            <input
              :value="store.state.eventName"
              @change="
                store.dispatch({
                  type: 'SET_EVENT',
                  eventName: ($event.target as HTMLInputElement).value,
                  eventJahr: store.state.eventJahr,
                  laufCount: store.state.laufCount,
                })
              "
            />
          </label>
          <label class="field">
            Jahr
            <input
              type="number"
              style="width: 6rem"
              :value="store.state.eventJahr"
              @change="
                store.dispatch({
                  type: 'SET_EVENT',
                  eventName: store.state.eventName,
                  eventJahr: Number(($event.target as HTMLInputElement).value),
                  laufCount: store.state.laufCount,
                })
              "
            />
          </label>
          <label class="field">
            Läufe
            <input
              type="number"
              min="1"
              max="9"
              style="width: 5rem"
              :value="store.state.laufCount"
              @change="
                store.dispatch({
                  type: 'SET_EVENT',
                  eventName: store.state.eventName,
                  eventJahr: store.state.eventJahr,
                  laufCount: Number(($event.target as HTMLInputElement).value),
                })
              "
            />
          </label>
        </div>
        <p class="hint">
          Die Anzahl der Läufe gilt beim Erzeugen der Startlisten. Einzelne Läufe lassen sich
          danach jederzeit nachtragen oder verschieben.
        </p>
      </section>

      <StarterImport />
    </template>

    <!-- Parcours & Verzahnung ----------------------------------------------->
    <template v-else-if="tab === 'parcours'">
      <section class="card">
        <h2>Parcours</h2>
        <div class="row">
          <label class="row-tight">
            Anzahl
            <select
              :value="store.state.parcoursList.length"
              @change="
                store.dispatch({
                  type: 'SET_PARCOURS_COUNT',
                  count: Number(($event.target as HTMLSelectElement).value),
                })
              "
            >
              <option :value="1">1 Parcours</option>
              <option :value="2">2 Parcours</option>
            </select>
          </label>
          <span class="dim small">
            Bei zwei Parcours zeigt die Tafel beide übereinander, getrennt durch eine grüne Linie.
          </span>
        </div>
      </section>

      <section v-for="parcours in store.state.parcoursList" :key="parcours.id" class="card">
        <h2>{{ parcours.name }}</h2>
        <VerzahnungEditor :parcours="parcours" />
      </section>
    </template>

    <!-- Startlisten ---------------------------------------------------------->
    <template v-else-if="tab === 'startliste'">
      <section class="card">
        <div class="spread">
          <div>
            <h2>Startlisten erzeugen</h2>
            <p class="hint" style="margin: 0">
              Aus der Verzahnung, {{ store.state.laufCount }}× hintereinander (ein Durchgang je
              Lauf).
            </p>
          </div>
          <button class="primary" :disabled="!hasStarters" @click="regenerateAll">
            Alle neu erzeugen
          </button>
        </div>
        <p v-if="!hasStarters" class="hint warn">Zuerst die Starterliste importieren.</p>
      </section>

      <section v-for="parcours in store.state.parcoursList" :key="parcours.id" class="card">
        <div class="spread">
          <h2>{{ parcours.name }}</h2>
          <button :disabled="!hasStarters" @click="regenerateOne(parcours.id)">Neu erzeugen</button>
        </div>
        <StartlistEditor
          v-if="runtimeOf(parcours.id)"
          :parcours="parcours"
          :runtime="runtimeOf(parcours.id)!"
        />
      </section>
    </template>

    <!-- Tafel & Zeiten -------------------------------------------------------->
    <template v-else-if="tab === 'tafel'">
      <BoardConfigPanel />
      <TimingPanel />

      <BackupPanel />
    </template>

    <!-- Geräte ---------------------------------------------------------------->
    <template v-else>
      <ConnectionPanel />
      <PairingPanel />
      <DeviceList />
    </template>
  </div>
</template>
