/**
 * happy-dom bringt weder `localStorage` noch `sessionStorage` mit. Weil die
 * Anwendung ihren Zustand im einen und die Fenster-Kennung im anderen ablegt,
 * wird hier eine schlichte Fassung nachgereicht – nur so lassen sich Persistenz
 * und der Fenster-zu-Fenster-Kanal überhaupt prüfen.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length(): number {
    return this.data.size
  }

  clear(): void {
    this.data.clear()
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }
}

function install(name: 'localStorage' | 'sessionStorage'): void {
  if (typeof (globalThis as Record<string, unknown>)[name] !== 'undefined') return
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, name, { value: storage, configurable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { value: storage, configurable: true })
  }
}

install('localStorage')
install('sessionStorage')
