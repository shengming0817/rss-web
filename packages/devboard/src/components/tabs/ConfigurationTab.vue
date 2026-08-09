<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import type { CellEntry } from '../../manifest/types'
import { useCellsStore } from '../../stores/useCellsStore'

defineProps<{ cell: CellEntry }>()

const { t } = useI18n()
const store = useCellsStore()
const { configEntries: entries, configStatus } = storeToRefs(store)

type LoadState = 'loading' | 'error' | 'empty' | 'data'

// Recent entries are cached in the store, so re-entering this tab reuses them
// instead of re-fetching. Display state is derived from the cache load status.
const state = computed<LoadState>(() => {
  if (configStatus.value === 'error') return 'error'
  if (configStatus.value === 'loaded') return entries.value.length === 0 ? 'empty' : 'data'
  return 'loading'
})

onMounted(() => {
  void store.loadRecentConfig()
})
</script>

<template>
  <section class="config-tab">
    <p v-if="state === 'loading'" role="status" class="config-tab__status">
      {{ t('cells.configuration.loading') }}
    </p>

    <p
      v-else-if="state === 'error'"
      role="alert"
      class="config-tab__status config-tab__status--error"
    >
      {{ t('cells.configuration.error') }}
    </p>

    <p v-else-if="state === 'empty'" role="status" class="config-tab__status">
      {{ t('cells.configuration.empty') }}
    </p>

    <template v-else>
      <div class="config-tab__table-wrap">
        <table class="config-tab__table" :aria-label="t('cells.configuration.tableLabel')">
          <thead>
            <tr>
              <th scope="col">{{ t('cells.configuration.key') }}</th>
              <th scope="col">{{ t('cells.configuration.value') }}</th>
              <th scope="col">{{ t('cells.configuration.version') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.id">
              <td class="config-tab__cell--mono">{{ entry.key }}</td>
              <td class="config-tab__cell--value">{{ entry.value }}</td>
              <td class="config-tab__cell--mono">{{ entry.version }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <RouterLink to="/config" class="config-tab__open-full">
        {{ t('cells.configuration.openFull') }}
      </RouterLink>
    </template>
  </section>
</template>

<style scoped>
.config-tab {
  padding: 16px;
}

.config-tab__status {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}

.config-tab__status--error {
  color: var(--err);
}

.config-tab__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
}

.config-tab__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-base);
}

.config-tab__table thead th {
  padding: 8px 12px;
  text-align: left;
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line-soft);
  background: var(--bg-sunken);
  white-space: nowrap;
}

.config-tab__table tbody td {
  padding: 8px 12px;
  color: var(--fg);
  border-bottom: 1px solid var(--line-soft);
  vertical-align: top;
}

.config-tab__table tbody tr:last-child td {
  border-bottom: none;
}

.config-tab__cell--mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.config-tab__cell--value {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  word-break: break-all;
  max-width: 320px;
}

.config-tab__open-full {
  display: inline-block;
  margin-top: 12px;
  font-size: var(--text-base);
  color: var(--accent);
  text-decoration: none;
}

.config-tab__open-full:hover {
  text-decoration: underline;
}

.config-tab__open-full:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
</style>
