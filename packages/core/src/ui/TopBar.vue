<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '../stores/useThemeStore'
import { useLocaleStore } from '../stores/useLocaleStore'
import { NAV_GROUPS } from './navConfig'

const emit = defineEmits<{
  (e: 'open-command-palette'): void
}>()

const { t } = useI18n()
const route = useRoute()
const themeStore = useThemeStore()
const localeStore = useLocaleStore()

/**
 * Derive breadcrumb from current route path + NAV_GROUPS.
 * Returns { group, page } where group is the group label key
 * and page is the item label key, or null if not found.
 */
const breadcrumb = computed<{ groupKey: string; itemKey: string } | null>(() => {
  const path = route.path
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (path === item.to || path.startsWith(item.to + '/')) {
        return { groupKey: group.labelKey, itemKey: item.labelKey }
      }
    }
  }
  return null
})

const themeToggleLabel = computed(() =>
  themeStore.theme === 'light' ? t('shell.theme.dark') : t('shell.theme.light'),
)

const localeToggleLabel = computed(() =>
  localeStore.locale === 'zh-CN' ? t('shell.locale.en') : t('shell.locale.zh'),
)

function toggleTheme(): void {
  themeStore.toggleTheme()
}

function toggleLocale(): void {
  localeStore.setLocale(localeStore.locale === 'zh-CN' ? 'en-US' : 'zh-CN')
}

function openCommandPalette(): void {
  emit('open-command-palette')
}
</script>

<template>
  <header class="topbar">
    <!-- Breadcrumbs: semantic <ol>/<li> structure per ARIA -->
    <nav class="topbar__crumbs" :aria-label="t('shell.breadcrumb.root')">
      <ol class="topbar__crumb-list">
        <li class="topbar__crumb topbar__crumb--faint">{{ t('shell.breadcrumb.root') }}</li>
        <template v-if="breadcrumb">
          <li class="topbar__sep" aria-hidden="true">/</li>
          <li class="topbar__crumb topbar__crumb--faint">{{ t(breadcrumb.groupKey) }}</li>
          <li class="topbar__sep" aria-hidden="true">/</li>
          <li class="topbar__crumb" aria-current="page">{{ t(breadcrumb.itemKey) }}</li>
        </template>
      </ol>
    </nav>

    <!-- Actions -->
    <div class="topbar__actions">
      <!-- Command palette button -->
      <button
        type="button"
        class="topbar__cmd v1-btn"
        :aria-label="t('shell.commandPalette.open')"
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
        <kbd class="v1-kbd">{{ t('shell.search.shortcut') }}</kbd>
      </button>

      <!-- Locale toggle -->
      <button
        type="button"
        class="v1-ghost topbar__action-btn"
        :aria-label="t('shell.locale.toggle')"
        :aria-pressed="localeStore.locale === 'en-US'"
        @click="toggleLocale"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M2 5h7 M5 2v3 M10 19l3-9 3 9 M12.7 15h4.6 M2 19a11 11 0 0 0 7-6.9c.5 1.3 1.3 2.5 2.3 3.5"
          />
        </svg>
        <span class="topbar__locale-label">{{ localeToggleLabel }}</span>
      </button>

      <!-- Theme toggle -->
      <button
        type="button"
        class="v1-ghost topbar__action-btn"
        data-testid="theme-toggle"
        :aria-label="themeToggleLabel"
        :aria-pressed="themeStore.theme === 'dark'"
        @click="toggleTheme"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 1 0 9 9c-.7.1-1.5.2-2.3.2A7 7 0 0 1 11.8 5c0-.8.1-1.4.2-2z" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: var(--topbar-height);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--bg);
  flex-shrink: 0;
}

/* ------ Breadcrumbs ------ */
.topbar__crumbs {
  display: flex;
  align-items: center;
  min-width: 0;
}

.topbar__crumb-list {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  list-style: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.topbar__crumb {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar__crumb--faint {
  color: var(--fg-faint);
}

.topbar__sep {
  color: var(--fg-faint);
}

/* ------ Actions ------ */
.topbar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.topbar__cmd {
  /* min-height ≥ 30px per PRD §4 btn exception lower bound */
  min-height: 30px;
  font-size: 12.5px;
}

.topbar__action-btn {
  width: auto;
  padding: 0 6px;
  gap: 4px;
  display: flex;
  align-items: center;
  /* min-height ≥ 30px per PRD §4 btn exception lower bound */
  min-height: 30px;
}

.topbar__locale-label {
  font-size: 12px;
  color: var(--fg-muted);
}
</style>
