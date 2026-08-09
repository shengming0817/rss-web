<script setup lang="ts">
/**
 * AuditView — `/audit` log page (Batch 4 / T402).
 *
 * Reads the cursor-paginated audit list from `useAuditStore` and renders:
 *   - Page header with time-range segment (UI state only; no server range filter yet)
 *   - Chain integrity card (explicit 'unavailable' — backend hash fields pending BR-006)
 *   - Filter toolbar (free text + actor kind + action namespace — all client-side)
 *   - Quick filter chips (keyboard reachable)
 *   - Day-grouped entry list (left pane) + detail panel (right pane)
 *
 * Degraded fields (not in contract): hash/prevHash, result, reason, actor.ip/mfa.
 * These are displayed as explicit "unavailable" stubs rather than fabricated data.
 *
 * Design DNA: single --accent, tokens.css variables only, no inline colour,
 * no magic numbers, no emoji, no gradient.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Can } from '@gocell/core'
import { useAuditStore } from '../stores/useAuditStore'
import type { ActorKindFilter, ActionNsFilter } from '../stores/useAuditStore'
import type { AuditEntry } from '../api/audit'
import ActorPill from '../components/ActorPill.vue'

const { t } = useI18n()
const store = useAuditStore()
const {
  filteredEntries,
  entriesByDay,
  loading,
  errorKey,
  hasMore,
  filter,
  actorKind,
  actionNs,
  chainStatus,
} = storeToRefs(store)

onMounted(() => {
  void store.fetchList()
})

// ─── time range segment (UI-only; no server filter until backend supports it) ─
const range = ref<'1h' | '24h' | '7d' | '30d'>('24h')
const RANGES = ['1h', '24h', '7d', '30d'] as const

// ─── eventType helpers (C: extracted from template to avoid repeated splits) ──
function eventNs(eventType: string): string {
  return eventType.split('.').slice(0, -1).join('.')
}
function eventAction(eventType: string): string {
  return eventType.split('.').pop() ?? eventType
}

// ─── quick filter chips ────────────────────────────────────────────────────────
interface QuickFilter {
  labelKey: string
  apply: () => void
}
const quickFilters: QuickFilter[] = [
  {
    labelKey: 'audit.log.quickFilter.sandboxActions',
    apply() {
      actorKind.value = 'sandbox'
    },
  },
  {
    labelKey: 'audit.log.quickFilter.secretReads',
    apply() {
      actionNs.value = 'secret'
    },
  },
  {
    labelKey: 'audit.log.quickFilter.flagFlips',
    apply() {
      actionNs.value = 'flag'
    },
  },
  {
    labelKey: 'audit.log.quickFilter.roleChangesByHumans',
    apply() {
      actorKind.value = 'human'
      actionNs.value = 'role'
    },
  },
]

function applyQuickFilter(qf: QuickFilter): void {
  // Reset existing filters then apply the preset
  filter.value = ''
  actorKind.value = 'all'
  actionNs.value = 'all'
  qf.apply()
}

// ─── entry selection (master–detail) ──────────────────────────────────────────
const selectedId = ref<string | null>(null)

const selectedEntry = computed<AuditEntry | null>(() => {
  if (selectedId.value) {
    return filteredEntries.value.find((e) => e.id === selectedId.value) ?? null
  }
  return filteredEntries.value[0] ?? null
})

function selectEntry(id: string): void {
  selectedId.value = id
}

// ─── payload formatter ────────────────────────────────────────────────────────
function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

// ─── timestamp formatter ──────────────────────────────────────────────────────
const dtFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
function formatTs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dtFormat.format(d)
}

// ─── actor kind options ───────────────────────────────────────────────────────
const ACTOR_KINDS: Array<{ value: ActorKindFilter; labelKey: string }> = [
  { value: 'all', labelKey: 'audit.log.filter.actorKind.all' },
  { value: 'human', labelKey: 'audit.log.filter.actorKind.human' },
  { value: 'service', labelKey: 'audit.log.filter.actorKind.service' },
  { value: 'cell', labelKey: 'audit.log.filter.actorKind.cell' },
  { value: 'sandbox', labelKey: 'audit.log.filter.actorKind.sandbox' },
  { value: 'unknown', labelKey: 'audit.log.filter.actorKind.unknown' },
]

// ─── action namespace options ─────────────────────────────────────────────────
const ACTION_NS: Array<{ value: ActionNsFilter; labelKey: string }> = [
  { value: 'all', labelKey: 'audit.log.filter.actionNs.all' },
  { value: 'slice', labelKey: 'audit.log.filter.actionNs.slice' },
  { value: 'flag', labelKey: 'audit.log.filter.actionNs.flag' },
  { value: 'config', labelKey: 'audit.log.filter.actionNs.config' },
  { value: 'sandbox', labelKey: 'audit.log.filter.actionNs.sandbox' },
  { value: 'role', labelKey: 'audit.log.filter.actionNs.role' },
  { value: 'secret', labelKey: 'audit.log.filter.actionNs.secret' },
  { value: 'cell', labelKey: 'audit.log.filter.actionNs.cell' },
  { value: 'tenant', labelKey: 'audit.log.filter.actionNs.tenant' },
  { value: 'user', labelKey: 'audit.log.filter.actionNs.user' },
  { value: 'anomaly', labelKey: 'audit.log.filter.actionNs.anomaly' },
]
</script>

<template>
  <section class="audit">
    <!-- ─── page header ─────────────────────────────────────────────────── -->
    <header class="audit__header">
      <div>
        <h1 class="audit__title">{{ t('audit.log.title') }}</h1>
        <p class="audit__subtitle">{{ t('audit.log.subtitle') }}</p>
      </div>
      <div class="audit__head-actions">
        <div class="audit__seg" role="group" :aria-label="t('audit.log.range.label')">
          <button
            v-for="r in RANGES"
            :key="r"
            type="button"
            class="audit__seg-btn"
            :class="{ 'audit__seg-btn--active': range === r }"
            :aria-pressed="range === r"
            @click="range = r"
          >
            {{ r }}
          </button>
        </div>
        <Can action="export" resource="audit">
          <button type="button" class="audit__btn">
            {{ t('audit.log.actions.export') }}
          </button>
        </Can>
        <Can action="verify" resource="audit">
          <button type="button" class="audit__btn">
            {{ t('audit.log.actions.verify') }}
          </button>
        </Can>
      </div>
    </header>

    <!-- ─── chain integrity card ─────────────────────────────────────────── -->
    <div
      class="audit__chain-card"
      data-testid="chain-integrity"
      role="status"
      :aria-label="t('audit.log.chain.label')"
    >
      <template v-if="chainStatus.status === 'ok'">
        <span class="audit__chain-dot audit__chain-dot--ok" aria-hidden="true" />
        <span class="audit__chain-text">{{ t('audit.log.chain.ok') }}</span>
      </template>
      <template v-else-if="chainStatus.status === 'broken'">
        <span class="audit__chain-dot audit__chain-dot--broken" aria-hidden="true" />
        <span class="audit__chain-text">{{ t('audit.log.chain.broken') }}</span>
      </template>
      <template v-else>
        <span class="audit__chain-dot audit__chain-dot--neutral" aria-hidden="true" />
        <span class="audit__chain-text">{{ t('audit.log.chain.unavailable') }}</span>
        <span class="audit__chain-note">{{ t('audit.log.chain.unavailableNote') }}</span>
      </template>
    </div>

    <!-- ─── filter toolbar ───────────────────────────────────────────────── -->
    <div class="audit__filters">
      <div class="audit__filter-group">
        <label class="audit__filter-label" for="audit-filter">
          {{ t('audit.log.filter.label') }}
        </label>
        <input
          id="audit-filter"
          v-model="filter"
          class="audit__filter-input"
          type="search"
          autocomplete="off"
          :placeholder="t('audit.log.filter.placeholder')"
        />
      </div>
      <div class="audit__filter-group">
        <label class="audit__filter-label" for="audit-actor-kind">
          {{ t('audit.log.filter.actorKind.label') }}
        </label>
        <select id="audit-actor-kind" v-model="actorKind" class="audit__filter-select">
          <option v-for="opt in ACTOR_KINDS" :key="opt.value" :value="opt.value">
            {{ t(opt.labelKey) }}
          </option>
        </select>
      </div>
      <div class="audit__filter-group">
        <label class="audit__filter-label" for="audit-action-ns">
          {{ t('audit.log.filter.actionNs.label') }}
        </label>
        <select id="audit-action-ns" v-model="actionNs" class="audit__filter-select">
          <option v-for="opt in ACTION_NS" :key="opt.value" :value="opt.value">
            {{ t(opt.labelKey) }}
          </option>
        </select>
      </div>
      <span class="audit__filter-count" role="status" aria-live="polite">
        {{ t('audit.log.filter.count', { shown: filteredEntries.length }) }}
      </span>
    </div>

    <!-- ─── quick filter chips ───────────────────────────────────────────── -->
    <div class="audit__quick" role="group" :aria-label="t('audit.log.quickFilter.label')">
      <span class="audit__quick-label">{{ t('audit.log.quickFilter.prefix') }}</span>
      <button
        v-for="qf in quickFilters"
        :key="qf.labelKey"
        type="button"
        class="audit__chip"
        data-testid="qf-chip"
        @click="applyQuickFilter(qf)"
      >
        {{ t(qf.labelKey) }}
      </button>
    </div>

    <!-- ─── states: error / loading / empty ─────────────────────────────── -->
    <p v-if="errorKey" class="audit__error" role="alert">{{ t(errorKey) }}</p>

    <p v-else-if="loading && filteredEntries.length === 0" class="audit__loading" role="status">
      {{ t('audit.log.loading') }}
    </p>

    <p v-else-if="filteredEntries.length === 0" class="audit__empty" role="status">
      {{ t('audit.log.empty') }}
    </p>

    <!-- ─── master–detail layout ─────────────────────────────────────────── -->
    <template v-else>
      <div class="audit__layout">
        <!-- left: day-grouped entry list -->
        <!-- Native <ul>/<li> for correct ARIA list semantics (A: no role=list/listitem override). -->
        <ul class="audit__list" :aria-label="t('audit.log.list.label')">
          <li v-for="group in entriesByDay" :key="group.dayKey" class="audit__day-item">
            <section class="audit__day-section" :aria-labelledby="`day-${group.dayKey}`">
              <h2 :id="`day-${group.dayKey}`" class="audit__day-heading">
                <template v-if="group.labelKind === 'today'">{{
                  t('audit.log.day.today')
                }}</template>
                <template v-else-if="group.labelKind === 'yesterday'">{{
                  t('audit.log.day.yesterday')
                }}</template>
                <template v-else>{{ group.dateLabel }}</template>
                <span class="audit__day-count">&middot; {{ group.entries.length }}</span>
              </h2>
              <ul class="audit__day-entries">
                <li v-for="entry in group.entries" :key="entry.id">
                  <button
                    type="button"
                    class="audit__row"
                    :class="{ 'audit__row--active': selectedEntry?.id === entry.id }"
                    data-testid="audit-row"
                    :aria-current="selectedEntry?.id === entry.id ? 'true' : undefined"
                    @click="selectEntry(entry.id)"
                  >
                    <time class="audit__row-time" :datetime="entry.occurredAt ?? entry.timestamp">
                      {{ formatTs(entry.occurredAt ?? entry.timestamp) }}
                    </time>
                    <ActorPill :actor-id="entry.actorId" class="audit__row-actor" />
                    <span class="audit__row-event">
                      <span class="audit__event-ns">{{ eventNs(entry.eventType) }}.</span>
                      {{ eventAction(entry.eventType) }}
                    </span>
                    <span v-if="entry.subjectId" class="audit__row-target">{{
                      entry.subjectId
                    }}</span>
                  </button>
                </li>
              </ul>
            </section>
          </li>

          <li v-if="hasMore">
            <button
              type="button"
              class="audit__more"
              data-action="load-more"
              :disabled="loading"
              @click="store.loadMore()"
            >
              {{ t('audit.log.loadMore') }}
            </button>
          </li>
        </ul>

        <!-- right: detail panel -->
        <aside
          v-if="selectedEntry"
          class="audit__detail"
          data-testid="audit-detail"
          :aria-label="t('audit.log.detail.label')"
        >
          <header class="audit__detail-header">
            <ActorPill :actor-id="selectedEntry.actorId" />
          </header>

          <p class="audit__detail-action">{{ selectedEntry.eventType }}</p>
          <p class="audit__detail-target">
            {{ selectedEntry.subjectId ?? t('audit.log.detail.noTarget') }}
          </p>

          <!-- KV table -->
          <dl class="audit__kv">
            <div class="audit__kv-row">
              <dt class="audit__kv-key">{{ t('audit.log.detail.entryId') }}</dt>
              <dd class="audit__kv-val v1-mono">{{ selectedEntry.id }}</dd>
            </div>
            <div class="audit__kv-row">
              <dt class="audit__kv-key">{{ t('audit.log.detail.eventType') }}</dt>
              <dd class="audit__kv-val v1-mono">{{ selectedEntry.eventType }}</dd>
            </div>
            <div class="audit__kv-row">
              <dt class="audit__kv-key">{{ t('audit.log.detail.actor') }}</dt>
              <dd class="audit__kv-val v1-mono">{{ selectedEntry.actorId }}</dd>
            </div>
            <div v-if="selectedEntry.subjectId" class="audit__kv-row">
              <dt class="audit__kv-key">{{ t('audit.log.detail.target') }}</dt>
              <dd class="audit__kv-val v1-mono">{{ selectedEntry.subjectId }}</dd>
            </div>
            <div v-if="selectedEntry.tenantId" class="audit__kv-row">
              <dt class="audit__kv-key">{{ t('audit.log.detail.tenantId') }}</dt>
              <dd class="audit__kv-val v1-mono">{{ selectedEntry.tenantId }}</dd>
            </div>
            <div v-if="selectedEntry.scope" class="audit__kv-row">
              <dt class="audit__kv-key">{{ t('audit.log.detail.scope') }}</dt>
              <dd class="audit__kv-val v1-mono">{{ selectedEntry.scope }}</dd>
            </div>
            <div v-if="selectedEntry.correlationId" class="audit__kv-row">
              <dt class="audit__kv-key">{{ t('audit.log.detail.correlationId') }}</dt>
              <dd class="audit__kv-val v1-mono">{{ selectedEntry.correlationId }}</dd>
            </div>
            <div class="audit__kv-row">
              <dt class="audit__kv-key">{{ t('audit.log.detail.timestamp') }}</dt>
              <dd class="audit__kv-val">
                <time :datetime="selectedEntry.occurredAt ?? selectedEntry.timestamp">
                  {{ formatTs(selectedEntry.occurredAt ?? selectedEntry.timestamp) }}
                </time>
              </dd>
            </div>
          </dl>

          <!-- payload -->
          <h3 class="audit__detail-section-h">{{ t('audit.log.detail.payload') }}</h3>
          <pre v-if="selectedEntry.payload !== undefined" class="audit__detail-code v1-mono">{{
            formatPayload(selectedEntry.payload)
          }}</pre>
          <p v-else class="audit__detail-empty">{{ t('audit.log.detail.noPayload') }}</p>

          <!-- hash chain context — explicit unavailable, no fabricated data -->
          <h3 class="audit__detail-section-h">{{ t('audit.log.detail.chainContext') }}</h3>
          <div class="audit__chain-unavail" role="status" :aria-label="t('audit.log.chain.label')">
            {{ t('audit.log.chain.unavailable') }}
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.audit {
  max-width: 1080px;
  padding: 28px 32px;
}

/* ─── header ──────────────────────────────────────────────────────────────── */
.audit__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.audit__title {
  margin: 0 0 4px;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 400;
  letter-spacing: -0.01em;
  color: var(--fg);
}

