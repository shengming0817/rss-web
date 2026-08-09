<script setup lang="ts">
/**
 * ObserveView — `/observe` observability dashboard (Batch 7).
 *
 * Tab state is driven by ?tab= query param (deep-linkable, survives reload).
 * Unknown/absent → defaults to 'overview'. Valid values: overview | logs | traces.
 *
 * The active panel component is mounted inside an ObservabilityErrorBoundary so
 * an individual panel error never unmounts the whole view. Each panel owns its
 * own store fetch on mount.
 *
 * Tab ARIA wiring:
 *   - ObserveTabBar exposes button ids as `observe-tab-${id}` (see ObserveTabBar.vue)
 *   - tabpanel :id = `observe-panel-${activeTab}` mirrors those ids
 *   - tabpanel :aria-labelledby = `observe-tab-${activeTab}` closes the widget pattern
 *
 * Design DNA: single --accent, tokens.css variables only, no inline colour,
 * no magic numbers, no emoji, no gradient.
 */
import { computed, defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ObserveTabBar from '../components/ObserveTabBar.vue'
import ObservabilityErrorBoundary from '../components/ObservabilityErrorBoundary.vue'

// Lazy-loaded panel chunks — each becomes its own JS chunk for code splitting.
// ObservabilityErrorBoundary is the active-panel error boundary, so it is kept
// eagerly to avoid nesting async boundaries inside each other.
// aria-controls note: panels are rendered with v-if (only the active panel is in
// the DOM). Active-only aria-controls is therefore the correct APG pattern —
// pointing to a non-existent panel id would be invalid. See ObserveTabBar.vue.
const OverviewPanel = defineAsyncComponent(() => import('../components/OverviewPanel.vue'))
const LogsPanel = defineAsyncComponent(() => import('../components/LogsPanel.vue'))
const TracesPanel = defineAsyncComponent(() => import('../components/TracesPanel.vue'))

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// ─── tab state ────────────────────────────────────────────────────────────────

const VALID_TABS = ['overview', 'logs', 'traces'] as const
type TabId = (typeof VALID_TABS)[number]

function isValidTab(v: unknown): v is TabId {
  return typeof v === 'string' && (VALID_TABS as readonly string[]).includes(v)
}

const activeTab = computed<TabId>(() => {
  const q = route.query.tab
  return isValidTab(q) ? q : 'overview'
})

const PANEL_MAP: Record<TabId, Component> = {
  overview: OverviewPanel,
  logs: LogsPanel,
  traces: TracesPanel,
}

const activePanel = computed<Component>(() => PANEL_MAP[activeTab.value])

// ─── tab button / panel id helpers ────────────────────────────────────────────

const tabBtnId = (id: TabId) => `observe-tab-${id}`
const panelId = (id: TabId) => `observe-panel-${id}`

// ─── tab select ───────────────────────────────────────────────────────────────

function onSelect(id: string): void {
  if (!isValidTab(id) || id === activeTab.value) return
  void router.replace({ query: { ...route.query, tab: id } })
}
</script>

<template>
  <div class="observe">
    <!-- ─── page header ──────────────────────────────────────────────────── -->
    <header class="observe__header">
      <h1 class="v1-h1">{{ t('observe.title') }}</h1>
      <p class="v1-sub">{{ t('observe.subtitle') }}</p>
    </header>

    <!-- ─── tab bar ─────────────────────────────────────────────────────── -->
    <ObserveTabBar :active-id="activeTab" @select="onSelect" />

    <!-- ─── active tab panel ────────────────────────────────────────────── -->
    <div
      :id="panelId(activeTab)"
      role="tabpanel"
      :aria-labelledby="tabBtnId(activeTab)"
      tabindex="-1"
      class="observe__panel"
    >
      <ObservabilityErrorBoundary>
        <component :is="activePanel" />
      </ObservabilityErrorBoundary>
    </div>
  </div>
</template>

<style scoped>
.observe {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 1280px;
  padding: 28px 32px 0;
}

/* ─── header ──────────────────────────────────────────────────────────────── */
.observe__header {
  margin-bottom: 20px;
}

/* ─── panel ───────────────────────────────────────────────────────────────── */
.observe__panel {
  outline: none;
  padding-top: 20px;
}

.observe__panel:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r);
}
</style>
