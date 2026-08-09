<script setup lang="ts">
/**
 * CellDetailView — `/cells/:id` multi-tab inspector (Batch 5 / T504).
 *
 * Resolves the cell from the static manifest store. Unknown id → a not-found
 * state with NO tab chrome. The active tab is driven by the `?tab=` query param
 * (deep-linkable, survives reload); unknown/absent → the default 'overview'.
 *
 * Only the active tab's component is mounted (single live tabpanel) so the
 * Audit/Config tabs don't fetch while hidden. The tab bar (CellTabBar) owns the
 * ARIA tablist + roving tabindex; this view owns the matching tabpanel wiring.
 *
 * Read-only page — PDP `read:cell` is enforced at the route guard (fail-closed
 * until BR-004 `/access/decide` ships); no in-view <Can> needed.
 *
 * Design DNA: single --accent, tokens.css variables only, no inline colour,
 * no magic numbers, no emoji, no gradient.
 */
import { computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCellsStore } from '../stores/useCellsStore'
import CellTabBar from '../components/CellTabBar.vue'
import CellDurabilityBadge from '../components/CellDurabilityBadge.vue'
import {
  CELL_TAB_DEFS,
  DEFAULT_CELL_TAB,
  isCellTab,
  cellTabComponent,
} from '../components/tabs/tabRegistry'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const store = useCellsStore()

const cellId = computed(() => String(route.params.id ?? ''))
const cell = computed(() => store.byId(cellId.value))

/** Active tab id from `?tab=`, validated against the registry. */
const activeTab = computed<string>(() => {
  const raw = route.query.tab
  const id = Array.isArray(raw) ? raw[0] : raw
  return typeof id === 'string' && isCellTab(id) ? id : DEFAULT_CELL_TAB
})

const activeComponent = computed(() => cellTabComponent(activeTab.value))

const tabBtnId = (id: string) => `cell-tab-${cellId.value}-${id}`
const panelId = (id: string) => `cell-panel-${cellId.value}-${id}`

function selectTab(id: string): void {
  if (id === activeTab.value) return
  void router.replace({ query: { ...route.query, tab: id } })
}
</script>

<template>
  <div class="cell-detail">
    <!-- Not found: no tab chrome, accessible alert -->
    <div v-if="cell === null" class="cell-detail__not-found" role="alert">
      <h1 class="cell-detail__h1">{{ t('cells.detail.notFound') }}</h1>
      <p class="cell-detail__nf-desc">{{ t('cells.detail.notFoundDesc', { id: cellId }) }}</p>
      <RouterLink to="/cells" class="cell-detail__back">{{ t('cells.detail.back') }}</RouterLink>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="cell-detail__head">
        <RouterLink to="/cells" class="cell-detail__back">{{ t('cells.detail.back') }}</RouterLink>
        <div class="cell-detail__title-group">
          <h1 class="cell-detail__h1">
            <span class="cell-detail__id v1-mono">{{ cell.id }}</span>
            <CellDurabilityBadge :mode="cell.durabilityMode" />
          </h1>
          <p class="cell-detail__subtitle">{{ cell.name }} · {{ cell.domain }}</p>
        </div>
      </div>

      <!-- Tab bar (ARIA tablist + roving tabindex) -->
      <CellTabBar
        :tabs="CELL_TAB_DEFS"
        :active-id="activeTab"
        :cell-id="cellId"
        @select="selectTab"
      />

      <!-- Single live tabpanel -->
      <div
        :id="panelId(activeTab)"
        role="tabpanel"
        :aria-labelledby="tabBtnId(activeTab)"
        tabindex="-1"
        class="cell-detail__panel"
      >
        <component :is="activeComponent" :cell="cell" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.cell-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cell-detail__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cell-detail__back {
  align-self: flex-start;
  font-size: var(--text-sm);
  color: var(--fg-muted);
  text-decoration: none;
}

.cell-detail__back:hover {
  color: var(--accent);
}

.cell-detail__back:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

.cell-detail__title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell-detail__h1 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 500;
  color: var(--fg);
}

.cell-detail__id {
  font-size: var(--text-xl);
}

.cell-detail__subtitle {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}

.cell-detail__panel {
  outline: none;
}

.cell-detail__panel:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r);
}

.cell-detail__not-found {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 28px;
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-lg);
}

.cell-detail__nf-desc {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}
</style>
