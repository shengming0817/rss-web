<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRovingTablist } from '@gocell/core'

const props = defineProps<{
  activeId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { t } = useI18n()

const ENABLED = ['overview', 'logs', 'traces'] as const
const WAVE2 = ['anomalies', 'whatChanged', 'serviceGraph', 'sliceHealth'] as const

type EnabledId = (typeof ENABLED)[number]
type Wave2Id = (typeof WAVE2)[number]
type TabId = EnabledId | Wave2Id

const ALL_TABS: readonly TabId[] = [...ENABLED, ...WAVE2]

const tabBtnId = (id: string) => `observe-tab-${id}`
// aria-controls: only the active panel exists in the DOM (v-if in ObserveView).
// Active-only aria-controls is the correct APG pattern — pointing to a non-existent
// panel id would be invalid per ARIA spec.
const panelId = (id: string) => `observe-panel-${id}`

const { onKeydown } = useRovingTablist<TabId>({
  tabIds: () => ALL_TABS,
  idFor: tabBtnId,
  onActivate: (id) => {
    // Only emit for enabled (non-Wave-2) tabs
    if ((ENABLED as readonly string[]).includes(id)) {
      emit('select', id as EnabledId)
    }
  },
  // Wave-2 tabs receive focus via arrow navigation but do not activate
  disabledIds: WAVE2,
})
</script>

<template>
  <div role="tablist" :aria-label="t('observe.tablistLabel')" class="obs-tab-bar">
    <button
      v-for="id in ENABLED"
      :id="tabBtnId(id)"
      :key="id"
      type="button"
      role="tab"
      :aria-selected="id === props.activeId"
      :aria-controls="id === props.activeId ? panelId(id) : undefined"
      :tabindex="id === props.activeId ? 0 : -1"
      class="obs-tab-bar__btn"
      :class="{ 'obs-tab-bar__btn--active': id === props.activeId }"
      @click="emit('select', id)"
      @keydown="onKeydown($event, id)"
    >
      {{ t('observe.tabs.' + id) }}
    </button>

    <!--
      Wave-2 tabs: buttons with aria-disabled so they are focusable via roving
      arrow navigation (APG pattern) but do not activate.
      They have tabindex="-1" so they are excluded from the initial tab-stop
      sequence — only reachable via arrow keys within the tablist.
    -->
    <button
      v-for="id in WAVE2"
      :id="tabBtnId(id)"
      :key="id"
      type="button"
      role="tab"
      aria-selected="false"
      aria-disabled="true"
      tabindex="-1"
      class="obs-tab-bar__wave2"
      @keydown="onKeydown($event, id)"
    >
      {{ t('observe.tabs.' + id) }}
      <span class="obs-tab-bar__wave2-badge">{{ t('observe.waveTwo') }}</span>
    </button>
  </div>
</template>

<style scoped>
.obs-tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--line-soft);
}

.obs-tab-bar__btn {
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

.obs-tab-bar__btn:focus:not(:focus-visible) {
  outline: none;
}

.obs-tab-bar__btn:hover {
  color: var(--fg);
}

.obs-tab-bar__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.obs-tab-bar__btn--active {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
  font-weight: 500;
}

.obs-tab-bar__wave2 {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: var(--text-base);
  font-weight: 400;
  color: var(--fg-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
  user-select: none;
}

.obs-tab-bar__wave2:focus:not(:focus-visible) {
  outline: none;
}

.obs-tab-bar__wave2:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.obs-tab-bar__wave2-badge {
  display: inline-block;
  padding: 1px 6px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--fg-faint);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-pill);
}

@media (prefers-reduced-motion: reduce) {
  .obs-tab-bar__btn {
    transition: none;
  }
}
</style>
