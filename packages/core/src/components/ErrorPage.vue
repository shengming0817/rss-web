<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SafeErrorPresentation } from './error-presentation'

const props = withDefaults(
  defineProps<{
    readonly error: SafeErrorPresentation
    readonly headingLevel?: 1 | 2 | 3
    readonly headingId?: string
    readonly showRecovery?: boolean
  }>(),
  { headingLevel: 1, showRecovery: true },
)
defineEmits<{ recover: [] }>()
const { t } = useI18n()
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const generatedHeadingId = `error-page-${useId()}`
const headingId = computed(() => props.headingId ?? generatedHeadingId)
const headingTag = computed(() => `h${props.headingLevel}` as const)
let copyGeneration = 0
const title = computed(() => t(`errorPage.${props.error.kind}.title`))
const message = computed(() => t(`errorPage.${props.error.kind}.message`))

watch(
  [() => props.error.requestId, () => props.error.code],
  () => {
    copyGeneration += 1
    copyState.value = 'idle'
  },
  { flush: 'sync' },
)

async function copyRequestId(): Promise<void> {
  if (props.error.requestId === undefined) return
  const requestId = props.error.requestId
  const generation = ++copyGeneration
  copyState.value = 'idle'
  try {
    await navigator.clipboard.writeText(requestId)
    if (generation === copyGeneration && props.error.requestId === requestId) {
      copyState.value = 'copied'
    }
  } catch {
    if (generation === copyGeneration && props.error.requestId === requestId) {
      copyState.value = 'failed'
    }
  }
}
</script>

<template>
  <section class="error-page" :aria-labelledby="headingId">
    <p class="error-page__code">{{ error.code }}</p>
    <component :is="headingTag" :id="headingId">{{ title }}</component>
    <p>{{ message }}</p>
    <p class="error-page__retryable">
      {{ error.retryable ? t('errorPage.retryable') : t('errorPage.notRetryable') }}
    </p>
    <div v-if="error.requestId" class="error-page__request">
      <span
        >{{ t('errorPage.requestId') }}: <code>{{ error.requestId }}</code></span
      >
      <button type="button" class="v1-btn" data-action="copy-request-id" @click="copyRequestId">
        {{ t('errorPage.copyRequestId') }}
      </button>
    </div>
    <p class="error-page__announcement" role="status" aria-live="polite">
      {{ copyState === 'idle' ? '' : t(`errorPage.${copyState}`) }}
    </p>
    <button
      v-if="showRecovery"
      type="button"
      class="v1-btn"
      data-action="recover"
      @click="$emit('recover')"
    >
      {{ t(`errorPage.recovery.${error.recovery}`) }}
    </button>
  </section>
</template>

<style scoped>
.error-page {
  max-width: 640px;
  padding: 32px;
}

.error-page__code {
  color: var(--fg-faint);
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.error-page__request {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
}

.error-page__announcement {
  min-height: 1.5em;
}
</style>
