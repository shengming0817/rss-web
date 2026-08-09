<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { UnavailablePanel } from '@gocell/core'
import { useObserveStore } from '../stores/useObserveStore'
import type { LogLine } from '../api/observe'

const { t } = useI18n()
const store = useObserveStore()

const headingId = 'observe-logs-heading'
const searchId = 'observe-logs-search'

onMounted(() => {
  void store.loadLogs()
})

function onSubmit(): void {
  void store.loadLogs()
}

function levelOf(log: LogLine): string {
  return log.labels['level'] ?? '—'
}

function cellOf(log: LogLine): string {
  return log.labels['cell'] ?? '—'
}

function rowKey(log: LogLine, index: number): string {
  return `${log.tsNs}-${index}`
}
</script>

<template>
  <section class="logs" :aria-labelledby="headingId">
    <h2 :id="headingId" class="logs__heading">{{ t('observe.logs.regionLabel') }}</h2>

    <form class="logs__form" @submit.prevent="onSubmit">
      <label :for="searchId" class="logs__label">{{ t('observe.logs.searchLabel') }}</label>
      <div class="logs__search-row">
        <input
          :id="searchId"
          :value="store.logsQuery"
          type="text"
          class="logs__input"
          :placeholder="t('observe.logs.searchPlaceholder')"
          @input="store.setLogsQuery(($event.target as HTMLInputElement).value)"
        />
        <button type="submit" class="logs__submit">
          {{ t('observe.logs.submit') }}
        </button>
      </div>
    </form>

    <p
      v-if="store.logsStatus === 'idle' || store.logsStatus === 'loading'"
      class="logs__status"
      role="status"
    >
      {{ t('observe.logs.loading') }}
    </p>

    <template v-else-if="store.logsStatus === 'unavailable'">
      <UnavailablePanel
        :title="t('observe.unavailable.title')"
        :message="t('observe.unavailable.message')"
      />
      <button type="button" class="logs__retry" @click="store.loadLogs()">
        {{ t('observe.unavailable.retry') }}
      </button>
    </template>

    <template v-else>
      <p v-if="store.logs.length === 0" class="logs__status" role="status">
        {{ t('observe.logs.empty') }}
      </p>

      <template v-else>
        <p class="logs__count">{{ t('observe.logs.count', { n: store.logs.length }) }}</p>

        <table class="logs__table">
          <caption class="sr-only">
            {{
              t('observe.logs.tableCaption')
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col" class="logs__col-header logs__col-header--mono">
                {{ t('observe.logs.col.time') }}
              </th>
              <th scope="col" class="logs__col-header">{{ t('observe.logs.col.level') }}</th>
              <th scope="col" class="logs__col-header">{{ t('observe.logs.col.cell') }}</th>
              <th scope="col" class="logs__col-header logs__col-header--fill">
                {{ t('observe.logs.col.message') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(log, idx) in store.logs" :key="rowKey(log, idx)" class="logs__row">
              <td class="logs__cell logs__cell--mono">{{ log.tsNs }}</td>
              <td class="logs__cell">{{ levelOf(log) }}</td>
              <td class="logs__cell logs__cell--mono">{{ cellOf(log) }}</td>
              <td class="logs__cell">{{ log.line }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </template>
  </section>
</template>

<style scoped>
.logs {
  padding: 16px;
}

.logs__heading {
  margin: 0 0 12px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.logs__form {
  margin-bottom: 16px;
}

.logs__label {
  display: block;
  margin-bottom: 6px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-muted);
}

.logs__search-row {
  display: flex;
  gap: 8px;
}

.logs__input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.logs__input::placeholder {
  color: var(--fg-faint);
}

.logs__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.logs__submit {
  height: 30px;
  padding: 0 14px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.logs__submit:hover {
  background: var(--bg-sunken);
}

.logs__submit:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.logs__status {
  padding: 24px 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
  text-align: center;
}

.logs__retry {
  margin-top: 12px;
  height: 30px;
  padding: 0 14px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.logs__retry:hover {
  background: var(--bg-sunken);
}

.logs__retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.logs__count {
  margin: 0 0 8px;
  font-size: var(--text-sm);
  color: var(--fg-faint);
  font-family: var(--font-mono);
}

.logs__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.logs__col-header {
  padding: 6px 10px;
  text-align: left;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--line);
}

.logs__col-header--mono {
  font-family: var(--font-mono);
}

.logs__col-header--fill {
  width: 100%;
}

.logs__row:nth-child(even) {
  background: var(--bg-raised);
}

.logs__cell {
  padding: 6px 10px;
  color: var(--fg);
  border-bottom: 1px solid var(--line-soft);
  vertical-align: top;
}

.logs__cell--mono {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}
</style>
