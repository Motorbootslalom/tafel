import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Zwei Build-Ziele:
 *
 * - Standard (`npm run build`) → `dist/`, relative Basis, läuft auf GitHub Pages
 *   und lokal via `npm run preview`.
 * - `--mode single` (`npm run build:single`) → `dist-single/tafel.html`: eine
 *   einzige HTML-Datei mit inline-JS/CSS/Assets. Die lässt sich per Doppelklick
 *   direkt aus dem Dateisystem öffnen (file://) – ohne Webserver, ohne
 *   Installation, ohne Adminrechte.
 */
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    base: './',
    /**
     * Zeitpunkt des Builds, in der Oberfläche sichtbar.
     *
     * Das Mini-Programm trägt die Anwendung **im Binary** – wer nur `npm run
     * build` ausführt, sieht die Änderung dort nicht. Mit diesem Stempel lässt
     * sich in Sekunden feststellen, ob wirklich die neue Fassung läuft.
     */
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [vue(), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    build: single
      ? {
          outDir: 'dist-single',
          // Alles inlinen: keine separaten Asset-Dateien neben der HTML.
          assetsInlineLimit: 100 * 1024 * 1024,
          cssCodeSplit: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : { outDir: 'dist' },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
      setupFiles: ['src/test-setup.ts'],
    },
  }
})
