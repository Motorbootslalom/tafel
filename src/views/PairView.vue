<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useStore } from '../state/store'
import { navigate } from '../lib/router'
import { formatCode, normalizeCode } from '../lib/pairing'
import { suggestDeviceName } from '../lib/deviceName'
import { ROLE_LABEL } from '../state/permissions'

/**
 * Anmeldung eines mobilen Bediengeräts.
 *
 * Zwei Wege führen hierher:
 *
 * - **QR-Code scannen** – dann stehen Relais-Adresse, Raum und der 30 s gültige
 *   Token schon in der URL, und die Anmeldung läuft ohne weitere Eingabe.
 * - **Geräte-Code eintippen** – für den Fall, dass der Bildschirm nicht in
 *   Reichweite ist. Dazu müssen Adresse und Raum einmalig eingetragen werden.
 */
const props = defineProps<{ params: URLSearchParams }>()
const store = useStore()

const token = ref(props.params.get('t') ?? '')
const relayUrl = ref(props.params.get('u') ?? store.transportConfig.url ?? '')
const room = ref(props.params.get('r') ?? store.transportConfig.room ?? 'default')
const kind = ref<'lan' | 'cloud'>(
  (props.params.get('k') as 'lan' | 'cloud') ??
    (store.transportConfig.kind === 'cloud' ? 'cloud' : 'lan'),
)
/**
 * Vorbelegt mit dem, was das Gerät über sich verrät – am Steg soll niemand
 * tippen müssen. Ein früher vergebener Name hat Vorrang. Kennt der Host den
 * Namen schon, hängt er beim Freischalten eine Zahl an.
 */
const name = ref(localStorage.getItem('tafel:device-name') || suggestDeviceName())
const busy = ref(false)

const scanned = computed(() => !!props.params.get('t'))
const codeValid = computed(() => scanned.value || !!normalizeCode(token.value))
const canSubmit = computed(
  () => !busy.value && codeValid.value && !!relayUrl.value.trim() && !!name.value.trim(),
)

const errorText = computed(() => store.transport.value?.error.value ?? null)

async function connect(): Promise<void> {
  if (!canSubmit.value) return
  busy.value = true
  localStorage.setItem('tafel:device-name', name.value.trim())

  await store.setTransport({
    kind: kind.value,
    url: relayUrl.value.trim(),
    room: room.value.trim() || 'default',
    isHost: false,
  })

  const value = scanned.value ? token.value : normalizeCode(token.value)!
  store.requestAccess(value, name.value.trim())
  busy.value = false
}

// Sobald der Host die Rechte erteilt hat, geht es direkt an die Arbeit.
watch(
  () => store.grant.value,
  (grant) => {
    if (grant && grant.role !== 'admin') {
      navigate(grant.role === 'viewer' ? 'liste' : 'steg')
    }
  },
)

onMounted(() => {
  // Mit gescanntem Token sofort verbinden – der Token gilt nur 30 Sekunden.
  if (scanned.value && name.value.trim()) void connect()
})
</script>

<template>
  <div class="page" style="max-width: 34rem">
    <h1>Gerät verbinden</h1>

    <div v-if="store.grant.value && store.grant.value.role !== 'admin'" class="card">
      <h2 class="ok">Verbunden</h2>
      <p>
        Dieses Gerät ist als <strong>{{ ROLE_LABEL[store.grant.value.role] }}</strong> angemeldet.
      </p>
      <p v-if="store.grant.value.parcoursIds.length" class="dim small">
        Freigegeben für:
        {{
          store.state.parcoursList
            .filter((p) => store.grant.value!.parcoursIds.includes(p.id))
            .map((p) => p.name)
            .join(', ')
        }}
      </p>
      <button class="primary" @click="navigate('steg')">Zur Steg-Bedienung</button>
    </div>

    <div v-else class="card stack">
      <p class="dim">
        Die Verwaltung zeigt einen QR-Code und einen sechsstelligen Geräte-Code an. Der QR-Code
        wechselt alle 30 Sekunden, der Geräte-Code gilt 5 Minuten.
      </p>

      <label class="field">
        Name dieses Geräts
        <input v-model="name" placeholder="z. B. Steg See" autocomplete="off" />
      </label>

      <label v-if="!scanned" class="field">
        Geräte-Code
        <input
          v-model="token"
          class="mono"
          style="font-size: 1.4rem; letter-spacing: 0.15em; text-transform: uppercase"
          placeholder="A3F-K7M"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
        />
      </label>
      <p v-if="!scanned && token && !codeValid" class="hint error">
        Der Code besteht aus sechs Zeichen – Groß- und Kleinschreibung ist egal.
      </p>
      <p v-else-if="!scanned && codeValid && token" class="hint">
        Erkannt als <span class="mono">{{ formatCode(normalizeCode(token)!) }}</span>
      </p>

      <details v-if="!scanned">
        <summary class="small dim">Verbindungsdaten</summary>
        <div class="stack" style="margin-top: 0.5rem">
          <label class="field">
            Adresse des Relais
            <input v-model="relayUrl" placeholder="ws://192.168.1.20:8080/ws" autocomplete="off" />
          </label>
          <label class="field">
            Raum
            <input v-model="room" autocomplete="off" />
          </label>
          <label class="field">
            Art
            <select v-model="kind">
              <option value="lan">Lokales Netz</option>
              <option value="cloud">Internet (Cloud)</option>
            </select>
          </label>
        </div>
      </details>

      <p v-if="errorText" class="hint error">{{ errorText }}</p>

      <button class="primary big" :disabled="!canSubmit" @click="connect">
        {{ busy ? 'Verbinde …' : 'Verbinden' }}
      </button>
    </div>

    <button @click="navigate('start')">Zurück</button>
  </div>
</template>
