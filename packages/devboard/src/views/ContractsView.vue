<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContractsRegistry } from '../composables/useContractsRegistry'
import { responseEnvelopeFor, type EnvelopeKind } from '../data/responseEnvelopes'
import GovernanceGatesPanel from '../components/contracts/GovernanceGatesPanel.vue'

const { t } = useI18n()

const { registry, query, kindFilter, filtered, selectedContract, selectedEntry, select } =
  useContractsRegistry()

const KIND_OPTIONS = ['all', 'http', 'event'] as const

const selectedEnvelope = computed(() =>
  selectedEntry.value ? responseEnvelopeFor(selectedEntry.value.contract) : null,
)

function envelopeKindKey(kind: EnvelopeKind): string {
  if (kind === '2xx') return 'contracts.envelopeKind.success'
  if (kind === '4xx') return 'contracts.envelopeKind.clientError'
  return 'contracts.envelopeKind.serverError'
}
</script>

<template>
  <div class="contracts">
    <!-- Header -->
    <div class="contracts__head">
      <div class="contracts__title-group">
        <h1 class="contracts__h1">
          {{ t('contracts.title') }}
          <span class="contracts__count">{{ t('contracts.count', { n: registry.length }) }}</span>
        </h1>
        <p class="contracts__subtitle">{{ t('contracts.subtitle') }}</p>
      </div>
    </div>

    <!-- Snapshot note banner -->
    <div class="contracts__snapshot-banner" role="note">
      <span class="contracts__snapshot-label">{{ t('contracts.snapshot.label') }}</span>
      {{ t('contracts.snapshot.note') }}
    </div>

    <!-- Governance gates panel -->
    <GovernanceGatesPanel />

    <!-- Toolbar -->
    <div class="contracts__toolbar">
      <label for="contracts-search" class="contracts__search-label">
        {{ t('contracts.search.label') }}
      </label>
      <input
        id="contracts-search"
        v-model="query"
        type="search"
        class="contracts__search"
        :placeholder="t('contracts.search.placeholder')"
      />

      <div class="contracts__seg" role="group" :aria-label="t('contracts.kind.filterLabel')">
        <button
          v-for="kind in KIND_OPTIONS"
          :key="kind"
          class="contracts__seg-btn"
          :aria-pressed="kindFilter === kind ? 'true' : 'false'"
          @click="kindFilter = kind"
        >
          {{ t(`contracts.kind.${kind}`) }}
        </button>
      </div>
    </div>

    <!-- Main content: table + detail aside -->
    <div class="contracts__body">
      <!-- Registry table -->
      <div class="contracts__table-wrap">
        <table class="contracts__table" :aria-label="t('contracts.title')">
          <thead>
            <tr>
              <th scope="col">{{ t('contracts.table.contract') }}</th>
              <th scope="col">{{ t('contracts.table.kind') }}</th>
              <th scope="col">{{ t('contracts.table.servers') }}</th>
              <th scope="col">{{ t('contracts.table.callers') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="filtered.length > 0">
              <tr
                v-for="entry in filtered"
                :key="entry.contract"
                class="contracts__row"
                :class="{ 'contracts__row--selected': selectedContract === entry.contract }"
                :aria-current="selectedContract === entry.contract ? 'true' : undefined"
              >
                <td class="contracts__contract-col">
                  <!-- Selection via a real <button> (keyboard-native, aria-pressed conveys
                       selected state), mirroring the link-in-first-cell pattern used by
                       CellsListView / DepsListView. Avoids the <tr tabindex> button anti-pattern. -->
                  <button
                    type="button"
                    class="contracts__select-btn"
                    :aria-pressed="selectedContract === entry.contract ? 'true' : 'false'"
                    @click="select(entry.contract)"
                  >
                    <span class="contracts__contract-id">{{ entry.contract }}</span>
                  </button>
                </td>
                <td>
                  <span class="contracts__kind-chip">{{ entry.kind }}</span>
                </td>
                <td class="contracts__cell-list">
                  <span v-for="server in entry.servers" :key="server" class="contracts__cell-id">{{
                    server
                  }}</span>
                  <span v-if="entry.servers.length === 0" class="contracts__cell-none">—</span>
                </td>
                <td class="contracts__cell-list">
                  <span v-for="caller in entry.callers" :key="caller" class="contracts__cell-id">{{
                    caller
                  }}</span>
                  <span v-if="entry.callers.length === 0" class="contracts__cell-none">—</span>
                </td>
              </tr>
            </template>
            <template v-else>
              <tr>
                <td colspan="4" class="contracts__empty">
                  {{ t('contracts.empty') }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Detail aside -->
      <aside class="contracts__detail" :aria-label="t('contracts.detail.panelLabel')">
        <template v-if="selectedEntry !== null">
          <div class="contracts__detail-content" data-testid="contract-detail">
            <h2 class="contracts__detail-title">
              <span class="contracts__detail-id">{{ selectedEntry.contract }}</span>
            </h2>

            <div class="contracts__detail-section">
              <h3 class="contracts__detail-section-title">
                {{ t('contracts.detail.servers') }}
              </h3>
              <ul class="contracts__detail-list">
                <li
                  v-for="server in selectedEntry.servers"
                  :key="server"
                  class="contracts__cell-id"
                >
                  {{ server }}
                </li>
                <li v-if="selectedEntry.servers.length === 0" class="contracts__cell-none">—</li>
              </ul>
            </div>

            <div class="contracts__detail-section">
              <h3 class="contracts__detail-section-title">
                {{ t('contracts.detail.callers') }}
              </h3>
              <ul class="contracts__detail-list">
                <li
                  v-for="caller in selectedEntry.callers"
                  :key="caller"
                  class="contracts__cell-id"
                >
                  {{ caller }}
                </li>
                <li v-if="selectedEntry.callers.length === 0" class="contracts__cell-none">—</li>
              </ul>
            </div>

            <!-- Response envelope -->
            <div class="contracts__detail-section">
              <h3 class="contracts__detail-section-title">
                {{ t('contracts.detail.envelope') }}
              </h3>
              <template v-if="selectedEnvelope !== null">
                <table class="contracts__envelope-table">
                  <thead>
                    <tr>
                      <th scope="col">{{ t('contracts.detail.status') }}</th>
                      <th scope="col">{{ t('contracts.detail.object') }}</th>
                      <th scope="col" class="sr-only">{{ t('contracts.detail.kind') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="envEntry in selectedEnvelope"
                      :key="envEntry.status"
                      class="contracts__envelope-row"
                    >
                      <td class="contracts__envelope-status">{{ envEntry.status }}</td>
                      <td class="contracts__envelope-object">{{ envEntry.object }}</td>
                      <td>
                        <span
                          class="contracts__envelope-kind"
                          :class="`contracts__envelope-kind--${envEntry.kind}`"
                        >
                          <span class="sr-only">{{ t(envelopeKindKey(envEntry.kind)) }}</span>
                          <span aria-hidden="true">{{ envEntry.kind }}</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </template>
              <p v-else class="contracts__detail-none">
                {{ t('contracts.detail.envelopeNone') }}
              </p>
            </div>
          </div>
        </template>
        <template v-else>
          <p class="contracts__detail-empty">
            {{ t('contracts.detail.empty') }}
          </p>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ────────────────────────────────────────────────────── */
.contracts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.contracts__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.contracts__title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.contracts__h1 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--fg);
  font-family: var(--font-sans);
}

.contracts__count {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--fg-muted);
  font-family: var(--font-mono);
}

.contracts__subtitle {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

/* ── Snapshot banner ───────────────────────────────────────────── */
.contracts__snapshot-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: var(--text-sm);
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
}

.contracts__snapshot-label {
  display: inline-block;
  padding: 1px 6px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--fg-muted);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  white-space: nowrap;
}

/* ── Toolbar ───────────────────────────────────────────────────── */
.contracts__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.contracts__search-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.contracts__search {
  width: 220px;
  min-height: 30px;
  padding: 4px 8px;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  outline: none;
}

.contracts__search:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

/* Segmented control */
.contracts__seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.contracts__seg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 4px 10px;
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  color: var(--fg-muted);
  background: var(--bg);
  border: none;
  border-left: 1px solid var(--line);
  cursor: pointer;
  line-height: 1.4;
  transition:
    background 100ms,
    color 100ms;
}

