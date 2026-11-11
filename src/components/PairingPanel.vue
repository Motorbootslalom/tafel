<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useStore } from '../state/store'
import {
  formatCode,
  permanentCodeAllowed,
  remainingSeconds,
  QR_TOKEN_TTL_MS,
} from '../lib/pairing'
import { qrSvg } from '../lib/qr'
import { shareableViewUrl, viewUrl } from '../lib/router'
import { ASSIGNABLE_ROLES, ROLE_HINT, ROLE_LABEL } from '../state/permissions'
import type { Role } from '../types'

/**
 * Geräte freischalten (Pro-Version).
 *
 * Der Admin legt vorher fest, **welche Rechte** der Code mitbringt – etwa „Steg,
 * nur Parcours See". Das Gerät kann daran nichts ändern; es kennt nur den Code.
 *
 * Der QR-Code wechselt alle 30 Sekunden, damit ein abfotografierter Bildschirm
 * niemandem dauerhaft Zugang verschafft. Der Geräte-Code gilt 5 Minuten und für
 * ein Gerät; er ist zum Vorlesen übers Funkgerät gedacht.
 *
 * Für reine Anzeigen (Zuschauer, Tafel) gibt es per Häkchen einen **Dauercode**:
 * mehrfach nutzbar, ohne Ablauf, mit festem QR-Code zum Aushängen. Er läuft
 * neben den Einmal-Codes her und endet erst mit „Dauercode beenden“.
 */
const store = useStore()

const role = ref<Role>('steg')
const parcoursIds = ref<string[]>([])
/** Häkchen „Dauercode“ – zählt nur bei Rollen, die nichts bedienen. */
const permanentWanted = ref(false)
const permanent = computed(() => permanentWanted.value && permanentCodeAllowed(role.value))
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

const open = computed(() => !!store.pairing.deviceCode || !!store.pairing.qrToken)
const remoteReady = computed(() => store.transportConfig.kind !== 'local')

const codeSeconds = computed(() => remainingSeconds(store.pairing.deviceCode, now.value))
const codeUsed = computed(() => !!store.pairing.deviceCode?.usedAt)
/** Ein verbrauchter oder abgelaufener Code bleibt sichtbar, aber durchgestrichen – damit ihn niemand mehr vorliest. */
const codeDead = computed(() => codeUsed.value || !codeSeconds.value)
const qrSeconds = computed(() => remainingSeconds(store.pairing.qrToken, now.value))

/**
 * Wie ein Handy den Raum findet. Bei ntfy gehören die öffentlichen Schlüssel des
 * Hosts dazu – sie sind der Grund, warum ein Handy einer signierten Tafel
 * glauben kann. Übers Internet zeigt der Link auf die öffentliche Fassung, falls
 * dieser Rechner mit der heruntergeladenen Datei läuft.
 */
const roomParams = computed<Record<string, string>>(() => {
  const config = store.transportConfig
  const params: Record<string, string> = {
    u: config.url ?? '',
    r: config.room ?? 'default',
    k: config.kind,
  }
  if (config.kind === 'ntfy' && config.hostPublic) params.h = config.hostPublic
  return params
})

const linkFor = (params: Record<string, string>) =>
  store.transportConfig.kind === 'lan' ? viewUrl('pair', params) : shareableViewUrl('pair', params)

/** Der QR-Code enthält alles, was das Handy zum Verbinden braucht. */
const qrTarget = computed(() => {
  const token = store.pairing.qrToken?.value
  if (!token) return ''
  return linkFor({ t: token, ...roomParams.value })
})

/**
 * Raum-Link für den Geräte-Code: Sechs Zeichen tragen keinen Schlüssel. Nichts
 * daran ist geheim – er darf per Messenger verschickt werden; freigeschaltet
 * wird erst mit dem Code.
 */
const roomLink = computed(() =>
  store.transportConfig.kind === 'ntfy' && store.transportConfig.hostPublic ? linkFor(roomParams.value) : '',
)

/**
 * Der Dauercode als Link: Raum und Code in einem. Wer ihn öffnet oder den festen
 * QR-Code scannt, ist ohne Tippen angemeldet.
 */
const permanentCode = computed(() => store.pairing.permanentCode)
const permanentLink = computed(() =>
  permanentCode.value ? linkFor({ t: permanentCode.value.value, ...roomParams.value }) : '',
)
const permanentQr = computed(() => (permanentLink.value ? qrSvg(permanentLink.value) : ''))

