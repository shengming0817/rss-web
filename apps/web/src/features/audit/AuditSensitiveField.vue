<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  readonly label: string
  readonly value: string
}>()
const { t } = useI18n()
const revealed = ref(false)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const revealButton = ref<HTMLButtonElement>()
const copyButton = ref<HTMLButtonElement>()
let generation = 0

watch(
  () => props.value,
  () => {
    generation += 1
    revealed.value = false
    copyState.value = 'idle'
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => {
  generation += 1
})

async function reveal(): Promise<void> {
  revealed.value = true
  await nextTick()
  copyButton.value?.focus()
}

async function hide(): Promise<void> {
  generation += 1
  revealed.value = false
  copyState.value = 'idle'
  await nextTick()
  revealButton.value?.focus()
}

async function copy(): Promise<void> {
  if (!revealed.value) return
  const value = props.value
  const current = ++generation
  copyState.value = 'idle'
  try {
    await navigator.clipboard.writeText(value)
    if (current === generation && revealed.value && props.value === value)
      copyState.value = 'copied'
  } catch {
    if (current === generation && revealed.value && props.value === value)
      copyState.value = 'failed'
  }
}
</script>

<template>
  <div class="sensitive-field" role="group" :aria-label="label">
    <span>{{ label }}</span>
    <button
      v-if="!revealed"
      ref="revealButton"
      type="button"
      class="v1-btn"
      data-action="reveal-sensitive"
      @click="reveal"
    >
      {{ t('auditPage.sensitive.reveal', { label }) }}
    </button>
    <template v-else>
      <code>{{ value }}</code>
      <button
        ref="copyButton"
        type="button"
        class="v1-btn"
        data-action="copy-sensitive"
        @click="copy"
      >
        {{ t('auditPage.sensitive.copy', { label }) }}
      </button>
      <button type="button" class="v1-btn" data-action="hide-sensitive" @click="hide">
        {{ t('auditPage.sensitive.hide', { label }) }}
      </button>
    </template>
    <span role="status" aria-live="polite">
      {{ copyState === 'idle' ? '' : t(`auditPage.sensitive.${copyState}`) }}
    </span>
  </div>
</template>

<style scoped>
.sensitive-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

code {
  overflow-wrap: anywhere;
}
</style>
