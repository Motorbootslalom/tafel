import { onScopeDispose, ref, type Ref } from 'vue'

/**
 * Welches Fenster hält die Verbindung zum Relais?
 *
 * Auf dem Bedienrechner sind mehrere Fenster offen – Tafel, Verwaltung, Steg.
 * Sie teilen sich denselben Browser-Speicher und tauschen sich direkt
 * miteinander aus. Zum **Relais** darf aber nur **eines** von ihnen verbinden:
 * Das Relais kennt je Raum genau einen Host, und ein zweites Fenster würde das
 * erste hinauswerfen – woraufhin dieses neu verbindet und das zweite hinauswirft.
 *
 * Deshalb eine schlichte Führung über den localStorage: Wer den Eintrag hält und
 * regelmäßig auffrischt, ist zuständig. Bleibt die Auffrischung aus (Fenster
 * geschlossen, Rechner im Ruhezustand), übernimmt ein anderes Fenster.
 */

const LEADER_KEY = 'tafel:relay-leader'
/** So oft bestätigt der Anführer, dass er noch da ist. */
export const HEARTBEAT_MS = 2000
/** Danach gilt ein Eintrag als verwaist. Großzügig gegen kurze Aussetzer. */
export const STALE_MS = 6000

export interface LeaderEntry {
  id: string
  ts: number
}

/**
 * Darf ich die Führung übernehmen? Ja, wenn niemand sie hält, sie ohnehin mir
 * gehört, oder der Eintrag veraltet ist.
 */
export function shouldClaim(
  entry: LeaderEntry | null,
  myId: string,
  now: number,
  staleMs = STALE_MS,
): boolean {
  if (!entry) return true
  if (entry.id === myId) return true
  return now - entry.ts > staleMs
}

export function readEntry(): LeaderEntry | null {
  try {
    const raw = localStorage.getItem(LEADER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LeaderEntry
    if (typeof parsed?.id !== 'string' || typeof parsed?.ts !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeEntry(entry: LeaderEntry): void {
  try {
    localStorage.setItem(LEADER_KEY, JSON.stringify(entry))
  } catch {
    // Ohne Speicher gibt es keine Führung – dann verbindet jedes Fenster selbst.
  }
}

function clearEntry(myId: string): void {
  try {
    if (readEntry()?.id === myId) localStorage.removeItem(LEADER_KEY)
  } catch {
    // ignorieren
  }
}

export interface Leadership {
  /** true, solange dieses Fenster die Verbindung zum Relais halten soll. */
  readonly isLeader: Ref<boolean>
  stop(): void
}

/**
 * Startet die Führungswahl. Läuft, bis {@link Leadership.stop} gerufen wird oder
 * der umgebende Vue-Bereich endet.
 */
export function electLeader(myId: string): Leadership {
  const isLeader = ref(false)

  const tick = () => {
    const now = Date.now()
    if (shouldClaim(readEntry(), myId, now)) {
      writeEntry({ id: myId, ts: now })
      isLeader.value = true
    } else {
      isLeader.value = false
    }
  }

  tick()
  const timer = setInterval(tick, HEARTBEAT_MS)

  // Beim Schließen die Führung freigeben, damit das nächste Fenster sofort
  // übernimmt statt erst auf den Ablauf zu warten.
  const release = () => clearEntry(myId)
  window.addEventListener('pagehide', release)

  const stop = () => {
    clearInterval(timer)
    window.removeEventListener('pagehide', release)
    release()
    isLeader.value = false
  }

  if (typeof onScopeDispose === 'function') {
    try {
      onScopeDispose(stop)
    } catch {
      // Außerhalb eines Vue-Bereichs aufgerufen – dann räumt `stop` von Hand auf.
    }
  }

  return { isLeader, stop }
}