.audit__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
}

.audit__head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ─── segment control ─────────────────────────────────────────────────────── */
.audit__seg {
  display: flex;
  border: 1px solid var(--line);
  border-radius: var(--r);
  overflow: hidden;
}

.audit__seg-btn {
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--fg-muted);
  background: var(--bg);
  border: none;
  border-right: 1px solid var(--line);
  cursor: pointer;
}

.audit__seg-btn:last-child {
  border-right: none;
}

.audit__seg-btn--active {
  color: var(--fg);
  background: var(--bg-sunken);
}

.audit__seg-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ─── action buttons ─────────────────────────────────────────────────────── */
.audit__btn {
  height: 30px;
  padding: 0 12px;
  font-size: 12.5px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.audit__btn:hover {
  background: var(--bg-sunken);
}

.audit__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ─── chain integrity card ───────────────────────────────────────────────── */
.audit__chain-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 12.5px;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.audit__chain-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--r-pill);
  flex-shrink: 0;
}

.audit__chain-dot--neutral {
  background: var(--fg-faint);
}

.audit__chain-dot--ok {
  background: var(--ok);
}

.audit__chain-dot--broken {
  background: var(--err);
}

.audit__chain-text {
  font-weight: 500;
  color: var(--fg);
}

.audit__chain-note {
  font-size: 11.5px;
  color: var(--fg-faint);
  font-family: var(--font-mono);
  margin-left: 4px;
}