@media (prefers-reduced-motion: reduce) {
  .contracts__seg-btn {
    transition: none;
  }
}

.contracts__seg-btn:first-child {
  border-left: none;
}

.contracts__seg-btn[aria-pressed='true'] {
  background: var(--bg-sunken);
  color: var(--fg);
  font-weight: 500;
}

.contracts__seg-btn:hover:not([aria-pressed='true']) {
  background: var(--bg-sunken);
}

.contracts__seg-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ── Body: table + detail ──────────────────────────────────────── */
.contracts__body {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  align-items: start;
}

@media (max-width: 900px) {
  .contracts__body {
    grid-template-columns: 1fr;
  }
}

/* ── Table ─────────────────────────────────────────────────────── */
.contracts__table-wrap {
  overflow-x: auto;
}

.contracts__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  color: var(--fg);
}

.contracts__table thead th {
  padding: 6px 12px;
  text-align: left;
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line-soft);
  white-space: nowrap;
}

.contracts__table tbody td {
  padding: 7px 12px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}

.contracts__row:hover td {
  background: var(--bg-sunken);
}

.contracts__row--selected td {
  background: var(--accent-soft);
}

.contracts__contract-col {
  min-width: 200px;
}

/* Reset the native button so it reads as the contract-id cell, keeping a
   keyboard-visible focus ring. The whole row highlights via .contracts__row--selected. */
