<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRovingTablist } from '@gocell/core'

const props = defineProps<{
  tabs: readonly { id: string; labelKey: string }[]
  activeId: string
  cellId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { t } = useI18n()

const tabBtnId = (id: string) => `cell-tab-${props.cellId}-${id}`
const panelId = (id: string) => `cell-panel-${props.cellId}-${id}`

const { onKeydown } = useRovingTablist({
  tabIds: () => props.tabs.map((tab) => tab.id),
  idFor: tabBtnId,
  onActivate: (id) => emit('select', id),
})
</script>

<template>
  <div role="tablist" :aria-label="t('cells.detail.tablistLabel')" class="tab-bar">
    <button
      v-for="tab in tabs"
      :id="tabBtnId(tab.id)"
      :key="tab.id"
      type="button"
      role="tab"
      :aria-selected="tab.id === activeId"
      :aria-controls="tab.id === activeId ? panelId(tab.id) : undefined"
      :tabindex="tab.id === activeId ? 0 : -1"
      class="tab-bar__btn"
      :class="{ 'tab-bar__btn--active': tab.id === activeId }"
      @click="emit('select', tab.id)"
      @keydown="onKeydown($event, tab.id)"
    >
      {{ t(tab.labelKey) }}
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
  transition:
    color 0.12s,
    border-color 0.12s;
  line-height: 1.4;
}

.tab-bar__btn:focus:not(:focus-visible) {
  outline: none;
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
