<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStore } from '../state/store'
import { KIND_LABEL, type TransportKind } from '../transport'
import { fetchRelayAddresses, guessRelayUrl, preferredRelay } from '../lib/relay'
import { buildLabel } from '../lib/build'
import {
  DEFAULT_NTFY_SERVER,
  createHostRoom,
  hostPublicOf,
  loadHostRoom,
  normalizeServer,
  saveHostRoom,
} from '../transport/ntfy/room'

/**
 * Betriebsart wählen.
 *
 * - **Dieser Rechner** – die Basis-Version: zwei Browserfenster, kein Server,
 *   alles im localStorage. Funktioniert überall und braucht keine Installation.
 * - **Lokales Netz** – das Mini-Programm aus `server/` läuft auf dem
 *   Bedienrechner und öffnet einen WebSocket im WLAN oder Handy-Hotspot. Der
 *   Weg für den Wettkampfort ohne Internet.
 * - **Internet (ntfy)** – über einen öffentlichen ntfy-Server, ohne eigenes Relais.
 *   Die Seite kann dabei weiter von GitHub Pages kommen.
 * - **Internet (eigenes Relais)** – dasselbe Protokoll über ein Relais im Netz
 *   (AWS, Cloudflare); nur sinnvoll, wenn vor Ort verlässlich Netz da ist.
 *
 * Liefert das Mini-Programm die Seite selbst aus, muss die Adresse nicht
 * abgetippt werden: Es nennt auf Anfrage alle Adressen, unter denen es im Netz
 * erreichbar ist. Das ist wichtig, weil die Adresszeile oft `localhost` zeigt –
 * damit erreicht kein Handy den Rechner.
 */
const store = useStore()

const kind = ref<TransportKind>(store.transportConfig.kind)
const wasNtfy = store.transportConfig.kind === 'ntfy'
const url = ref(wasNtfy ? '' : (store.transportConfig.url ?? ''))
/** Eigenes Feld: Die Relais-Adresse der anderen Betriebsarten passt hier nicht. */
const ntfyServer = ref(wasNtfy ? (store.transportConfig.url ?? DEFAULT_NTFY_SERVER) : DEFAULT_NTFY_SERVER)
/** Erst nach Rückfrage – ein neuer Raum heißt: alle Geräte neu anmelden. */
const confirmNewRoom = ref(false)
const room = ref(store.transportConfig.room ?? 'default')
const hostKey = ref(store.transportConfig.hostKey ?? '')
const busy = ref(false)

/** Vom Mini-Programm gemeldete Adressen. */
const bekannteAdressen = ref<string[]>([])
const eigeneAdresse = ref<string | null>(null)
/** Adresse von Hand eingeben statt aus der Liste wählen. */
const freieEingabe = ref(false)

onMounted(async () => {
  eigeneAdresse.value = guessRelayUrl()

  const gefunden = await fetchRelayAddresses()
  if (!gefunden || gefunden.relais.length === 0) {
    // Nicht vom Mini-Programm ausgeliefert. Steht die Seite trotzdem auf einem
    // Server, ist dessen Adresse zumindest ein brauchbarer Vorschlag.
    if (eigeneAdresse.value && !url.value) url.value = eigeneAdresse.value
    freieEingabe.value = true
    return
  }

  bekannteAdressen.value = gefunden.relais
  // Eine bereits gespeicherte Adresse hat Vorrang – sie hat schon funktioniert.
  if (!url.value || !gefunden.relais.includes(url.value)) {
    if (!url.value) url.value = preferredRelay(gefunden.relais) ?? ''
    else freieEingabe.value = true
  }
  if (kind.value === 'local') kind.value = 'lan'
})

const needsUrl = computed(() => kind.value === 'lan' || kind.value === 'cloud')
const ntfyServerValid = computed(() => normalizeServer(ntfyServer.value) !== null)
/** ntfy.sh erlaubt ohne Konto nur 250 Nachrichten je Tag und IP. */
const ntfyShWarning = computed(() => /(^|\/\/)ntfy\.sh(\/|$)/.test(ntfyServer.value.trim()))
/** Der Raum, den dieser Rechner gerade nutzt – nur, wenn seine Schlüssel hier liegen. */
const currentNtfyRoom = computed(() => {
  const topic = store.transportConfig.kind === 'ntfy' ? store.transportConfig.room : undefined
  return topic && loadHostRoom(topic) ? topic : null
})
const zeigeAuswahl = computed(
  () => kind.value === 'lan' && bekannteAdressen.value.length > 0 && !freieEingabe.value,
)
const canApply = computed(() => {
  if (busy.value) return false
  if (kind.value === 'ntfy') return ntfyServerValid.value
  return !needsUrl.value || !!url.value.trim()
})

const status = computed(() => store.connectionStatus.value)
const errorText = computed(() => store.transport.value?.error.value)

