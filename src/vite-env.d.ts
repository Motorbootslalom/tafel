/// <reference types="vite/client" />

/** Zeitpunkt des Builds – wird von Vite eingesetzt (siehe vite.config.ts). */
declare const __BUILD_TIME__: string
/** Kurze ID und Zeitpunkt des letzten Commits – ebenfalls aus vite.config.ts. */
declare const __BUILD_COMMIT__: string
declare const __BUILD_COMMIT_TIME__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