/* ─── filter toolbar ─────────────────────────────────────────────────────── */
.audit__filters {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.audit__filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.audit__filter-label {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--fg-muted);
}

.audit__filter-input {
  height: 32px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
  min-width: 280px;
  transition: border-color 0.15s;
}

.audit__filter-input::placeholder {
  color: var(--fg-faint);
}

.audit__filter-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-color: var(--accent);
}

.audit__filter-select {
  height: 32px;
  padding: 0 8px;
  font-size: 12.5px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r);
}

.audit__filter-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.audit__filter-count {
  font-size: 11.5px;
  color: var(--fg-faint);
  font-family: var(--font-mono);
  align-self: flex-end;
  margin-bottom: 4px;
}

/* ─── quick filter chips ─────────────────────────────────────────────────── */
.audit__quick {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.audit__quick-label {
  font-size: 11.5px;
  color: var(--fg-faint);
  font-family: var(--font-mono);
}

.audit__chip {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
  color: var(--fg-muted);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  cursor: pointer;
  transition: background 0.1s;
}

.audit__chip:hover {
  background: var(--bg-sunken);
  color: var(--fg);
}

.audit__chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ─── status / error / empty ─────────────────────────────────────────────── */
.audit__error {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--err);
}

.audit__loading,
.audit__empty {
  margin: 0;
  padding: 40px 0;
  font-size: 13px;
  color: var(--fg-muted);
  text-align: center;
}

