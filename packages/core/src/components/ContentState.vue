<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    readonly state: 'loading' | 'empty' | 'unavailable'
    readonly title?: string
    readonly message?: string
    readonly retryable?: boolean
  }>(),
  { retryable: false },
)
defineEmits<{ retry: [] }>()
const { t } = useI18n()
const title = computed(() => props.title ?? t(`contentState.${props.state}.title`))
const message = computed(() => props.message ?? t(`contentState.${props.state}.message`))
</script>

<template>
  <section class="content-state" role="status" :aria-busy="state === 'loading'">
    <h2 class="content-state__title">{{ title }}</h2>
    <p class="content-state__message">{{ message }}</p>
    <button v-if="retryable" type="button" class="v1-btn" @click="$emit('retry')">
      {{ t('contentState.retry') }}
    </button>
  </section>
</template>

<style scoped>
.content-state {
  padding: 24px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  background: var(--bg-sunken);
  color: var(--fg-muted);
}

.content-state__title {
  margin: 0 0 6px;
  color: var(--fg);
  font-size: var(--text-lg);
}

.content-state__message {
  margin: 0 0 12px;
}
</style>
