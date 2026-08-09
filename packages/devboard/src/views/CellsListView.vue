<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useCellsStore } from '../stores/useCellsStore'
import { useCellsFilter } from '../composables/useCellsFilter'
import CellDurabilityBadge from '../components/CellDurabilityBadge.vue'

const { t } = useI18n()

const store = useCellsStore()
// store.cells is auto-unwrapped from ComputedRef in the store's reactive proxy;
// wrap in computed so useCellsFilter receives a proper Ref-like reactive source.
const cells = computed(() => store.cells ?? [])
const { query, domain, domains, filtered } = useCellsFilter(cells)
</script>

<template>
  <div class="cells-list">
    <!-- Header -->
    <div class="cells-list__head">
      <div class="cells-list__title-group">
        <h1 class="cells-list__h1">
          {{ t('cells.list.title') }}
          <span class="cells-list__count">{{
            t('cells.list.count', { count: filtered.length })
          }}</span>
        </h1>
        <p class="cells-list__subtitle">{{ t('cells.list.subtitle') }}</p>
      </div>

      <!-- Controls -->
      <div class="cells-list__controls">
        <label for="cells-search" class="cells-list__search-label">
          {{ t('cells.list.searchLabel') }}
        </label>
        <input
          id="cells-search"
          v-model="query"
          type="search"
          class="cells-list__search"
          :placeholder="t('cells.list.searchPlaceholder')"
        />

        <div class="cells-list__seg" role="group" :aria-label="t('cells.list.domainFilterLabel')">
          <button
            v-for="d in domains"
            :key="d"
            class="cells-list__seg-btn"
            :aria-pressed="d === domain ? 'true' : 'false'"
            @click="domain = d"
          >
            {{ d === 'all' ? t('cells.list.domainAll') : d }}
          </button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="cells-list__table-wrap">
      <table class="cells-list__table" :aria-label="t('cells.list.title')">
        <thead>
          <tr>
            <th scope="col">{{ t('cells.list.col.cell') }}</th>
            <th scope="col">{{ t('cells.list.col.domain') }}</th>
            <th scope="col">{{ t('cells.list.col.type') }}</th>
            <th scope="col">{{ t('cells.list.col.tier') }}</th>
            <th scope="col">{{ t('cells.list.col.owner') }}</th>
            <th scope="col">{{ t('cells.list.col.durability') }}</th>
            <th scope="col" class="cells-list__th--num">{{ t('cells.list.col.slices') }}</th>
            <th scope="col" class="cells-list__th--num">{{ t('cells.list.col.produces') }}</th>
            <th scope="col" class="cells-list__th--num">{{ t('cells.list.col.consumes') }}</th>
            <th scope="col" class="cells-list__th--num">{{ t('cells.list.col.requires') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="filtered.length > 0">
            <tr v-for="cell in filtered" :key="cell.id" class="cells-list__row">
              <!-- Cell id + name with keyboard-accessible link -->
              <td class="cells-list__cell-col">
                <RouterLink
                  :to="`/cells/${cell.id}`"
                  :aria-label="t('cells.list.openCell', { name: cell.name })"
                  class="cells-list__cell-link"
                >
                  <span class="cells-list__cell-id">{{ cell.id }}</span>
                  <span class="cells-list__cell-name">{{ cell.name }}</span>
                </RouterLink>
              </td>
              <td>{{ cell.domain }}</td>
              <td>{{ cell.type }}</td>
              <td>
                <span class="cells-list__tier-chip">{{ cell.consistencyLevel }}</span>
              </td>
              <td>{{ cell.owner.team }}</td>
              <td>
                <CellDurabilityBadge :mode="cell.durabilityMode" />
              </td>
              <td class="cells-list__num">{{ cell.slices.length }}</td>
              <td class="cells-list__num">{{ cell.produces.length }}</td>
              <td class="cells-list__num">{{ cell.consumes.length }}</td>
              <td class="cells-list__num">{{ cell.requires.length }}</td>
            </tr>
          </template>
          <template v-else>
            <tr>
              <td colspan="10" class="cells-list__empty">
                {{ t('cells.list.empty') }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ────────────────────────────────────────────────────── */
.cells-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cells-list__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.cells-list__title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cells-list__h1 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--fg);
  font-family: var(--font-sans);
}

.cells-list__count {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--fg-muted);
  font-family: var(--font-mono);
}

.cells-list__subtitle {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

/* ── Controls ──────────────────────────────────────────────────── */
.cells-list__controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cells-list__search-label {
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

.cells-list__search {
  width: 200px;
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

.cells-list__search:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

/* Segmented control */
.cells-list__seg {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.cells-list__seg-btn {
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
  .cells-list__seg-btn {
    transition: none;
  }
}

.cells-list__seg-btn:first-child {
  border-left: none;
}

.cells-list__seg-btn[aria-pressed='true'] {
  background: var(--bg-sunken);
  color: var(--fg);
  font-weight: 500;
}

.cells-list__seg-btn:hover:not([aria-pressed='true']) {
  background: var(--bg-sunken);
}

.cells-list__seg-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ── Table ─────────────────────────────────────────────────────── */
.cells-list__table-wrap {
  overflow-x: auto;
}

.cells-list__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  color: var(--fg);
}

.cells-list__table thead th {
  padding: 6px 12px;
  text-align: left;
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line-soft);
  white-space: nowrap;
}

.cells-list__th--num {
  text-align: right;
}

.cells-list__table tbody td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}

.cells-list__row:hover td {
  background: var(--bg-sunken);
}

/* Cell column */
.cells-list__cell-col {
  min-width: 160px;
}

.cells-list__cell-link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-decoration: none;
  color: inherit;
}

.cells-list__cell-link:hover .cells-list__cell-id {
  color: var(--accent);
  text-decoration: underline;
}

.cells-list__cell-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

.cells-list__cell-id {
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--fg);
}

.cells-list__cell-name {
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

/* Tier chip — neutral only, no per-tier hue */
.cells-list__tier-chip {
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

/* Numeric columns */
.cells-list__num {
  text-align: right;
  font-family: var(--font-mono);
  color: var(--fg-muted);
}

/* Empty state */
.cells-list__empty {
  padding: 28px 12px;
  text-align: center;
  color: var(--fg-muted);
}
</style>