/* ─── master–detail layout ───────────────────────────────────────────────── */
.audit__layout {
  display: grid;
  grid-template-columns: 1fr 440px;
  gap: 16px;
  align-items: start;
}

/* ─── entry list ─────────────────────────────────────────────────────────── */
.audit__list {
  min-width: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}

.audit__day-item {
  margin-bottom: 4px;
}

.audit__day-entries {
  list-style: none;
  margin: 0;
  padding: 0;
}

.audit__day-section {
  margin-bottom: 4px;
}

.audit__day-heading {
  padding: 6px 12px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--line);
  margin: 0;
  position: sticky;
  top: 0;
}

.audit__day-count {
  font-weight: 400;
  color: var(--fg-faint);
}

.audit__row {
  display: grid;
  grid-template-columns: 140px 140px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  font-size: 12.5px;
  text-align: left;
  color: var(--fg);
  background: var(--bg);
  border: none;
  border-bottom: 1px solid var(--line-soft);
  cursor: pointer;
  transition: background 0.1s;
}

.audit__row:hover {
  background: var(--bg-raised);
}

.audit__row--active {
  background: var(--bg-sunken);
  border-left: 2px solid var(--accent);
}

.audit__row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.audit__row-time {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--fg-muted);
  white-space: nowrap;
}

