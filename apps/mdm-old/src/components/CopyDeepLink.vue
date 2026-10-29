<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VBtn, VTextField } from 'vuetify/components'
import { deepLink, type DeepLink } from '../services/deep-link'
import { useMdm } from '../context'
import { deviceBinding } from '../features/devices/useDeviceBinding'
const props = defineProps<{ target: DeepLink }>()
const { t } = useI18n(),
  runtime = useMdm(),
  status = ref<'copied' | 'copyFailed'>()
const text = computed(() => {
  try {
    return deepLink(props.target)
  } catch {
    return null
  }
})
let generation = 0
watch(
  () => JSON.stringify([props.target, ...deviceBinding(runtime)]),
  () => {
    generation++
    status.value = undefined
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  generation++
})
async function copy() {
  const current = generation,
    value = text.value
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    if (current === generation) status.value = 'copied'
  } catch {
    if (current === generation) status.value = 'copyFailed'
  }
}
</script>
<template>
  <span v-if="text" class="entry-copy">
    <v-btn type="button" variant="text" data-action="copy-deep-link" @click="copy">{{
      t('policies.entry.copy')
    }}</v-btn>
    <span v-if="status" role="status">{{ t(`policies.entry.${status}`) }}</span>
    <v-text-field
      v-if="status === 'copyFailed'"
      :label="t('policies.entry.copyText')"
      readonly
      :model-value="text"
      @focus="($event.target as HTMLInputElement).select()"
    />
  </span>
</template>
