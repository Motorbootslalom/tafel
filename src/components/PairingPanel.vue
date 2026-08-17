<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useStore } from '../state/store'
import { formatCode, remainingSeconds, QR_TOKEN_TTL_MS } from '../lib/pairing'
import { qrSvg } from '../lib/qr'
import { viewUrl } from '../lib/router'
import { ASSIGNABLE_ROLES, ROLE_HINT, ROLE_LABEL } from '../state/permissions'
import type { Role } from '../types'

/**
 * Geräte freischalten (Pro-Version).
 *
 * Der Admin legt vorher fest, **welche Rechte** der Code mitbringt – etwa „Steg,
 * nur Parcours See". Das Gerät kann daran nichts ändern; es kennt nur den Code.
 *
 * Der QR-Code wechselt alle 30 Sekunden, damit ein abfotografierter Bildschirm
 * niemandem dauerhaft Zugang verschafft. Der Geräte-Code gilt 5 Minuten und ist
 * zum Vorlesen übers Funkgerät gedacht.
 */
const store = useStore()

const role = ref<Role>('steg')
const parcoursIds = ref<string[]>([])
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

const open = computed(() => !!store.pairing.deviceCode || !!store.pairing.qrToken)
const remoteReady = computed(() => store.transportConfig.kind !== 'local')

const codeSeconds = computed(() => remainingSeconds(store.pairing.deviceCode, now.value))
const qrSeconds = computed(() => remainingSeconds(store.pairing.qrToken, now.value))

/** Der QR-Code enthält alles, was das Handy zum Verbinden braucht. */
const qrTarget = computed(() => {
  const token = store.pairing.qrToken?.value
  if (!token) return ''
  return viewUrl('pair', {
    t: token,
    u: store.transportConfig.url ?? '',
    r: store.transportConfig.room ?? 'default',
    k: store.transportConfig.kind,
  })
})

const qrMarkup = computed(() => (qrTarget.value ? qrSvg(qrTarget.value) : ''))

function start(): void {
  store.openPairing({ role: role.value, parcoursIds: [...parcoursIds.value] })
}

function stop(): void {
  store.closePairing()
}

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
    // Kurz vor Ablauf einen frischen Token erzeugen – der alte bleibt im
    // Kulanzfenster gültig, ein laufender Scan geht also nicht verloren.
    if (store.pairing.qrToken && store.pairing.qrToken.expiresAt - now.value <= 0) {
      store.rotatePairingToken()
    }
  }, 1000)
})

onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

function toggleParcours(id: string): void {
  parcoursIds.value = parcoursIds.value.includes(id)
    ? parcoursIds.value.filter((p) => p !== id)
    : [...parcoursIds.value, id]
}
</script>

<template>
  <section class="card stack">
    <h2>Gerät freischalten</h2>

    <p v-if="!remoteReady" class="hint warn">
      Aktuell läuft nur dieser Rechner (Basis-Version). Für Handys am Steg zuerst unter
      „Verbindung" ein Relais einrichten – das lokale Mini-Programm im WLAN oder eines
      im Internet.
    </p>

    <template v-else>
      <div class="row">
        <label class="row-tight">
          Rolle
          <select v-model="role">
            <option v-for="r in ASSIGNABLE_ROLES" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
          </select>
        </label>
        <span class="dim small">{{ ROLE_HINT[role] }}</span>
      </div>

      <div v-if="role === 'steg'">
        <span class="small dim">Darf diese Parcours bedienen</span>
        <div class="row">
          <label
            v-for="parcours in store.state.parcoursList"
            :key="parcours.id"
            class="row-tight toggle"
          >
            <input
              type="checkbox"
              :checked="parcoursIds.includes(parcours.id)"
              @change="toggleParcours(parcours.id)"
            />
            {{ parcours.name }}
          </label>
        </div>
        <p v-if="!parcoursIds.length" class="hint warn">
          Ohne ausgewählten Parcours kann das Gerät nichts bedienen.
        </p>
      </div>

      <div class="row">
        <button class="primary" @click="start">
          {{ open ? 'Neuen Code ausgeben' : 'Code ausgeben' }}
        </button>
        <button v-if="open" @click="stop">Anmeldung schließen</button>
      </div>

      <div v-if="open" class="pairing-view">
        <div>
          <div class="qr-box" v-html="qrMarkup"></div>
          <p class="hint">
            QR-Code scannen · wechselt in {{ qrSeconds }} s
            <span class="dim">(alle {{ QR_TOKEN_TTL_MS / 1000 }} s)</span>
          </p>
        </div>

        <div>
          <span class="small dim">Geräte-Code zum Vorlesen</span>
          <div class="code-display">
            {{ store.pairing.deviceCode ? formatCode(store.pairing.deviceCode.value) : '–' }}
          </div>
          <p class="hint" :class="{ warn: codeSeconds < 60 }">
            <template v-if="codeSeconds">noch {{ Math.floor(codeSeconds / 60) }}:{{
              String(codeSeconds % 60).padStart(2, '0')
            }} gültig</template>
            <template v-else>abgelaufen – neuen Code ausgeben</template>
          </p>
          <p class="hint">
            Groß- und Kleinschreibung ist egal. Aus jedem verwechselbaren Paar kommt nur die
            <strong>Ziffer</strong> vor: <span class="mono">0</span> statt O,
            <span class="mono">1</span> statt I und L, <span class="mono">2</span> statt Z,
            <span class="mono">5</span> statt S, <span class="mono">8</span> statt B. Wer sich beim
            Ablesen vertut und den Buchstaben tippt, kommt trotzdem durch – er wird als die
            zugehörige Ziffer gelesen.
          </p>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.pairing-view {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  align-items: flex-start;
  padding-top: 0.5rem;
}

.toggle {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.15rem 0.5rem;
}
</style>
