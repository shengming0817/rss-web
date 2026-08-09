<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CellEntry, CellSlice } from '../../manifest/types'

const props = defineProps<{ cell: CellEntry }>()
const { t } = useI18n()

function earliestExpiry(slice: CellSlice): string | null {
  if (slice.waivers.length === 0) return null
  const dates = slice.waivers.map((w) => w.expiresAt).sort()
  return dates[0] ?? null
}
</script>

<template>
  <div class="slices">
    <h2 class="slices__title">{{ t('cells.slices.title') }}</h2>

    <p v-if="props.cell.slices.length === 0" class="muted">{{ t('cells.slices.none') }}</p>

    <table v-else class="slices-table">
      <thead>
        <tr>
          <th scope="col" class="slices-table__th">{{ t('cells.slices.slice') }}</th>
          <th scope="col" class="slices-table__th">{{ t('cells.slices.consistency') }}</th>
          <th scope="col" class="slices-table__th slices-table__th--num">
            {{ t('cells.slices.contracts') }}
          </th>
          <th scope="col" class="slices-table__th">{{ t('cells.slices.waivers') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="slice in props.cell.slices" :key="slice.id" class="slices-table__row">
          <td class="slices-table__cell mono">{{ slice.id }}</td>
          <td class="slices-table__cell">{{ slice.consistencyLevel }}</td>
          <td class="slices-table__cell slices-table__cell--num mono">
            {{ slice.contractUsages.length }}
          </td>
          <td class="slices-table__cell">
            <template v-if="slice.waivers.length > 0">
              <span class="waiver-count">{{ slice.waivers.length }}</span>
              <span v-if="earliestExpiry(slice)" class="waiver-expires">
                {{ t('cells.slices.waiverExpires', { date: earliestExpiry(slice) }) }}
              </span>
            </template>
            <span v-else class="muted">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.slices {
  padding: 16px 0;
}

.slices__title {
  margin: 0 0 14px;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--fg);
}

.muted {
  font-size: var(--text-base);
  color: var(--fg-muted);
  margin: 0;
}

.slices-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-base);
}

.slices-table__th {
  padding: 6px 12px;
  text-align: left;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line);
}

.slices-table__th--num {
  text-align: right;
}

.slices-table__row:hover {
  background: var(--bg-sunken);
}

.slices-table__cell {
  padding: 7px 12px;
  color: var(--fg);
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}

.slices-table__cell--num {
  text-align: right;
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.waiver-count {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  font-size: var(--text-xs);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  color: var(--fg-muted);
  font-family: var(--font-mono);
}

.waiver-expires {
  font-size: var(--text-xs);
  color: var(--fg-muted);
}
</style>
