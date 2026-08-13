<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore } from '../state/store'
import { FIXED_ORDER_LABEL, formatStartersTsv, parseStartersTsv, type ImportResult } from '../lib/tsv'
import { classColor, CLASS_IDS } from '../lib/classes'
import { duplicateStartNumbers } from '../lib/startnumbers'

/**
 * Starterliste aus Excel übernehmen – per Copy & Paste, damit niemand Dateien
 * konvertieren muss. Eine Kopfzeile wird erkannt, sonst gilt die feste
 * Spaltenreihenfolge.
 *
 * Bewusst **ohne** Lauf-Spalte: Läufe entstehen erst beim Erzeugen der
 * Startliste. Nur so kann ein Starter seinen dritten Lauf später an einer ganz
 * anderen Stelle fahren.
 */
const store = useStore()

const text = ref('')
const mode = ref<'replace' | 'append'>('replace')
const preview = ref<ImportResult | null>(null)
const copied = ref(false)

const counts = computed(() => {
  const m = new Map<string, number>()
  for (const s of store.state.starters) m.set(s.klasse, (m.get(s.klasse) ?? 0) + 1)
  return m
})

const duplicates = computed(() => duplicateStartNumbers(store.state.starters))

function analyse(): void {
  preview.value = text.value.trim() ? parseStartersTsv(text.value) : null
}

function apply(): void {
  const result = preview.value ?? (text.value.trim() ? parseStartersTsv(text.value) : null)
  if (!result || result.starters.length === 0) return
  store.dispatch({ type: 'IMPORT_STARTERS', starters: result.starters, mode: mode.value })
  text.value = ''
  preview.value = null
}

async function copyOut(): Promise<void> {
  const tsv = formatStartersTsv(store.state.starters)
  try {
    await navigator.clipboard.writeText(tsv)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Zwischenablage gesperrt (häufig unter file://): Text zum Markieren zeigen.
    text.value = tsv
  }
}
</script>

<template>
  <section class="card">
    <h2>Starterliste</h2>

    <div class="row" style="margin-bottom: 0.75rem">
      <span v-for="klasse in CLASS_IDS" :key="klasse" class="row-tight">
        <span class="badge" :style="{ background: classColor(klasse) }">{{ klasse }}</span>
        <span :class="{ dim: !counts.get(klasse) }">{{ counts.get(klasse) ?? 0 }}</span>
      </span>
      <strong style="margin-left: auto">{{ store.state.starters.length }} Starter</strong>
    </div>

    <p v-if="duplicates.size" class="hint error">
      Doppelte Startnummern innerhalb einer Klasse: {{ [...duplicates].join(', ') }}
    </p>

    <p class="hint">
      Spalten aus Excel markieren, kopieren und hier einfügen. Kopfzeile wird erkannt – sonst gilt:
      {{ FIXED_ORDER_LABEL }}
    </p>

    <textarea
      v-model="text"
      placeholder="Aus Excel eingefügte Zeilen …"
      @input="preview = null"
    ></textarea>

    <div class="row" style="margin-top: 0.5rem">
      <label class="row-tight">
        <input v-model="mode" type="radio" value="replace" /> Alle ersetzen
      </label>
      <label class="row-tight">
        <input v-model="mode" type="radio" value="append" /> Ergänzen
      </label>
      <button :disabled="!text.trim()" @click="analyse">Prüfen</button>
      <button class="primary" :disabled="!text.trim()" @click="apply">Importieren</button>
      <button style="margin-left: auto" @click="copyOut">
        {{ copied ? 'Kopiert' : 'Liste nach Excel kopieren' }}
      </button>
    </div>

    <div v-if="preview" class="preview">
      <p>
        <strong>{{ preview.imported }}</strong> Starter erkannt
        <span class="dim">({{ preview.usedHeader ? 'mit Kopfzeile' : 'feste Spaltenreihenfolge' }})</span>
      </p>
      <details v-if="preview.skipped.length">
        <summary class="error">{{ preview.skipped.length }} Zeile(n) übersprungen</summary>
        <ul class="small">
          <li v-for="skip in preview.skipped" :key="skip.line">
            Zeile {{ skip.line }}: {{ skip.reason }} – <span class="mono dim">{{ skip.raw }}</span>
          </li>
        </ul>
      </details>
    </div>
  </section>
</template>

<style scoped>
.preview {
  margin-top: 0.75rem;
  padding: 0.6rem 0.8rem;
  background: var(--surface-2);
  border-radius: var(--radius);
}
</style>
