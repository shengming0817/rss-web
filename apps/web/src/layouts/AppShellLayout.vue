<script setup lang="ts">
/**
 * AppShellLayout — dashboard chrome (Sidebar + TopBar + CommandPalette).
 *
 * Parent route for every authenticated/in-shell page; its <RouterView/> renders
 * the matched child. Standalone full-screen routes (login, first-run-setup) are
 * NOT children of this layout — they render directly in App.vue's RouterView,
 * so the layout fork is structural (route tree), not a runtime meta flag.
 *
 * The command-palette / sidebar UI state and global shortcuts live here rather
 * than in App.vue because they only make sense inside the shell.
 *
 * Access-denied notice: the route guard pushes a PDP deny reasonCode into
 * useUiStore; here we localise it and render it into an aria-live region so
 * screen readers announce the denial (the guard itself stays UI/i18n-free).
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppShell } from '@gocell/core'
import { useUiStore } from '../stores/useUiStore'
import { useGlobalShortcuts } from '../composables/useGlobalShortcuts'

const uiStore = useUiStore()
const { t, te } = useI18n()

// Registers cleanup via onScopeDispose internally — no explicit teardown needed.
useGlobalShortcuts()

// Auto-dismiss the deny notice after it has had time to be read / announced.
const DENY_DISMISS_MS = 6000
const denyText = ref('')
let dismissTimer: ReturnType<typeof setTimeout> | undefined

function resetTimer(): void {
  if (dismissTimer !== undefined) {
    clearTimeout(dismissTimer)
    dismissTimer = undefined
  }
}

watch(
  () => [uiStore.accessDeniedReasonCode, uiStore.accessDeniedNoticeSeq] as const,
  ([reasonCode]) => {
    resetTimer()
    if (reasonCode === null) {
      denyText.value = ''
      return
    }
    // Unknown reasonCode (e.g. a future backend code without a key) → generic
    // deny text rather than leaking the raw i18n key to the user.
    const key = `access.pdp.deny.${reasonCode}`
    denyText.value = te(key) ? t(key) : t('access.pdp.deny.error')
    dismissTimer = setTimeout(() => uiStore.clearAccessDenied(), DENY_DISMISS_MS)
  },
  { immediate: true },
)

onBeforeUnmount(resetTimer)
</script>

<template>
  <AppShell
    v-model:command-palette-open="uiStore.commandPaletteOpen"
    v-model:sidebar-collapsed="uiStore.sidebarCollapsed"
  >
    <RouterView />
  </AppShell>

  <!--
    PDP deny notice. role="alert" + aria-live="assertive" so screen readers
    announce the denial immediately (WCAG 4.1.3). Non-interactive + auto-dismiss,
    so no focus management is required.
  -->
  <div v-if="denyText" class="gc-access-denied" role="alert" aria-live="assertive">
    {{ denyText }}
  </div>
</template>

<style scoped>
.gc-access-denied {
  position: fixed;
  inset-block-end: 16px;
  inset-inline: 0;
  margin-inline: auto;
  width: fit-content;
  max-width: 90vw;
  padding: 10px 16px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--err);
  border-radius: var(--r);
  box-shadow: var(--shadow);
  z-index: var(--z-modal);
}
</style>
