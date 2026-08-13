<script setup lang="ts">
import { useStore } from '../state/store'
import { ASSIGNABLE_ROLES, ROLE_LABEL } from '../state/permissions'
import type { DeviceGrant, Role } from '../types'

/**
 * Die freigeschalteten Geräte. Rechte lassen sich hier jederzeit ändern oder
 * ganz entziehen – etwa wenn das Stegpersonal am Nachmittag wechselt.
 */
const store = useStore()

function update(grant: DeviceGrant, patch: Partial<DeviceGrant>): void {
  store.dispatch({ type: 'UPSERT_DEVICE', grant: { ...grant, ...patch } })
}

function toggleParcours(grant: DeviceGrant, parcoursId: string): void {
  const parcoursIds = grant.parcoursIds.includes(parcoursId)
    ? grant.parcoursIds.filter((id) => id !== parcoursId)
    : [...grant.parcoursIds, parcoursId]
  update(grant, { parcoursIds })
}

/** Was das Gerät mit diesen Rechten gerade tun darf – im Klartext. */
function wirkung(grant: DeviceGrant): string {
  if (grant.role === 'steg') {
    const namen = store.state.parcoursList
      .filter((p) => grant.parcoursIds.includes(p.id))
      .map((p) => p.name)
    return namen.length ? `bedient ${namen.join(', ')}` : 'bedient nichts – kein Parcours gewählt'
  }
  if (grant.role === 'viewer') return 'sieht nur die Startliste'
  if (grant.role === 'board') return 'zeigt nur die Tafel'
  return 'darf alles'
}

function seen(ts: number): string {
  if (!ts) return '–'
  const minutes = Math.round((Date.now() - ts) / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} min`
  return new Date(ts).toLocaleString('de-DE')
}
</script>

<template>
  <section class="card">
    <h2>Verbundene Geräte</h2>

    <p v-if="!store.state.devices.length" class="dim">
      Noch kein Gerät freigeschaltet. Über „Gerät freischalten" einen Code ausgeben.
    </p>

    <template v-else>
    <p class="hint">
      Änderungen wirken <strong>sofort</strong> – das Gerät bekommt die neuen Rechte übertragen,
      ohne dass sich jemand neu anmelden muss. Wird einem Gerät die Berechtigung entzogen, sperrt
      sich seine Bedienung von selbst. Die Zuordnung bleibt gespeichert (auch in einer Sicherung),
      ein Gerät findet nach einem Verbindungsabbruch also ohne neuen Code zurück.
    </p>

    <div class="scroll-x">
      <table>
        <thead>
          <tr>
            <th>Gerät</th>
            <th>Rolle</th>
            <th>Parcours</th>
            <th>Zuletzt gesehen</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="grant in store.state.devices" :key="grant.deviceId">
            <td>
              <input
                :value="grant.name"
                style="width: 10rem"
                @change="update(grant, { name: ($event.target as HTMLInputElement).value })"
              />
              <div class="mono small dim">{{ grant.deviceId }}</div>
            </td>
            <td>
              <select
                :value="grant.role"
                @change="update(grant, { role: ($event.target as HTMLSelectElement).value as Role })"
              >
                <option v-for="r in ASSIGNABLE_ROLES" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
              </select>
            </td>
            <td>
              <label
                v-for="parcours in store.state.parcoursList"
                :key="parcours.id"
                class="row-tight small"
                style="margin-right: 0.6rem"
              >
                <input
                  type="checkbox"
                  :disabled="grant.role !== 'steg'"
                  :checked="grant.parcoursIds.includes(parcours.id)"
                  @change="toggleParcours(grant, parcours.id)"
                />
                {{ parcours.name }}
              </label>
            </td>
            <td class="dim small">
              {{ seen(grant.lastSeen) }}
              <div>{{ wirkung(grant) }}</div>
            </td>
            <td>
              <button
                class="danger"
                @click="store.dispatch({ type: 'REMOVE_DEVICE', deviceId: grant.deviceId })"
              >
                Rechte entziehen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>
  </section>
</template>
