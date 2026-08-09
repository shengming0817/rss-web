<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRovingTablist } from '@gocell/core'

export type DepsViewId = 'list' | 'graph' | 'tree' | 'matrix'

const props = defineProps<{
  views: readonly { id: DepsViewId; labelKey: string }[]
  activeId: DepsViewId
}>()

const emit = defineEmits<{
  (e: 'select', id: DepsViewId): void
}>()

const { t } = useI18n()

const tabBtnId = (id: string) => `deps-tab-${id}`
const panelId = (id: string) => `deps-panel-${id}`

const { onKeydown } = useRovingTablist<DepsViewId>({
  tabIds: () => props.views.map((v) => v.id),
  idFor: tabBtnId,
  onActivate: (id) => emit('select', id),
})
</script>

<template>
  <div role="tablist" :aria-label="t('deps.viewsLabel')" class="tab-bar">
    <button
      v-for="view in views"
      :id="tabBtnId(view.id)"
      :key="view.id"
      type="button"
      role="tab"
      :aria-selected="view.id === activeId"
      :aria-controls="panelId(view.id)"
      :tabindex="view.id === activeId ? 0 : -1"
      class="tab-bar__btn"
      :class="{ 'tab-bar__btn--active': view.id === activeId }"
      @click="emit('select', view.id)"
      @keydown="onKeydown($event, view.id)"
    >
      {{ t(view.labelKey) }}
    </button>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--line-soft);
}

.tab-bar__btn {
  padding: 8px 14px;
  font-size: var(--text-base);
  font-weight: 400;
  color: var(--fg-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  cursor: pointer;
  outline: none;
  transition:
    color 0.12s,
    border-color 0.12s;
  line-height: 1.4;
}

.tab-bar__btn:hover {
  color: var(--fg);
}

.tab-bar__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.tab-bar__btn--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 500;
}

@media (prefers-reduced-motion: reduce) {
  .tab-bar__btn {
    transition: none;
  }
}
</style>