/** „ws://192.168.1.20:8080/ws" → „192.168.1.20:8080" (kürzer im Menü). */
function kurz(adresse: string): string {
  try {
    return new URL(adresse).host
  } catch {
    return adresse
  }
}

/**
 * Über ntfy: den bestehenden Raum weiterverwenden, sonst einen anlegen. Die
 * Schlüssel bleiben im Browser; nach außen gehen nur die öffentlichen.
 */
async function applyNtfy(fresh: boolean): Promise<void> {
  const server = normalizeServer(ntfyServer.value)
  if (!server) return
  busy.value = true
  confirmNewRoom.value = false
  let room = !fresh && currentNtfyRoom.value ? loadHostRoom(currentNtfyRoom.value) : null
  if (!room) {
    room = createHostRoom()
    saveHostRoom(room)
  }
  ntfyServer.value = server
  await store.setTransport({
    kind: 'ntfy',
    url: server,
    room: room.topic,
    hostPublic: hostPublicOf(room),
    isHost: true,
  })
  busy.value = false
}

async function apply(): Promise<void> {
  if (kind.value === 'ntfy') {
    await applyNtfy(false)
    return
  }
  busy.value = true
  await store.setTransport({
    kind: kind.value,
    url: url.value.trim() || undefined,
    room: room.value.trim() || 'default',
    hostKey: hostKey.value.trim() || undefined,
    // Dieser Rechner bedient die Tafel und hält damit den Zustand.
    isHost: true,
  })
  busy.value = false
}

/** Klartext statt „idle" – und der Hinweis, wenn ein anderes Fenster zuständig ist. */
const statusText = computed(() => {
  const wo = store.relayLeader.value ? '' : ' – über ein anderes Fenster dieses Browsers'
  switch (status.value) {
    case 'connected':
      return 'verbunden' + wo
    case 'connecting':
      return 'verbinde …'
    case 'reconnecting':
      return 'unterbrochen, versuche erneut' + wo
    case 'error':
      return 'Fehler'
    default:
      return store.relayLeader.value
        ? 'noch nicht verbunden'
        : 'ein anderes Fenster hält die Verbindung'
  }
})

/** Eingetragen, aber so, dass der Browser nur „connection failed“ melden würde. */
const adresseFragwuerdig = computed(() => {
  const adresse = url.value.trim()
  if (!adresse) return false
  const schema = kind.value === 'cloud' ? 'wss://' : 'ws://'
  return !adresse.startsWith(schema) || !adresse.endsWith('/ws')
})

const placeholder = computed(() =>
  kind.value === 'cloud' ? 'wss://tafel-relais.example.workers.dev/ws' : 'ws://192.168.1.20:8080/ws',
)
</script>

