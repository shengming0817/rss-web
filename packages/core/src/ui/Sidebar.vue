<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SourceBadge from '../components/SourceBadge.vue'
import type { ShellNavigationItem } from './navigation'

const props = defineProps<{
  collapsed: boolean
  navigationItems?: readonly ShellNavigationItem[]
}>()

const emit = defineEmits<{
  (e: 'update:collapsed', value: boolean): void
  (e: 'open-command-palette'): void
}>()

const { t } = useI18n()

/** Derived: initials from route for a11y current label */
const toggleLabel = computed(() =>
  props.collapsed ? t('shell.collapse.expand') : t('shell.collapse.collapse'),
)

function toggleCollapsed(): void {
  emit('update:collapsed', !props.collapsed)
}

function openCommandPalette(): void {
  emit('open-command-palette')
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ 'sidebar--collapsed': collapsed }"
    :aria-label="t('shell.sidebar.label')"
  >
    <!-- Brand area -->
    <div class="sidebar__top">
      <div class="sidebar__brand">
        <div class="sidebar__brand-mark" aria-hidden="true" />
        <template v-if="!collapsed">
          <span class="sidebar__brand-name">{{ t('shell.brand') }}</span>
          <span class="v1-brand-env">{{ t('shell.env') }}</span>
        </template>
      </div>
      <button
        type="button"
        class="sidebar__collapse-btn v1-ghost"
        :aria-label="toggleLabel"
        :aria-expanded="!collapsed"
        @click="toggleCollapsed"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'" />
        </svg>
      </button>
    </div>

    <!-- Search / Command Palette trigger -->
    <button
      v-if="!collapsed"
      type="button"
      class="sidebar__search v1-btn"
      :aria-label="t('shell.search.label')"
      @click="openCommandPalette"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35" />
      </svg>
      <span>{{ t('shell.search.placeholder') }}</span>
      <kbd class="v1-kbd">{{ t('shell.search.shortcut') }}</kbd>
    </button>

    <nav class="sidebar__nav" :aria-label="t('shell.nav.label')">
      <RouterLink
        v-for="item in navigationItems ?? []"
        :key="item.id"
        class="sidebar__item"
        exact-active-class="sidebar__item--active"
        :to="item.to"
        :title="collapsed ? item.label : undefined"
      >
        <span class="sidebar__item-mark" aria-hidden="true" />
        <span v-if="!collapsed" class="sidebar__item-label">{{ item.label }}</span>
        <SourceBadge v-if="!collapsed" :source="item.source" />
      </RouterLink>
    </nav>
  </aside>
</template>

<style scoped>
/* ------ Layout ------ */
.sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background: var(--bg-sunken);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
  flex-shrink: 0;
}

.sidebar--collapsed {
  width: var(--sidebar-collapsed-width);
}

@media (prefers-reduced-motion: reduce) {
  .sidebar {
    transition: none;
  }
  .sidebar__item {
    transition: none;
  }
}

/* ------ Top / brand area ------ */
.sidebar__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: var(--topbar-height);
  border-bottom: 1px solid var(--line-soft);
  flex-shrink: 0;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sidebar__brand-mark {
  width: 20px;
  height: 20px;
  border-radius: var(--r-sm);
  background: var(--accent);
  flex-shrink: 0;
}

.sidebar__brand-name {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg);
  white-space: nowrap;
}

.sidebar__collapse-btn {
  flex-shrink: 0;
}

/* ------ Search trigger ------ */
.sidebar__search {
  margin: 8px 10px;
  width: calc(100% - 20px);
  justify-content: flex-start;
  flex-shrink: 0;
}

/* ------ Navigation ------ */
.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.sidebar__group {
  display: flex;
  flex-direction: column;
  margin-bottom: 4px;
}

.sidebar__group-label {
  padding: 8px 12px 2px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--fg-faint);
}

.sidebar__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 32px;
  font-size: 13px;
  color: var(--fg-muted);
  border-radius: var(--r-sm);
  margin: 0 6px;
  text-decoration: none;
  transition:
    background 0.1s,
    color 0.1s;
}

.sidebar__item:hover {
  background: var(--line-soft);
  color: var(--fg);
}

.sidebar__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.sidebar__item--active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}

.sidebar__item--active:hover {
  background: var(--accent-soft);
  color: var(--accent);
}

.sidebar__item--reserved {
  opacity: 0.45;
  cursor: default;
  pointer-events: none;
  /* span has no href/role=link; keyboard cannot activate */
}

.sidebar__item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__item-mark {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* ------ Pill badges ------ */
.sidebar__pill {
  display: inline-block;
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 500;
  border-radius: var(--r-xs);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
  flex-shrink: 0;
  border: 1px solid var(--line);
  background: var(--bg-sunken);
  color: var(--fg-faint);
}

/* preview / reserved use same neutral style; new gets a subtle accent */
.sidebar__pill--new {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
}

/* ------ Footer / user card ------ */
.sidebar__foot {
  border-top: 1px solid var(--line-soft);
  padding: 10px 12px;
  flex-shrink: 0;
}

.sidebar__user {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar__user-meta {
  min-width: 0;
}

.sidebar__user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__user-role {
  font-size: 11.5px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__user-icon {
  display: flex;
  justify-content: center;
}
</style>
