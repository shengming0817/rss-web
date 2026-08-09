<script setup lang="ts">
/**
 * CellHealthCard — card displaying runtime health data for a single cell.
 *
 * a11y: section is labelled by its h3 heading via aria-labelledby.
 * headingId is derived from cell.name to be unique per rendered instance.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CellHealthEntry } from '../api/health'
import { formatUptime } from '../lib/formatUptime'
import CellHealthBadge from './CellHealthBadge.vue'

const props = defineProps<{ cell: CellHealthEntry }>()
const { t } = useI18n()

const headingId = computed(() => `cell-health-${props.cell.name.replace(/[^a-zA-Z0-9]/g, '-')}`)

const healthySliceCount = computed(
  () => props.cell.slices.filter((s) => s.status === 'healthy').length,
)

const lastError = computed(() => {
  // O(n) linear scan: find the slice with the most recent lastErrorAt
  // without allocating a temp array + sort.
  let bestMsg: string | null = null
  let bestAt = ''
  for (const s of props.cell.slices) {
    if (s.lastErrorMessage == null) continue
    const at = s.lastErrorAt ?? ''
    if (at >= bestAt) {
      bestAt = at
      bestMsg = s.lastErrorMessage
    }
  }
  return bestMsg
})
</script>

<template>
  <section class="card" :aria-labelledby="headingId">
    <h3 :id="headingId" class="card__heading">{{ cell.name }}</h3>
    <div class="card__type">{{ cell.type }}</div>
    <div class="card__status">
      <CellHealthBadge :status="cell.status" />
    </div>
    <dl class="kv">
      <div class="kv__row">
        <dt>{{ t('landing.cell.version') }}</dt>
        <dd class="mono">{{ cell.version }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.cell.commit') }}</dt>
        <dd class="mono">{{ cell.commit }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.cell.uptime') }}</dt>
        <dd>{{ formatUptime(cell.uptimeSeconds) }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.cell.durability') }}</dt>
        <dd>{{ cell.durability }}</dd>
      </div>
      <div class="kv__row">
        <dt>{{ t('landing.cell.slices', { n: cell.slices.length }) }}</dt>
        <dd>
          {{
            t('landing.cell.sliceSummary', {
              healthy: healthySliceCount,
              total: cell.slices.length,
            })
          }}
        </dd>
      </div>
      <div v-if="lastError !== null" class="kv__row">
        <dt>{{ t('landing.cell.lastError') }}</dt>
        <dd class="mono err">{{ lastError }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.card {
  padding: 16px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  background: var(--bg-raised);
}

.card__heading {
  margin: 0 0 4px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg);
}

.card__type {
  margin-bottom: 8px;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.card__status {
  margin-bottom: 12px;
}

.kv {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 0;
  margin: 0;
}

.kv__row {
  display: contents;
}

.kv__row dt,
.kv__row dd {
  padding: 5px 0;
  font-size: var(--text-base);
  border-bottom: 1px solid var(--line-soft);
  margin: 0;
}

.kv__row:last-child dt,
.kv__row:last-child dd {
  border-bottom: none;
}

.kv__row dt {
  color: var(--fg-muted);
  padding-right: 12px;
}

.kv__row dd {
  color: var(--fg);
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.err {
  color: var(--fg-muted);
}
</style>
