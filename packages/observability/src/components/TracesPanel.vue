<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { UnavailablePanel } from '@gocell/core'
import { useObserveStore } from '../stores/useObserveStore'

const { t } = useI18n()
const store = useObserveStore()

const headingId = 'observe-traces-heading'
const searchId = 'observe-traces-search'

onMounted(() => {
  void store.loadTraces()
})

function onSubmit(): void {
  void store.loadTraces()
}
</script>

<template>
  <section class="traces" :aria-labelledby="headingId">
    <h2 :id="headingId" class="traces__heading">{{ t('observe.traces.regionLabel') }}</h2>

    <form class="traces__form" @submit.prevent="onSubmit">
      <label :for="searchId" class="traces__label">{{ t('observe.traces.searchLabel') }}</label>
      <div class="traces__search-row">
        <input
          :id="searchId"
          :value="store.tracesService"
          type="text"
          class="traces__input"
          :placeholder="t('observe.traces.searchPlaceholder')"
          @input="store.setTracesService(($event.target as HTMLInputElement).value)"
        />
        <button type="submit" class="traces__submit">
          {{ t('observe.traces.submit') }}
        </button>
      </div>
    </form>

    <p
      v-if="store.tracesStatus === 'idle' || store.tracesStatus === 'loading'"
      class="traces__status"
      role="status"
    >
      {{ t('observe.traces.loading') }}
    </p>

    <template v-else-if="store.tracesStatus === 'unavailable'">
      <UnavailablePanel
        :title="t('observe.unavailable.title')"
        :message="t('observe.unavailable.message')"
      />
      <button type="button" class="traces__retry" @click="store.loadTraces()">
        {{ t('observe.unavailable.retry') }}
      </button>
    </template>

    <template v-else>
      <p v-if="store.traces.length === 0" class="traces__status" role="status">
        {{ t('observe.traces.empty') }}
      </p>

      <template v-else>
        <p class="traces__count">{{ t('observe.traces.count', { n: store.traces.length }) }}</p>

        <table class="traces__table">
          <caption class="sr-only">
            {{
              t('observe.traces.tableCaption')
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col" class="traces__col-header traces__col-header--mono">
                {{ t('observe.traces.col.traceId') }}
              </th>
              <th scope="col" class="traces__col-header">{{ t('observe.traces.col.service') }}</th>
              <th scope="col" class="traces__col-header traces__col-header--fill">
                {{ t('observe.traces.col.name') }}
              </th>
              <th scope="col" class="traces__col-header traces__col-header--mono">
                {{ t('observe.traces.col.duration') }}
              </th>
              <th scope="col" class="traces__col-header traces__col-header--mono">
                {{ t('observe.traces.col.spans') }}
              </th>
              <th scope="col" class="traces__col-header traces__col-header--mono">
                {{ t('observe.traces.col.startTime') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="trace in store.traces" :key="trace.traceId" class="traces__row">
              <td class="traces__cell traces__cell--mono">{{ trace.traceId }}</td>
              <td class="traces__cell">{{ trace.rootService }}</td>
              <td class="traces__cell">{{ trace.rootName }}</td>
              <td class="traces__cell traces__cell--mono">{{ trace.durationMs }}ms</td>
              <td class="traces__cell traces__cell--mono">{{ trace.spanCount }}</td>
              <td class="traces__cell traces__cell--mono">{{ trace.startUnixNano }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </template>
  </section>
</template>

<style scoped>
.traces {
  padding: 16px;
}

.traces__heading {
  margin: 0 0 12px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.traces__form {
  margin-bottom: 16px;
}

.traces__label {
  display: block;
  margin-bottom: 6px;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-muted);
}

.traces__search-row {
  display: flex;
  gap: 8px;
}

.traces__input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.traces__input::placeholder {
  color: var(--fg-faint);
}

.traces__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.traces__submit {
  height: 30px;
  padding: 0 14px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.traces__submit:hover {
  background: var(--bg-sunken);
}

.traces__submit:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.traces__status {
  padding: 24px 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
  text-align: center;
}

.traces__retry {
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

.traces__retry:hover {
  background: var(--bg-sunken);
}

.traces__retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.traces__count {
  margin: 0 0 8px;
  font-size: var(--text-sm);
  color: var(--fg-faint);
  font-family: var(--font-mono);
}

.traces__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.traces__col-header {
  padding: 6px 10px;
  text-align: left;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--line);
}

.traces__col-header--mono {
  font-family: var(--font-mono);
}

.traces__col-header--fill {
  width: 100%;
}

.traces__row:nth-child(even) {
  background: var(--bg-raised);
}

.traces__cell {
  padding: 6px 10px;
  color: var(--fg);
  border-bottom: 1px solid var(--line-soft);
  vertical-align: top;
}

.traces__cell--mono {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
}
</style>