.contracts__select-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  border-radius: var(--r-sm);
}

.contracts__select-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.contracts__contract-id {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--fg);
}

.contracts__kind-chip {
  display: inline-block;
  padding: 1px 6px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  white-space: nowrap;
}

.contracts__cell-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.contracts__cell-id {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg-muted);
}

.contracts__cell-none {
  font-size: var(--text-xs);
  color: var(--fg-faint);
}

.contracts__empty {
  padding: 28px 12px;
  text-align: center;
  color: var(--fg-muted);
}

/* ── Detail aside ──────────────────────────────────────────────── */
.contracts__detail {
  padding: 14px 16px;
  background: var(--bg-raised);
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
  min-height: 120px;
}

.contracts__detail-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.contracts__detail-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg);
}

.contracts__detail-id {
  font-family: var(--font-mono);
  word-break: break-all;
}

.contracts__detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.contracts__detail-section-title {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.contracts__detail-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.contracts__detail-none {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-faint);
}

.contracts__detail-empty {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

/* Envelope table */
.contracts__envelope-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
}

.contracts__envelope-table thead th {
  padding: 4px 8px;
  text-align: left;
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line-soft);
}

.contracts__envelope-table tbody td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}

.contracts__envelope-status {
  font-family: var(--font-mono);
  color: var(--fg);
}

.contracts__envelope-object {
  font-family: var(--font-mono);
  color: var(--fg-muted);
}

.contracts__envelope-kind {
  display: inline-flex;
  align-items: center;
  padding: 1px 5px;
  font-family: var(--font-mono);
  border-radius: var(--r-sm);
  border: 1px solid transparent;
}

.contracts__envelope-kind--2xx {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 30%, transparent);
  background: color-mix(in srgb, var(--ok) 8%, transparent);
}

.contracts__envelope-kind--4xx {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 30%, transparent);
  background: color-mix(in srgb, var(--warn) 8%, transparent);
}

.contracts__envelope-kind--5xx {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 30%, transparent);
  background: color-mix(in srgb, var(--err) 8%, transparent);
}
</style>
