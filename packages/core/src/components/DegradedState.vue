<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { UNAVAILABLE_SOURCE } from '@rss/shared'
import type { SafeErrorPresentation } from './error-presentation'
import ErrorPage from './ErrorPage.vue'
import SourceBadge from './SourceBadge.vue'

export type DegradedRecovery = 'none' | 'retryRead'

const props = withDefaults(
  defineProps<{
    readonly error: SafeErrorPresentation
    readonly recovery: DegradedRecovery
    readonly recoveryBusy?: boolean
    readonly headingLevel?: 1 | 2 | 3
    readonly headingId?: string
  }>(),
  { recoveryBusy: false, headingLevel: 1 },
)
const emit = defineEmits<{ retryRead: [] }>()
const { t } = useI18n()

const allowsRetryRead = computed(() => props.recovery === 'retryRead')
const displayedError = computed<SafeErrorPresentation>(() =>
  allowsRetryRead.value
    ? Object.freeze({ ...props.error, recovery: 'retry' as const })
    : props.error,
)
const errorPageProps = computed(() => ({
  error: displayedError.value,
  headingLevel: props.headingLevel ?? 1,
  showRecovery: allowsRetryRead.value,
  recoveryBusy: props.recoveryBusy ?? false,
  ...(props.headingId === undefined ? {} : { headingId: props.headingId }),
}))
</script>

<template>
  <div class="degraded-state" role="group" :aria-label="t('degradedState.label')">
    <SourceBadge :source="UNAVAILABLE_SOURCE" />
    <ErrorPage v-bind="errorPageProps" @recover="emit('retryRead')" />
  </div>
</template>

<style scoped>
.degraded-state {
  display: grid;
  gap: 8px;
  justify-items: start;
}
</style>
