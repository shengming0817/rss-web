<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDepsGraph } from '../composables/useDepsGraph'
import DepsViewBar from '../components/deps/DepsViewBar.vue'
import DepsListView from '../components/deps/DepsListView.vue'
import DepsGraphView from '../components/deps/DepsGraphView.vue'
import DepsTreeView from '../components/deps/DepsTreeView.vue'
import DepsMatrixView from '../components/deps/DepsMatrixView.vue'
import type { DepsViewId } from '../components/deps/DepsViewBar.vue'

const { t } = useI18n()

const { cells, edges, forest, dependsOn, selectedCellId, selectedCell, select } = useDepsGraph()

const activeView = ref<DepsViewId>('list')

const VIEWS: readonly { id: DepsViewId; labelKey: string }[] = [
  { id: 'list', labelKey: 'deps.view.list' },
  { id: 'graph', labelKey: 'deps.view.graph' },
  { id: 'tree', labelKey: 'deps.view.tree' },
  { id: 'matrix', labelKey: 'deps.view.matrix' },
]

const panelId = (id: DepsViewId) => `deps-panel-${id}`

function onSelectView(id: DepsViewId): void {
  activeView.value = id
}
</script>

<template>
  <div class="deps-view">
    <!-- Header -->
    <header class="deps-view__header">
      <h1 class="deps-view__h1">
        {{ t('deps.title') }}
        <span class="deps-view__count">{{ t('deps.count', { n: cells.length }) }}</span>
      </h1>
      <p class="deps-view__subtitle">{{ t('deps.subtitle') }}</p>
    </header>

    <!-- View switcher -->
    <DepsViewBar :views="VIEWS" :active-id="activeView" @select="onSelectView" />

    <!-- Main content + detail aside -->
    <div class="deps-view__body">
      <div class="deps-view__panel-wrap">
        <!-- List view panel -->
        <section
          :id="panelId('list')"
          role="tabpanel"
          aria-labelledby="deps-tab-list"
          class="deps-view__panel"
          :class="{ 'deps-view__panel--hidden': activeView !== 'list' }"
          :hidden="activeView !== 'list'"
        >
          <DepsListView :cells="cells" @select="select" />
        </section>

        <!-- Graph view panel -->
        <section
          :id="panelId('graph')"
          role="tabpanel"
          aria-labelledby="deps-tab-graph"
          class="deps-view__panel"
          :class="{ 'deps-view__panel--hidden': activeView !== 'graph' }"
          :hidden="activeView !== 'graph'"
        >
          <DepsGraphView
            :cells="cells"
            :edges="edges"
            :selected-cell-id="selectedCellId"
            @select="select"
          />
        </section>

        <!-- Tree view panel -->
        <section
          :id="panelId('tree')"
          role="tabpanel"
          aria-labelledby="deps-tab-tree"
          class="deps-view__panel"
          :class="{ 'deps-view__panel--hidden': activeView !== 'tree' }"
          :hidden="activeView !== 'tree'"
        >
          <DepsTreeView :forest="forest" @select="select" />
        </section>

        <!-- Matrix view panel -->
        <section
          :id="panelId('matrix')"
          role="tabpanel"
          aria-labelledby="deps-tab-matrix"
          class="deps-view__panel"
          :class="{ 'deps-view__panel--hidden': activeView !== 'matrix' }"
          :hidden="activeView !== 'matrix'"
        >
          <DepsMatrixView :cells="cells" :depends-on="dependsOn" />
        </section>
      </div>

      <!-- Detail aside -->
      <aside class="deps-view__detail" :aria-label="t('deps.detail.label')">
        <template v-if="selectedCell !== null">
          <h2 class="deps-view__detail-title">
            <span class="deps-view__mono">{{ selectedCell.id }}</span>
          </h2>

          <div class="deps-view__detail-section">
            <h3 class="deps-view__detail-subtitle">{{ t('deps.detail.dependsOn') }}</h3>
            <p v-if="selectedCell.dependsOnCells.length === 0" class="deps-view__detail-none">
              {{ t('deps.detail.none') }}
            </p>
            <ul v-else class="deps-view__detail-list">
              <li
                v-for="dep in selectedCell.dependsOnCells"
                :key="dep"
                class="deps-view__detail-item"
              >
                <span class="deps-view__mono">{{ dep }}</span>
              </li>
            </ul>
          </div>

          <div class="deps-view__detail-section">
            <h3 class="deps-view__detail-subtitle">{{ t('deps.detail.requiredBy') }}</h3>
            <p v-if="selectedCell.requiredByCells.length === 0" class="deps-view__detail-none">
              {{ t('deps.detail.none') }}
            </p>
            <ul v-else class="deps-view__detail-list">
              <li
                v-for="dep in selectedCell.requiredByCells"
                :key="dep"
                class="deps-view__detail-item"
              >
                <span class="deps-view__mono">{{ dep }}</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            class="deps-view__detail-close"
            :aria-label="t('deps.detail.close')"
            @click="select(null)"
          >
            {{ t('deps.detail.close') }}
          </button>
        </template>

        <template v-else>
          <p class="deps-view__detail-empty">{{ t('deps.detail.empty') }}</p>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.deps-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  font-size: var(--text-base);
}

.deps-view__header {
  padding: 20px 24px 12px;
}

.deps-view__h1 {
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--fg);
  margin: 0 0 4px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.deps-view__count {
  font-size: var(--text-base);
  font-weight: 400;
  color: var(--fg-muted);
}

.deps-view__subtitle {
  font-size: var(--text-sm);
  color: var(--fg-muted);
  margin: 0;
}

.deps-view__body {
  display: flex;
  flex: 1;
  overflow: hidden;
  gap: 0;
  padding: 16px 24px;
  align-items: flex-start;
}

.deps-view__panel-wrap {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.deps-view__panel {
  width: 100%;
}

.deps-view__panel--hidden {
  display: none;
}

.deps-view__detail {
  width: 240px;
  flex-shrink: 0;
  margin-left: 20px;
  background: var(--bg-raised);
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  padding: 16px;
  font-size: var(--text-base);
}

.deps-view__detail-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--fg);
  margin: 0 0 12px;
}

.deps-view__detail-section {
  margin-bottom: 12px;
}

.deps-view__detail-subtitle {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-muted);
  margin: 0 0 4px;
}

.deps-view__detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.deps-view__detail-item {
  color: var(--fg);
}

.deps-view__detail-none {
  color: var(--fg-faint);
  font-size: var(--text-sm);
  margin: 0;
}

.deps-view__detail-empty {
  color: var(--fg-faint);
  font-size: var(--text-sm);
  margin: 0;
}

.deps-view__detail-close {
  margin-top: 8px;
  font-size: var(--text-sm);
  color: var(--fg-muted);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 4px 10px;
  cursor: pointer;
}

.deps-view__detail-close:hover {
  color: var(--fg);
  border-color: var(--line);
  background: var(--bg-sunken);
}

.deps-view__detail-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.deps-view__mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

@media (prefers-reduced-motion: reduce) {
  .deps-view__detail-close {
    transition: none;
  }
}
</style>