<template>
  <section class="card stack">
    <h2>Verbindung</h2>

    <div class="row">
      <label
        v-for="option in (['local', 'lan', 'ntfy', 'cloud'] as TransportKind[])"
        :key="option"
        class="row-tight option"
      >
        <input v-model="kind" type="radio" :value="option" />
        {{ KIND_LABEL[option] }}
      </label>
    </div>

    <p class="hint">
      <template v-if="kind === 'local'">
        Basis-Version: zwei Fenster auf diesem Rechner, keine Installation, alles offline.
      </template>
      <template v-else-if="kind === 'lan'">
        <template v-if="bekannteAdressen.length">
          Diese Seite kommt vom Mini-Programm – die Adressen stehen schon bereit. Zu wählen ist die,
          über die auch die Handys den Rechner erreichen (dasselbe WLAN oder derselbe Hotspot).
        </template>
        <template v-else>
          Das Mini-Programm aus dem Ordner <span class="mono">server/</span> starten (eine Datei,
          kein Installer, keine Adminrechte). Es zeigt beim Start die Adresse an, die hier
          einzutragen ist.
        </template>
      </template>
      <template v-else-if="kind === 'ntfy'">
        Kein eigener Server: Die Geräte treffen sich über einen öffentlichen ntfy-Server. Alles geht
        verschlüsselt hinaus, die Handys glauben nur, was dieser Rechner signiert hat. Setzt
        Internet am Wettkampfort voraus – Aufbau siehe README, Abschnitt „ntfy".
      </template>
      <template v-else>
        Setzt verlässliches Internet am Wettkampfort voraus. Welcher Anbieter dahintersteht,
        entscheidet allein die Adresse – Aufbau siehe <span class="mono">cloud/</span> (AWS) oder
        <span class="mono">cloudflare/</span>.
      </template>
    </p>

    <template v-if="kind === 'ntfy'">
      <label class="field">
        ntfy-Server
        <input v-model="ntfyServer" :placeholder="DEFAULT_NTFY_SERVER" autocomplete="off" />
      </label>
      <p v-if="!ntfyServerValid" class="hint warn">
        Eine Adresse wie <span class="mono">https://ntfy.adminforge.de</span>.
      </p>
      <p v-else-if="ntfyShWarning" class="hint warn">
        ntfy.sh nimmt ohne Konto nur 250 Nachrichten am Tag und IP an – zu wenig für einen
        Wettkampftag. ntfy.adminforge.de erlaubt 17 280.
      </p>

      <div v-if="currentNtfyRoom" class="row small">
        <span class="dim">Raum <span class="mono">{{ currentNtfyRoom }}</span></span>
        <button v-if="!confirmNewRoom" @click="confirmNewRoom = true">Neuen Raum anlegen</button>
        <template v-else>
          <span class="warn">Alle Geräte müssen danach neu angemeldet werden.</span>
          <button class="danger" :disabled="busy || !ntfyServerValid" @click="applyNtfy(true)">
            Ja, neuer Raum
          </button>
          <button @click="confirmNewRoom = false">Abbrechen</button>
        </template>
      </div>
      <p v-else class="hint">
        Mit „Übernehmen“ legt dieser Rechner einen Raum an: ein zufälliges Thema und die
        Schlüssel. Die Handys bekommen beides über den QR-Code unter „Gerät freischalten“.
      </p>
    </template>

    <template v-if="needsUrl">
      <label v-if="zeigeAuswahl" class="field">
        Adresse des Relais
        <select v-model="url">
          <option v-for="adresse in bekannteAdressen" :key="adresse" :value="adresse">
            {{ kurz(adresse) }}<template v-if="adresse === eigeneAdresse"> – diese Seite</template>
          </option>
        </select>
      </label>
      <label v-else class="field">
        Adresse des Relais
        <input v-model="url" :placeholder="placeholder" autocomplete="off" />
      </label>
      <p v-if="!zeigeAuswahl" class="hint" :class="{ warn: adresseFragwuerdig }">
        <template v-if="kind === 'cloud'">
          Beginnt mit <span class="mono">wss://</span> (nicht <span class="mono">https://</span>)
          und endet auf <span class="mono">/ws</span>, z. B.
          <span class="mono">wss://tafel-relais.&lt;konto&gt;.workers.dev/ws</span>.
        </template>
        <template v-else>
          Beginnt mit <span class="mono">ws://</span> und endet auf <span class="mono">/ws</span>,
          z. B. <span class="mono">ws://192.168.1.20:8080/ws</span>.
        </template>
      </p>

      <div class="row small">
        <button v-if="zeigeAuswahl" @click="freieEingabe = true">Adresse von Hand eingeben</button>
        <button v-else-if="bekannteAdressen.length" @click="freieEingabe = false">
          Aus den gemeldeten Adressen wählen
        </button>
        <span v-if="zeigeAuswahl" class="dim">
          Gemeldet vom Mini-Programm auf diesem Rechner.
        </span>
      </div>

      <div class="row">
        <label class="field" style="flex: 1; min-width: 10rem">
          Raum (trennt parallele Veranstaltungen)
          <input v-model="room" autocomplete="off" />
        </label>
        <label class="field" style="flex: 1; min-width: 10rem">
          Host-Schlüssel
          <input v-model="hostKey" autocomplete="off" placeholder="wie beim Start des Programms" />
        </label>
      </div>
      <p v-if="kind === 'lan'" class="hint">
        Den Host-Schlüssel zeigt das Mini-Programm beim Start an. Er wird bewusst nicht mit
        ausgeliefert – sonst könnte ihn jeder im Netz abfragen.
      </p>
    </template>

    <div class="row">
      <button class="primary" :disabled="!canApply" @click="apply">Übernehmen</button>
      <span class="row-tight small dim">
        <span class="status-dot" :class="status"></span>
        {{ statusText }}
      </span>
      <span v-if="errorText" class="small error">{{ errorText }}</span>
    </div>

    <p v-if="kind !== 'local' && !store.relayLeader.value" class="hint">
      Zum Relais verbindet immer nur <strong>ein</strong> Fenster dieses Browsers – das Relais kennt
      je Raum genau einen Host, ein zweites würde das erste hinauswerfen. Alle Fenster hier teilen
      sich denselben Stand, die Handys erreichen die Tafel also trotzdem. Wird das führende Fenster
      geschlossen, übernimmt dieses hier von selbst.
    </p>

    <p class="hint">
      Stand dieser Oberfläche: <strong>{{ buildLabel() }}</strong>.
      <template v-if="bekannteAdressen.length">
        Sie wird vom Mini-Programm ausgeliefert und steckt in dessen Datei – nach einer Änderung an
        der Anwendung muss das Programm neu gebaut werden (<span class="mono">make</span> im Ordner
        <span class="mono">server/</span>), sonst bleibt hier die alte Fassung.
      </template>
    </p>
  </section>
</template>

<style scoped>
.option {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.25rem 0.6rem;
}
</style>
