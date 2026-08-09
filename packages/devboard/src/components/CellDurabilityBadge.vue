<script setup lang="ts">
/**
 * CellDurabilityBadge — displays a durability mode pill.
 *
 * a11y: state is conveyed by the text label, not colour alone (WCAG 1.4.1).
 * The decorative dot carries the colour cue and is aria-hidden="true".
 * Label text is rendered in --fg (high contrast on --bg-sunken).
 * Title/tooltip provided via the title attribute for non-visual consumers.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DurabilityMode } from '../manifest/types'

const props = defineProps<{ mode: DurabilityMode }>()
const { t } = useI18n()

const label = computed(() =>
  props.mode === 'durable' ? t('cells.badge.durable') : t('cells.badge.demo'),
)
const hint = computed(() =>
  props.mode === 'durable' ? t('cells.badge.durableHint') : t('cells.badge.demoHint'),
)
</script>

<template>
  <span class="badge" :class="`badge--${mode}`" :title="hint">
    <span class="badge__dot" aria-hidden="true" />
    <span class="badge__label">{{ label }}</span>
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

.badge--durable .badge__dot {
  background: var(--ok);
}

.badge--demo .badge__dot {
  background: var(--warn);
}
</style>
