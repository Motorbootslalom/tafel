import {
  computed,
  inject,
  reactive,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue'
import type { AppState, ClassId, DeviceGrant, Role, Starter } from '../types'
import { deviceId as ownDeviceId, windowId } from '../lib/ids'
import { electLeader, type Leadership } from '../lib/leader'
import { decideHello } from './pairingDecision'
import { loadState, saveState } from '../lib/storage'
import { classStats } from '../lib/timing'
import {
  emptyPairing,
  issueDeviceCode,
  revokeDeviceCode,
  rotateQrToken,
  type PairIntent,
  type PairingState,
} from '../lib/pairing'
import {
  LocalTransport,
  createTransport,
  loadTransportConfig,
  saveTransportConfig,
  type Envelope,
  type ConnectionStatus,
  type Transport,
  type TransportConfig,
} from '../transport'
import { isForMe } from '../transport/protocol'
import type { Action } from './actions'
import { canPerform, grantFor } from './permissions'
import { initialState, klasseLookup, migrate, reduce } from './reducer'

/**
 * Der Store hält den Zustand und entscheidet, wer ihn ändern darf.
 *
 * Zwei Betriebsarten:
 *
 * - **Host** (der Rechner an der Tafel): führt den Reducer aus, schreibt in den
 *   localStorage und verteilt das Ergebnis. Nur hier wird geprüft, ob ein
 *   anfragendes Gerät die Rechte hat.
 * - **Client** (Handy am Steg, zweites Fenster über ein Relais): schickt Actions
 *   an den Host und übernimmt den Zustand, den er zurückbekommt.
 *
 * In der Basis-Version (Transport `local`) ist jedes Fenster Host: alle teilen
 * denselben localStorage, und weitergegeben wird die **Action**, nicht der
 * Zustand. So bleiben zwei gleichzeitig bediente Parcours widerspruchsfrei.
 */
export interface Store {
  readonly state: AppState
  readonly deviceId: string
  /** Rolle dieses Geräts – lokal immer `admin`, remote das, was der Host erlaubt. */
  readonly role: Ref<Role>
  readonly grant: Ref<DeviceGrant | null>
  /** Die nach außen sichtbare Verbindung – Relais, sonst der lokale Kanal. */
  readonly transport: Ref<Transport | null>
  readonly transportConfig: TransportConfig
  readonly pairing: PairingState
  /** Anmeldeversuche, die auf eine Entscheidung des Admins warten. */
  readonly pendingRequest: Ref<{ deviceId: string; name: string } | null>
  readonly isHost: ComputedRef<boolean>
  readonly connected: ComputedRef<boolean>
  /** Verbindungszustand für die Anzeige – auch in Fenstern ohne eigene Verbindung. */
  readonly connectionStatus: ComputedRef<ConnectionStatus>
  /** Hält dieses Fenster die Verbindung zum Relais? */
  readonly relayLeader: Ref<boolean>

  dispatch(action: Action): void
  /** Darf dieses Gerät die Action ausführen? Steuert die Oberfläche. */
  may(action: Action): boolean
  mayOperate(parcoursId: string): boolean

  starterById(id: string): Starter | undefined
  klasseOf(starterId: string): ClassId | null
  /**
   * Ein per „Tafel öffnen" gestartetes Fenster als Gegenstelle anmelden. Unter
   * `file://` ist die Fenster-Referenz der einzige tragfähige Weg zwischen den
   * Fenstern.
   */
  registerPeerWindow(win: Window): void

  // Pro-Version
  setTransport(config: TransportConfig): Promise<void>
  openPairing(intent: PairIntent): void
  rotatePairingToken(): void
  closePairing(): void
  requestAccess(token: string, name: string): void
  answerPending(approve: boolean): void
}

export const storeKey: InjectionKey<Store> = Symbol('tafel-store')

export function useStore(): Store {
  const store = inject(storeKey)
  if (!store) throw new Error('Store nicht bereitgestellt')
  return store
}

const OWN_ADMIN_GRANT = (id: string): DeviceGrant => ({
  deviceId: id,
  name: 'Dieser Rechner',
  role: 'admin',
  parcoursIds: [],
  lastSeen: Date.now(),
})

export function createStore(): Store {
  const me = ownDeviceId()
  const loaded = loadState()
  const state = reactive<AppState>(loaded ? migrate(loaded) : initialState()) as AppState

  const transportConfig = reactive<TransportConfig>(loadTransportConfig())
  const pairing = reactive<PairingState>(emptyPairing())
  const pendingRequest = ref<{ deviceId: string; name: string } | null>(null)

  const grant = ref<DeviceGrant | null>(OWN_ADMIN_GRANT(me))
  const role = computed<Role>(() => grant.value?.role ?? 'viewer')

  /**
   * Der Kanal zwischen den Fenstern **dieses Browsers** – Tafel, Verwaltung und
   * Steg auf demselben Rechner. Er läuft immer, unabhängig von der Betriebsart:
   * Diese Fenster teilen sich denselben Speicher und damit denselben Zustand.
   */
  const localBus = new LocalTransport(windowId())

  /**
   * Die Verbindung zum Relais – nur in der Pro-Version und nur in **einem**
   * Fenster (siehe `lib/leader.ts`). Das Relais kennt je Raum genau einen Host;
   * zwei verbundene Fenster würden sich gegenseitig hinauswerfen.
   */
  const relay = shallowRef<Transport | null>(null)
  let leadership: Leadership | null = null

  /** Hält dieses Fenster die Relais-Verbindung? */
  const relayLeader = ref(false)
  /**
   * Verbindungszustand, den das führende Fenster gemeldet hat. Nur so kann ein
   * Fenster ohne eigene Verbindung überhaupt etwas Wahres anzeigen.
   */
  const foreignStatus = ref<ConnectionStatus>('idle')

  /** Hält dieser Rechner die Wahrheit? Ein angemeldetes Handy tut das nicht. */
  const isHost = computed(() => transportConfig.kind === 'local' || transportConfig.isHost)
  /**
   * Der Verbindungszustand, wie ihn die Oberfläche zeigen soll.
   *
   * Im Pro-Betrieb hält nur ein Fenster die Verbindung. Die übrigen hätten
   * sonst nichts zu melden und stünden auf „nicht verbunden“, obwohl die Handys
   * längst erreichbar sind. Sie zeigen deshalb, was das führende Fenster meldet.
   */
  const connectionStatus = computed<ConnectionStatus>(() => {
    if (transportConfig.kind === 'local') return localBus.status.value
    if (relayLeader.value) return relay.value?.status.value ?? 'idle'
    return foreignStatus.value
  })

  const connected = computed(() => connectionStatus.value === 'connected')

  let unsubscribeRelay: (() => void) | null = null

  function replaceState(next: AppState): void {
    Object.assign(state, next)
  }

  function applyLocally(action: Action): void {
    replaceState(reduce(state as AppState, action))
    saveState(state as AppState)
  }

  const snapshot = () => JSON.parse(JSON.stringify(state)) as AppState

  /**
   * Eine angewandte Änderung weitergeben.
   *
   * An die **Fenster dieses Browsers** geht die Action selbst – so vollziehen
   * sie dieselbe Änderung nach, und zwei parallel bediente Parcours geraten sich
   * nicht ins Gehege. An **entfernte Geräte** geht der Gesamtzustand; sie sollen
   * gar nicht erst eigene Schlüsse ziehen müssen.
   */
  /**
   * Was eine angewandte Änderung nach **außen** bedeutet.
   *
   * Läuft nur im Fenster mit der Relais-Verbindung – gleich, in welchem Fenster
   * die Änderung ausgelöst wurde. Genau das war vorher falsch: Der Entzug wurde
   * nur von dem Fenster verschickt, in dem geklickt wurde, und das hält in aller
   * Regel gar keine Verbindung.
   */
  function relayEffects(action: Action): void {
    const r = relay.value
    if (!r || !isHost.value) return

    r.send({ kind: 'state', state: snapshot() })

    // Rechte entzogen: Das Gerät bekommt eine Begründung und wird getrennt. Das
    // Relais schließt die Verbindung, sobald die Nachricht draußen ist.
    if (action.type === 'REMOVE_DEVICE') r.send({ kind: 'revoked' }, action.deviceId)
  }

  function publish(action: Action): void {
    localBus.send({ kind: 'action', action })
    relayEffects(action)
  }

  function dispatch(action: Action): void {
    if (isHost.value) {
      if (!canPerform(action, grant.value)) return
      applyLocally(action)
      publish(action)
      return
    }
    // Client: der Host entscheidet.
    relay.value?.send({ kind: 'action', action })
  }

  function may(action: Action): boolean {
    return canPerform(action, grant.value)
  }

  function mayOperate(parcoursId: string): boolean {
    const g = grant.value
    if (!g) return false
    if (g.role === 'admin') return true
    return g.role === 'steg' && g.parcoursIds.includes(parcoursId)
  }

  // -------------------------------------------------------------------------
  // Eingehende Nachrichten
  // -------------------------------------------------------------------------

  /**
   * Nachrichten aus einem anderen Fenster **desselben Browsers**.
   *
   * Hier wird nichts geprüft: Es ist derselbe Rechner, derselbe Speicher,
   * derselbe Benutzer. Die Fenster ziehen die Änderung einfach nach.
   */
  function handleLocal(env: Envelope): void {
    const msg = env.msg
    if (msg.kind === 'action') {
      replaceState(reduce(state as AppState, msg.action))
      saveState(state as AppState)
      // Nur eines der Fenster hält die Verbindung zum Relais. Kommt die Änderung
      // aus einem anderen, muss dieses Fenster sie nach außen weitergeben –
      // sonst erführen die Handys am Steg nie davon.
      relayEffects(msg.action)
    } else if (msg.kind === 'state') {
      // Ein Fenster hat einen Zustand vom Relais bekommen und reicht ihn weiter.
      replaceState(migrate(msg.state))
      saveState(state as AppState)
    } else if (msg.kind === 'pairing') {
      // Ein anderes Fenster hat einen Anmelde-Code ausgegeben oder zurückgezogen.
      Object.assign(pairing, msg.pairing)
    } else if (msg.kind === 'relay-status') {
      if (!relayLeader.value) foreignStatus.value = msg.status
    }
  }

  /** Nachrichten vom Relais – von entfernten Geräten. */
  function handle(env: Envelope): void {
    if (!isForMe(env, me)) return
    const msg = env.msg

    switch (msg.kind) {
      case 'action': {
        if (!isHost.value) return
        const senderGrant = state.devices.find((d) => d.deviceId === env.from) ?? null
        if (!canPerform(msg.action, senderGrant)) return
        applyLocally(msg.action)
        // Die anderen Fenster dieses Browsers ziehen mit, die entfernten Geräte
        // bekommen den neuen Gesamtzustand.
        publish(msg.action)
        return
      }

      case 'state': {
        if (isHost.value) return
        replaceState(migrate(msg.state))
        saveState(state as AppState)

        // Die eigenen Rechte aus dem Zustand nachziehen: Ändert der Admin sie in
        // der Geräteverwaltung, wirkt das damit sofort – und ein Entzug führt
        // hier zu `null`, wodurch die Bedienung sperrt.
        grant.value = grantFor(state.devices, me)

        // Auch die Schwesterfenster dieses Geräts sollen ihn haben.
        localBus.send({ kind: 'state', state: msg.state })
        return
      }

      case 'request-state':
        if (!isHost.value) return
        relay.value?.send({ kind: 'state', state: snapshot() }, env.from)
        return

      case 'hello': {
        if (!isHost.value) return

        const entscheidung = decideHello({
          pairing,
          devices: state.devices,
          deviceId: env.from,
          name: msg.name,
          token: msg.token,
          now: Date.now(),
        })

        if (entscheidung.kind === 'denied') {
          relay.value?.send({ kind: 'denied', reason: entscheidung.reason }, env.from)
          return
        }

        applyLocally({ type: 'UPSERT_DEVICE', grant: entscheidung.grant })
        // Die anderen Fenster dieses Rechners sollen das Gerät auch kennen.
        localBus.send({ kind: 'action', action: { type: 'UPSERT_DEVICE', grant: entscheidung.grant } })

        relay.value?.send({ kind: 'welcome', grant: entscheidung.grant }, env.from)
        relay.value?.send({ kind: 'state', state: snapshot() }, env.from)
        return
      }

      case 'welcome':
        grant.value = msg.grant
        pendingRequest.value = null
        return

      case 'denied':
        grant.value = null
        pendingRequest.value = null
        if (relay.value) relay.value.error.value = msg.reason
        // Ohne gültige Anmeldung nicht endlos weiterversuchen.
        forgetIdentity()
        return

      case 'revoked': {
        // Der Admin hat die Rechte entzogen. Die Verbindung schließt das Relais
        // gleich selbst; die gespeicherte Anmeldung wird hier verworfen, damit
        // sich das Gerät nicht stillschweigend wieder anmeldet. Es braucht einen
        // neuen Code.
        grant.value = null
        forgetIdentity()
        const t = relay.value
        stopRelay()
        if (t) t.error.value = 'Die Berechtigung wurde entzogen.'
        return
      }

      case 'ping':
        return
    }
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  /** Verbindung zum Relais schließen (bleibt für andere Fenster bestehen). */
  function stopRelay(): void {
    unsubscribeRelay?.()
    unsubscribeRelay = null
    relay.value?.stop()
    relay.value = null
  }

  /** Verbindung zum Relais öffnen – nur im führenden Fenster. */
  async function startRelay(): Promise<void> {
    if (relay.value || transportConfig.kind === 'local') return

    const t = createTransport(me, { ...transportConfig })
    relay.value = t
    unsubscribeRelay = t.onMessage(handle)
    await t.start()
    if (!transportConfig.isHost) sayHelloIfClient()
  }

  /**
   * Der Anführer sagt regelmäßig, wie es um die Verbindung steht – sonst wüssten
   * die anderen Fenster nichts davon und meldeten fälschlich „nicht verbunden".
   */
  function shareRelayStatus(): void {
    if (!relayLeader.value) return
    localBus.send({ kind: 'relay-status', status: relay.value?.status.value ?? 'idle' })
  }

  watch(() => relay.value?.status.value, shareRelayStatus)
  setInterval(shareRelayStatus, 5000)

  /** Beendet die Beobachtung der Führungswahl aus einem früheren Aufruf. */
  let unwatchLeadership: (() => void) | null = null

  async function setTransport(config: TransportConfig): Promise<void> {
    unwatchLeadership?.()
    unwatchLeadership = null
    stopRelay()
    leadership?.stop()
    leadership = null

    Object.assign(transportConfig, config)
    saveTransportConfig({ ...config })

    grant.value = config.kind === 'local' || config.isHost ? OWN_ADMIN_GRANT(me) : null

    if (config.kind === 'local') {
      relayLeader.value = false
      foreignStatus.value = 'idle'
      return
    }

    if (!config.isHost) {
      relayLeader.value = true
      // Ein Bediengerät ist immer für sich – es verbindet direkt. Eine
      // Führungswahl wäre hier sogar schädlich: Steht auf dem Gerät noch ein
      // zweites Fenster der Anwendung offen, bekäme dieses die Führung, und das
      // Fenster, in dem gerade jemand auf „Verbinden" tippt, käme nie an die
      // Reihe.
      await startRelay()
      return
    }

    // Der Bedienrechner hat mehrere Fenster offen, das Relais kennt aber nur
    // einen Host. Deshalb verbindet nur eines von ihnen.
    leadership = electLeader(windowId())
    unwatchLeadership = watch(
      leadership.isLeader,
      (fuehrend) => {
        relayLeader.value = fuehrend
        if (fuehrend) {
          void startRelay().then(shareRelayStatus)
        } else {
          stopRelay()
        }
      },
      { immediate: true },
    )
  }

  /**
   * Bricht die Verbindung ab und kommt zurück, meldet sich der Client von
   * selbst wieder an – am Steg soll niemand ein Menü suchen müssen.
   */
  watch(
    () => relay.value?.status.value,
    (status, previous) => {
      if (status === 'connected' && previous && previous !== 'connected') sayHelloIfClient()
    },
  )

  // -------------------------------------------------------------------------
  // Pairing (nur beim Host relevant)
  // -------------------------------------------------------------------------

  let currentIntent: PairIntent | null = null

  /**
   * Die ausgegebenen Codes an die anderen Fenster weitergeben. Prüfen muss sie
   * das Fenster, das gerade die Verbindung zum Relais hält – und das ist nicht
   * zwingend dasselbe, in dem der Code ausgegeben wurde.
   */
  function sharePairing(): void {
    localBus.send({ kind: 'pairing', pairing: JSON.parse(JSON.stringify(pairing)) as PairingState })
  }

  function openPairing(intent: PairIntent): void {
    currentIntent = intent
    const now = Date.now()
    Object.assign(pairing, rotateQrToken(issueDeviceCode(pairing, intent, now), intent, now))
    sharePairing()
  }

  function rotatePairingToken(): void {
    if (!currentIntent) return
    Object.assign(pairing, rotateQrToken(pairing, currentIntent, Date.now()))
    sharePairing()
  }

  function closePairing(): void {
    currentIntent = null
    Object.assign(pairing, revokeDeviceCode({ ...pairing, qrToken: null, previousQrToken: null }))
    sharePairing()
  }

  /**
   * Wer wir sind und womit wir uns angemeldet haben – gespeichert, damit nach
   * einem Verbindungsabbruch automatisch neu angemeldet werden kann.
   */
  const IDENTITY_KEY = 'tafel:client-identity'

  function loadIdentity(): { name: string; token: string } | null {
    try {
      const raw = localStorage.getItem(IDENTITY_KEY)
      return raw ? (JSON.parse(raw) as { name: string; token: string }) : null
    } catch {
      return null
    }
  }

  /** Gespeicherte Anmeldung verwerfen – nach Entzug oder Ablehnung. */
  function forgetIdentity(): void {
    try {
      localStorage.removeItem(IDENTITY_KEY)
    } catch {
      // Ohne Speicher gibt es ohnehin nichts zu vergessen.
    }
  }

  function requestAccess(token: string, name: string): void {
    pendingRequest.value = { deviceId: me, name }
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name, token }))
    } catch {
      // Ohne Speicher muss nach einem Reload neu angemeldet werden.
    }
    relay.value?.send({ kind: 'hello', role: 'steg', name, token })
  }

  /**
   * Nach jedem (Wieder-)Verbinden als Client erneut anmelden. Der Token ist
   * dann meist längst abgelaufen – der Host erkennt das Gerät aber an seiner ID
   * wieder und gibt die bestehenden Rechte zurück.
   */
  function sayHelloIfClient(): void {
    if (isHost.value) return
    const identity = loadIdentity()
    if (!identity) return
    relay.value?.send({ kind: 'hello', role: 'steg', ...identity })
  }

  function answerPending(approve: boolean): void {
    const req = pendingRequest.value
    if (!req) return
    if (!approve) relay.value?.send({ kind: 'denied', reason: 'Abgelehnt' }, req.deviceId)
    pendingRequest.value = null
  }

  // -------------------------------------------------------------------------

  const startersById = computed(() => new Map(state.starters.map((s) => [s.id, s])))

  /** Für die Statusanzeige: im Pro-Betrieb das Relais, sonst der lokale Kanal. */
  const visibleTransport = computed<Transport | null>(() =>
    transportConfig.kind === 'local' ? localBus : relay.value,
  )

  const store: Store = {
    state: state as AppState,
    deviceId: me,
    role,
    grant,
    transport: visibleTransport,
    transportConfig,
    pairing,
    pendingRequest,
    isHost,
    connected,
    connectionStatus,
    relayLeader,
    dispatch,
    may,
    mayOperate,
    starterById: (id) => startersById.value.get(id),
    klasseOf: (id) => startersById.value.get(id)?.klasse ?? null,
    registerPeerWindow: (win) => localBus.addPeerWindow(win),
    setTransport,
    openPairing,
    rotatePairingToken,
    closePairing,
    requestAccess,
    answerPending,
  }

  // Der Kanal zwischen den Fenstern läuft in jeder Betriebsart.
  localBus.onMessage(handleLocal)
  void localBus.start()

  // Danach die eingestellte Betriebsart herstellen.
  void setTransport({ ...transportConfig })

  return store
}

/** Gemessene Startabstände je Klasse über alle Parcours. */
export function measuredStats(state: AppState) {
  return classStats(state.runtimes, klasseLookup(state.starters))
}