const copied = ref<'room' | 'permanent' | null>(null)

async function copy(text: string, which: 'room' | 'permanent'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = which
    setTimeout(() => (copied.value = null), 2000)
  } catch {
    // Ohne Zwischenablage (etwa unter file:// in manchen Browsern) bleibt das
    // Feld zum Markieren.
  }
}

const qrMarkup = computed(() => (qrTarget.value ? qrSvg(qrTarget.value) : ''))

const startLabel = computed(() => {
  if (permanent.value) return permanentCode.value ? 'Neuen Dauercode ausgeben' : 'Dauercode ausgeben'
  return open.value ? 'Neuen Code ausgeben' : 'Code ausgeben'
})

function start(): void {
  // Parcours zählen nur am Steg – sonst nähme ein Zuschauer die zuletzt
  // angehakte Auswahl mit.
  const intent = { role: role.value, parcoursIds: role.value === 'steg' ? [...parcoursIds.value] : [] }
  if (permanent.value) store.issuePermanentCode(intent)
  else store.openPairing(intent)
}

function endPermanent(): void {
  store.endPermanentCode()
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

      <label v-if="permanentCodeAllowed(role)" class="row-tight">
        <input v-model="permanentWanted" type="checkbox" />
        Dauercode – mehrfach nutzbar, läuft nicht ab
        <span class="dim small">(etwa für Zuschauer)</span>
      </label>

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
        <button class="primary" @click="start">{{ startLabel }}</button>
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
          <div class="code-display" :class="{ dead: codeDead }">
            {{ store.pairing.deviceCode ? formatCode(store.pairing.deviceCode.value) : '–' }}
          </div>
          <p class="hint" :class="{ warn: codeDead || codeSeconds < 60 }">
            <template v-if="codeUsed">schon benutzt – für das nächste Gerät „Neuen Code ausgeben“</template>
            <template v-else-if="codeSeconds">noch {{ Math.floor(codeSeconds / 60) }}:{{
              String(codeSeconds % 60).padStart(2, '0')
            }} gültig · für ein Gerät</template>
            <template v-else>abgelaufen – „Neuen Code ausgeben“</template>
          </p>
          <div v-if="roomLink" class="stack">
            <p class="hint">
              Für den Geräte-Code braucht das Handy über ntfy einmal den
              <strong>Raum-Link</strong> – sechs Zeichen tragen keinen Schlüssel. Er ist nicht
              geheim und darf per Messenger verschickt werden.
            </p>
            <div class="row-tight">
              <input
                class="mono small"
                style="flex: 1; min-width: 0"
                :value="roomLink"
                readonly
                @focus="($event.target as HTMLInputElement).select()"
              />
              <button @click="copy(roomLink, 'room')">{{ copied === 'room' ? 'Kopiert' : 'Kopieren' }}</button>
            </div>
          </div>
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

      <div v-if="permanentCode" class="pairing-view permanent">
        <div>
          <div class="qr-box" v-html="permanentQr"></div>
          <p class="hint">Fester QR-Code – darf ausgedruckt und ausgehängt werden.</p>
        </div>

        <div class="stack">
          <span class="small dim">Dauercode · {{ ROLE_LABEL[permanentCode.intent.role] }}</span>
          <div class="code-display">{{ formatCode(permanentCode.value) }}</div>
          <p class="hint">
            Mehrfach nutzbar und ohne Ablauf, bis er beendet wird. {{ ROLE_HINT[permanentCode.intent.role] }}
            Bedienen kann damit niemand etwas.
          </p>
          <div class="row-tight">
            <input
              class="mono small"
              style="flex: 1; min-width: 0"
              :value="permanentLink"
              readonly
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button @click="copy(permanentLink, 'permanent')">
              {{ copied === 'permanent' ? 'Kopiert' : 'Kopieren' }}
            </button>
          </div>
          <p class="hint">Der Link enthält Raum und Code – wer ihn öffnet, ist ohne Tippen angemeldet.</p>
          <div class="row">
            <button @click="endPermanent">Dauercode beenden</button>
          </div>
          <p class="hint dim">
            Beenden lässt angemeldete Geräte stehen; einzeln entziehen unter „Verbundene Geräte“.
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

.permanent {
  border-top: 1px solid var(--border);
  margin-top: 0.5rem;
}

.code-display.dead {
  text-decoration: line-through;
  opacity: 0.4;
}

.toggle {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.15rem 0.5rem;
}
</style>
