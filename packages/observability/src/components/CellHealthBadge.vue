<script lang="ts">
// Module-level const: the Set is allocated once for the module, not per instance.
const KNOWN_STATUSES = new Set(['healthy', 'degraded', 'down', 'starting', 'stopping'])
</script>

<script setup lang="ts">
/**
 * CellHealthBadge — status badge for a cell health entry.
 *
 * a11y (WCAG 1.4.1 + 1.4.3): state is conveyed by the text label, never by
 * colour alone. The variant colour lives only on the decorative dot
 * (`aria-hidden`), which is a redundant cue. Label text is rendered in --fg
 * so it passes 1.4.3 regardless of state.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CellHealthStatus } from '../api/health'
import { statusVariant } from '../lib/healthStatus'

const props = defineProps<{ status: CellHealthStatus }>()
const { t } = useI18n()

const variant = computed(() => statusVariant(props.status))
const labelKey = computed(() => {
  return KNOWN_STATUSES.has(props.status)
    ? `landing.status.${props.status}`
    : 'landing.status.unknown'
})
</script>

<template>
  <span class="badge" :class="`badge--${variant}`" :data-variant="variant">
    <span class="badge__dot" aria-hidden="true" />
    <span class="badge__label">{{ t(labelKey) }}</span>
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 8px;
  font-size: var(--text-sm);
  line-height: 1.4;
  color: var(--fg);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}

.badge__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--fg-faint);
}

.badge--ok .badge__dot {
  background: var(--ok);
}

.badge--warn .badge__dot {
  background: var(--warn);
}

.badge--err .badge__dot {
  background: var(--err);
}

.badge--neutral .badge__dot {
  background: var(--fg-faint);
}
</style>
