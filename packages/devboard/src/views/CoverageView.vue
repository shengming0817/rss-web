<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  COVERAGE_MATRIX,
  COVERAGE_STATUSES,
  coverageCounts,
  type CoverageStatus,
} from '../data/coverageMatrix'

const { t } = useI18n()

// ── Filter state ────────────────────────────────────────────────────────────
type FilterValue = 'all' | CoverageStatus

const activeFilter = ref<FilterValue>('all')

function setFilter(value: FilterValue): void {
  activeFilter.value = value
}

// ── Derived data ─────────────────────────────────────────────────────────────
const counts = coverageCounts()
const allRows = COVERAGE_MATRIX.flatMap((s) => s.rows)
const shipped = allRows.filter((r) => r.web !== null).length
const drafted = allRows.filter((r) => r.design !== null).length
const gaps = counts.total - counts.matched

const filteredSections = computed(() => {
  if (activeFilter.value === 'all') return COVERAGE_MATRIX
  return COVERAGE_MATRIX.map((section) => ({
    ...section,
    rows: section.rows.filter((row) => row.status === activeFilter.value),
  })).filter((section) => section.rows.length > 0)
})

// ── Status helpers ───────────────────────────────────────────────────────────

// kebab-case status → camelCase i18n key suffix
const STATUS_CAMEL: Readonly<Record<CoverageStatus, string>> = {
  matched: 'matched',
  partial: 'partial',
  'design-only': 'designOnly',
  'backend-only': 'backendOnly',
  'out-of-scope': 'outOfScope',
}

// Filter chip i18n key suffixes (must match STATUS_CAMEL)
const FILTER_KEY: Readonly<Record<FilterValue, string>> = {
  all: 'all',
  matched: 'matched',
  partial: 'partial',
  'design-only': 'designOnly',
  'backend-only': 'backendOnly',
  'out-of-scope': 'outOfScope',
}

// Mark symbol (aria-hidden; sr-only text carries the meaning)
const STATUS_MARK: Readonly<Record<CoverageStatus, string>> = {
  matched: '●',
  partial: '◐',
  'design-only': '◇',
  'backend-only': '✗',
  'out-of-scope': '–',
}

// token variable for each status color
const STATUS_COLOR_VAR: Readonly<Record<CoverageStatus, string>> = {
  matched: 'var(--ok)',
  partial: 'var(--warn)',
  'design-only': 'var(--accent)',
  'backend-only': 'var(--err)',
  'out-of-scope': 'var(--fg-faint)',
}

const FILTER_VALUES: readonly FilterValue[] = ['all', ...COVERAGE_STATUSES]
</script>

