<script setup lang="ts">
/**
 * UnavailablePanel — renders a muted status panel for degraded/unavailable states.
 *
 * Used for runtime metrics (BR-001 not yet available), tasks, groups, and AI tabs.
 * role="status" is a live region so screen readers announce the unavailability
 * without requiring keyboard focus.
 */
defineProps<{
  title?: string
  message: string
}>()
</script>

<template>
  <div class="panel" role="status">
    <p v-if="title" class="panel__title">{{ title }}</p>
    <p class="panel__message">{{ message }}</p>
  </div>
</template>

<style scoped>
.panel {
  padding: 16px;
  color: var(--fg-muted);
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  background: var(--bg-sunken);
}

.panel__title {
  margin: 0 0 4px;
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--fg-muted);
}

.panel__message {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}
</style>
