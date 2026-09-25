import { useStore } from './store'

/**
 * Ereignisse für ein Feld, dessen Wert die Tafel schon beim Tippen zeigen soll.
 *
 * Am Bedienrechner geht jeder Tastendruck sofort raus – steht die Tafel auf
 * einem zweiten Monitor und schaut man nach dem Tippen nur hinüber, soll sie
 * schon stimmen. Ein verbundenes Gerät schickt dagegen jede Änderung über das
 * Relais zum Host und bekommt den Zustand zurück. Käme das bei jedem
 * Tastendruck, überschriebe der zurückkehrende Zustand, was inzwischen
 * weitergetippt wurde. Dort geht der Wert deshalb erst mit Enter oder beim
 * Verlassen des Feldes raus (`change`).
 *
 * Gedacht für `v-on="useLiveInput(...)"`.
 */
export function useLiveInput(commit: (value: string) => void): {
  input: (event: Event) => void
  change: (event: Event) => void
} {
  const store = useStore()
  const value = (event: Event) => (event.target as HTMLInputElement).value
  return {
    input: (event) => {
      if (store.isHost.value) commit(value(event))
    },
    change: (event) => {
      if (!store.isHost.value) commit(value(event))
    },
  }
}