.audit__row-actor {
  min-width: 0;
}

.audit__row-event {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
}

.audit__event-ns {
  color: var(--fg-faint);
}

.audit__row-target {
  font-size: 11.5px;
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit__more {
  margin-top: 8px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.audit__more:hover:not(:disabled) {
  background: var(--bg-sunken);
}

.audit__more:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.audit__more:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* ─── detail panel ───────────────────────────────────────────────────────── */
.audit__detail {
  position: sticky;
  top: 0;
  padding: 16px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r);
  font-size: 13px;
  overflow-y: auto;
  max-height: 80vh;
}

.audit__detail-header {
  margin-bottom: 8px;
}

.audit__detail-action {
  margin: 0 0 2px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--fg);
}

.audit__detail-target {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--fg-muted);
}

.audit__kv {
  margin: 0 0 16px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.audit__kv-row {
  display: contents;
}

.audit__kv-key {
  padding: 6px 10px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--fg-muted);
  background: var(--bg);
  border-bottom: 1px solid var(--line-soft);
  white-space: nowrap;
}

.audit__kv-val {
  padding: 6px 10px;
  font-size: 12px;
  color: var(--fg);
  background: var(--bg-raised);
  border-bottom: 1px solid var(--line-soft);
  overflow-wrap: break-word;
  min-width: 0;
}

.audit__detail-section-h {
  margin: 0 0 6px;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-muted);
}

.audit__detail-code {
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  font-size: 11.5px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre;
  color: var(--fg);
  margin: 0 0 16px;
}

.audit__detail-empty {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--fg-faint);
}

.audit__chain-unavail {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--fg-muted);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  font-family: var(--font-mono);
}

@media (prefers-reduced-motion: reduce) {
  .audit__filter-input,
  .audit__row,
  .audit__chip {
    transition: none;
  }
}
</style>
