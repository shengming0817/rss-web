<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NAV_GROUPS } from './navConfig'
import type { NavPill } from './navConfig'

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  (e: 'update:collapsed', value: boolean): void
  (e: 'open-command-palette'): void
}>()

const { t } = useI18n()
const route = useRoute()

/** Map nav pill → CSS class modifier */
function pillClass(pill: NavPill): string {
  return `sidebar__pill--${pill}`
}

/** Whether a given route path matches the current route */
function isActive(to: string): boolean {
  // Exact match or prefix match for nested routes
  return route.path === to || route.path.startsWith(to + '/')
}

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

    <!-- Navigation groups -->
    <nav class="sidebar__nav" :aria-label="t('shell.nav.label')">
      <template v-for="group in NAV_GROUPS" :key="group.groupKey">
        <div class="sidebar__group" role="group" :aria-label="t(group.labelKey)">
          <div
            v-if="!collapsed"
            :id="`sidebar-group-${group.groupKey}`"
            class="sidebar__group-label"
          >
            {{ t(group.labelKey) }}
          </div>

          <template v-for="item in group.items" :key="item.key">
            <!-- Reserved items: non-interactive span (keyboard Enter must not activate) -->
            <span
              v-if="item.pill === 'reserved'"
              class="sidebar__item sidebar__item--reserved"
              :aria-label="t(item.labelKey)"
              aria-disabled="true"
            >
              <span v-if="!collapsed" class="sidebar__item-label">
                {{ t(item.labelKey) }}
              </span>
              <span
                v-if="!collapsed"
                class="sidebar__pill"
                :class="pillClass('reserved')"
                aria-hidden="true"
              >
                {{ t('nav.pill.reserved') }}
              </span>
            </span>

            <!-- Live / preview / new items: real RouterLink -->
            <RouterLink
              v-else
              :to="item.to"
              class="sidebar__item"
              :class="{
                'sidebar__item--active': isActive(item.to),
              }"
              :aria-label="t(item.labelKey)"
              :aria-current="isActive(item.to) ? 'page' : undefined"
            >
              <span v-if="!collapsed" class="sidebar__item-label">
                {{ t(item.labelKey) }}
              </span>
              <span
                v-if="!collapsed && item.pill && item.pill !== 'live'"
                class="sidebar__pill"
                :class="pillClass(item.pill)"
                aria-hidden="true"
              >
                {{ t(`nav.pill.${item.pill}`) }}
              </span>
            </RouterLink>
          </template>
        </div>
      </template>
    </nav>

    <!-- User card -->
    <div class="sidebar__foot">
      <slot name="user-card">
        <div v-if="!collapsed" class="sidebar__user">
          <div class="v1-avatar" aria-hidden="true">GC</div>
          <div class="sidebar__user-meta">
            <div class="sidebar__user-name">{{ t('shell.user.guest') }}</div>
            <div class="sidebar__user-role">{{ t('shell.user.role') }}</div>
          </div>
        </div>
        <div v-else class="sidebar__user-icon">
          <div class="v1-avatar" aria-hidden="true">GC</div>
        </div>
      </slot>
    </div>
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
