<script setup lang="ts">
/**
 * ObservabilityErrorBoundary — render-error boundary for the /observe tab panels
 * (T703 safety net). onErrorCaptured isolates a thrown panel so it cannot tear
 * down the whole view; the user can retry, which remounts the slot via :key.
 *
 * The alert is built with a render function (h) rather than inline template: a
 * thrown slot and the alert cannot share the same compiled block tree without
 * crashing Vue's block patching (patchBlockChildren) during the transition.
 * Because h()-created nodes do NOT receive this SFC's scope-id, their styles live
 * in the unscoped <style> block below (class names namespaced to obs-boundary*).
 */
import { ref, nextTick, onErrorCaptured, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { UnavailablePanel } from '@gocell/core'

const { t } = useI18n()

const failed = ref(false)
const retryKey = ref(0)
const slotRoot = ref<HTMLElement | null>(null)
const alertEl = ref<HTMLElement | null>(null)

onErrorCaptured(() => {
  failed.value = true
  // Move focus into the alert container so screen readers announce the error
  // immediately (WCAG 2.4.3 / APG alert pattern).
  void nextTick(() => alertEl.value?.focus())
  return false
})

function retry(): void {
  failed.value = false
  retryKey.value += 1
  // The retry button is being unmounted; restore focus to the slot wrapper so it
  // does not fall back to <body> (WCAG 2.4.3).
  void nextTick(() => slotRoot.value?.focus())
}

function renderAlert() {
  return h(
    'div',
    {
      role: 'alert',
      class: 'obs-boundary',
      tabindex: '-1',
      ref: alertEl,
    },
    [
      h(UnavailablePanel, {
        title: t('observe.boundary.title'),
        message: t('observe.boundary.message'),
      }),
      h(
        'button',
        { type: 'button', class: 'obs-boundary__retry', onClick: retry },
        t('observe.boundary.retry'),
      ),
    ],
  )
}
</script>

<template>
  <div class="obs-boundary-root">
    <component :is="renderAlert" v-if="failed" />
    <div v-else ref="slotRoot" :key="retryKey" tabindex="-1" class="obs-boundary__slot">
      <slot />
    </div>
  </div>
</template>

<!--
  Unscoped on purpose: the .obs-boundary / .obs-boundary__retry nodes are produced
  by the renderAlert() render function, which does not receive this SFC's scope-id,
  so a scoped block would silently fail to style them. Class names are namespaced.
-->
<style>
.obs-boundary {
  padding: 16px;
}

.obs-boundary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.obs-boundary__retry {
  margin-top: 12px;
  height: 30px;
  padding: 0 14px;
  font-size: var(--text-base);
  color: var(--fg);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r);
  cursor: pointer;
}

.obs-boundary__retry:hover {
  background: var(--bg-sunken);
}

.obs-boundary__retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>

<style scoped>
.obs-boundary__slot:focus-visible {
  outline: none;
}
</style>