<template>
  <div class="coverage">
    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <div class="coverage__head">
      <p class="coverage__eyebrow">{{ t('coverage.eyebrow') }}</p>
      <h1 class="coverage__h1">{{ t('coverage.title') }}</h1>
      <p class="coverage__subtitle">{{ t('coverage.subtitle') }}</p>
    </div>

    <!-- ── KPI strip ──────────────────────────────────────────────────── -->
    <div class="coverage__kpi-strip" role="list" :aria-label="t('coverage.kpi.regionLabel')">
      <div class="coverage__kpi-card" role="listitem" data-testid="kpi-shipped">
        <span class="coverage__kpi-number">{{ shipped }}</span>
        <span class="coverage__kpi-label">{{ t('coverage.kpi.shipped') }}</span>
        <div class="coverage__kpi-bar" role="presentation">
          <div
            class="coverage__kpi-bar-fill coverage__kpi-bar-fill--ok"
            :style="{ width: counts.total > 0 ? `${(shipped / counts.total) * 100}%` : '0%' }"
          />
        </div>
      </div>

      <div class="coverage__kpi-card" role="listitem" data-testid="kpi-drafted">
        <span class="coverage__kpi-number">{{ drafted }}</span>
        <span class="coverage__kpi-label">{{ t('coverage.kpi.drafted') }}</span>
        <div class="coverage__kpi-bar" role="presentation">
          <div
            class="coverage__kpi-bar-fill coverage__kpi-bar-fill--accent"
            :style="{ width: counts.total > 0 ? `${(drafted / counts.total) * 100}%` : '0%' }"
          />
        </div>
      </div>

      <div class="coverage__kpi-card" role="listitem" data-testid="kpi-gaps">
        <span class="coverage__kpi-number">{{ gaps }}</span>
        <span class="coverage__kpi-label">{{ t('coverage.kpi.gaps') }}</span>
        <div class="coverage__kpi-bar" role="presentation">
          <div
            class="coverage__kpi-bar-fill coverage__kpi-bar-fill--warn"
            :style="{ width: counts.total > 0 ? `${(gaps / counts.total) * 100}%` : '0%' }"
          />
        </div>
      </div>

      <div class="coverage__kpi-card" role="listitem" data-testid="kpi-out-of-scope">
        <span class="coverage__kpi-number">{{ counts['out-of-scope'] }}</span>
        <span class="coverage__kpi-label">{{ t('coverage.kpi.outOfScope') }}</span>
        <div class="coverage__kpi-bar" role="presentation">
          <div
            class="coverage__kpi-bar-fill coverage__kpi-bar-fill--faint"
            :style="{
              width: counts.total > 0 ? `${(counts['out-of-scope'] / counts.total) * 100}%` : '0%',
            }"
          />
        </div>
      </div>
    </div>

    <!-- ── Legend ─────────────────────────────────────────────────────── -->
    <div class="coverage__legend" role="list" :aria-label="t('coverage.legend.regionLabel')">
      <div
        v-for="status in COVERAGE_STATUSES"
        :key="status"
        class="coverage__legend-item"
        role="listitem"
      >
        <span
          class="coverage__legend-mark"
          aria-hidden="true"
          :style="{ color: STATUS_COLOR_VAR[status] }"
          >{{ STATUS_MARK[status] }}</span
        >
        <span class="coverage__legend-label">{{
          t(`coverage.legend.${STATUS_CAMEL[status]}`)
        }}</span>
      </div>
    </div>

    <!-- ── Filter chips ───────────────────────────────────────────────── -->
    <div class="coverage__filters" role="group" :aria-label="t('coverage.filter.groupLabel')">
      <button
        v-for="fv in FILTER_VALUES"
        :key="fv"
        class="coverage__filter-chip"
        :aria-pressed="activeFilter === fv ? 'true' : 'false'"
        @click="setFilter(fv)"
      >
        {{ t(`coverage.filter.${FILTER_KEY[fv]}`) }}
      </button>
    </div>

    <!-- ── Matrix table ───────────────────────────────────────────────── -->
    <div class="coverage__table-wrap">
      <table class="coverage__table">
        <caption class="sr-only">
          {{
            t('coverage.caption')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ t('coverage.col.capability') }}</th>
            <th scope="col">{{ t('coverage.col.web') }}</th>
            <th scope="col">{{ t('coverage.col.design') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="section in filteredSections" :key="section.titleKey">
            <!-- Section heading row -->
            <tr class="coverage__section-row" data-section>
              <th colspan="3" role="rowheader" class="coverage__section-heading">
                {{ t(section.titleKey) }}
              </th>
            </tr>
            <!-- Data rows -->
            <tr v-for="row in section.rows" :key="row.route" class="coverage__row" data-row>
              <!-- Capability + route + status badge -->
              <td class="coverage__cap-cell">
                <div class="coverage__cap-name">{{ t(row.capabilityKey) }}</div>
                <code class="coverage__route">{{ row.route }}</code>
                <span class="coverage__badge" :style="{ color: STATUS_COLOR_VAR[row.status] }">
                  <span aria-hidden="true">{{ STATUS_MARK[row.status] }}</span>
                  <span class="sr-only">{{
                    t(`coverage.status.${STATUS_CAMEL[row.status]}`)
                  }}</span>
                </span>
              </td>

              <!-- Web ref -->
              <td class="coverage__ref-cell">
                <span
                  class="coverage__status-mark"
                  aria-hidden="true"
                  :style="{ color: STATUS_COLOR_VAR[row.status] }"
                  >{{ STATUS_MARK[row.status] }}</span
                >
                <span class="sr-only">{{ t(`coverage.status.${STATUS_CAMEL[row.status]}`) }}</span>
                <code v-if="row.web !== null" class="coverage__ref">{{ row.web }}</code>
                <span v-else class="coverage__none" :aria-label="t('coverage.none')">{{
                  t('coverage.none')
                }}</span>
              </td>

              <!-- Design ref -->
              <td class="coverage__ref-cell">
                <span
                  class="coverage__status-mark"
                  aria-hidden="true"
                  :style="{ color: STATUS_COLOR_VAR[row.status] }"
                  >{{ STATUS_MARK[row.status] }}</span
                >
                <span class="sr-only">{{ t(`coverage.status.${STATUS_CAMEL[row.status]}`) }}</span>
                <code v-if="row.design !== null" class="coverage__ref">{{ row.design }}</code>
                <span v-else class="coverage__none" :aria-label="t('coverage.none')">{{
                  t('coverage.none')
                }}</span>
              </td>
            </tr>
          </template>

          <!-- Empty state when filter yields no results -->
          <tr v-if="filteredSections.length === 0">
            <td colspan="3" class="coverage__empty">
              {{ t('coverage.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* ── Utility ──────────────────────────────────────────────────────────────── */
.sr-only {
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

/* ── Root ─────────────────────────────────────────────────────────────────── */
.coverage {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Header ───────────────────────────────────────────────────────────────── */
.coverage__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coverage__eyebrow {
  margin: 0;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.coverage__h1 {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--fg);
  font-family: var(--font-sans);
}

.coverage__subtitle {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

/* ── KPI strip ────────────────────────────────────────────────────────────── */
.coverage__kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (max-width: 700px) {
  .coverage__kpi-strip {
    grid-template-columns: repeat(2, 1fr);
  }
}

.coverage__kpi-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  background: var(--bg-raised);
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
}

.coverage__kpi-number {
  font-size: var(--text-xl);
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--fg);
  line-height: 1.2;
}

.coverage__kpi-label {
  font-size: var(--text-xs);
  color: var(--fg-muted);
  line-height: 1.4;
}

.coverage__kpi-bar {
  height: 3px;
  background: var(--bg-sunken);
  border-radius: var(--r-sm);
  overflow: hidden;
  margin-top: 4px;
}

.coverage__kpi-bar-fill {
  height: 100%;
  border-radius: var(--r-sm);
  transition: width 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .coverage__kpi-bar-fill {
    transition: none;
  }
}

.coverage__kpi-bar-fill--ok {
  background: var(--ok);
}

.coverage__kpi-bar-fill--accent {
  background: var(--accent);
}

.coverage__kpi-bar-fill--warn {
  background: var(--warn);
}

.coverage__kpi-bar-fill--faint {
  background: var(--fg-faint);
}

/* ── Legend ───────────────────────────────────────────────────────────────── */
.coverage__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}

.coverage__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.coverage__legend-mark {
  font-size: var(--text-base);
  line-height: 1;
}

.coverage__legend-label {
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

/* ── Filter chips ─────────────────────────────────────────────────────────── */
.coverage__filters {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.coverage__filter-chip {
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
  .coverage__filter-chip {
    transition: none;
  }
}

.coverage__filter-chip:first-child {
  border-left: none;
}

.coverage__filter-chip[aria-pressed='true'] {
  background: var(--bg-sunken);
  color: var(--fg);
  font-weight: 500;
}

.coverage__filter-chip:hover:not([aria-pressed='true']) {
  background: var(--bg-sunken);
}

.coverage__filter-chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ── Table ────────────────────────────────────────────────────────────────── */
.coverage__table-wrap {
  overflow-x: auto;
}

.coverage__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  color: var(--fg);
}

.coverage__table thead th {
  padding: 6px 12px;
  text-align: left;
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 2px solid var(--line);
  white-space: nowrap;
}

.coverage__section-row {
  background: var(--bg-sunken);
}

.coverage__section-heading {
  padding: 6px 12px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-align: left;
  border-bottom: 1px solid var(--line-soft);
}

.coverage__row td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}

.coverage__row:last-child td {
  border-bottom: none;
}

/* ── Capability cell ──────────────────────────────────────────────────────── */
.coverage__cap-cell {
  display: table-cell;
  min-width: 200px;
}

.coverage__cap-name {
  font-weight: 500;
  color: var(--fg);
  margin-bottom: 2px;
}

.coverage__route {
  display: block;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--fg-muted);
  margin-bottom: 4px;
}

.coverage__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
}

/* ── Ref cell ─────────────────────────────────────────────────────────────── */
.coverage__ref-cell {
  white-space: nowrap;
  min-width: 160px;
}

.coverage__status-mark {
  font-size: var(--text-base);
  margin-right: 6px;
}

.coverage__ref {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg-muted);
  word-break: break-all;
}

.coverage__none {
  font-size: var(--text-sm);
  color: var(--fg-faint);
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
.coverage__empty {
  padding: 32px 12px;
  text-align: center;
  color: var(--fg-muted);
  font-size: var(--text-sm);
}
</style>
