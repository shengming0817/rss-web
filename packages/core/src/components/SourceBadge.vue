<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SourceMeta } from '@rss/shared'

const props = defineProps<{ readonly source: SourceMeta }>()
const { t } = useI18n()
const label = computed(() => t(`source.${props.source.kind}`))
</script>

<template>
  <span
    class="source-badge"
    :data-source="source.kind"
    :aria-label="t('source.label', { source: label })"
  >
    {{ label }}
  </span>
</template>

<style scoped>
.source-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  color: var(--fg-muted);
  background: var(--bg-sunken);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.5;
  white-space: nowrap;
}

.source-badge[data-source='rss'] {
  color: var(--accent);
  border-color: var(--accent-soft);
}

.source-badge[data-source='mock'] {
  color: var(--warning, #8a5a00);
}
</style>
