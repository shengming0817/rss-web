<script setup lang="ts">
import { UiButton, UiCombobox } from '@rss/core/components'
import { ref, computed, watch } from 'vue'
import { useIdentity } from '@rss/auth'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { deviceBinding } from '../useDeviceBinding'
import { useOperation } from '../../../services/useOperation'
const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n(),
  { api } = useIdentity(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const accounts = ref<Awaited<ReturnType<typeof api.accounts>>['accounts']>([])
const cursor = ref<string | null>(null)
function load(more = false) {
  void run(
    () => api.accounts(more ? (cursor.value ?? undefined) : undefined),
    (v) => {
      accounts.value = more ? [...accounts.value, ...v.accounts] : v.accounts
      cursor.value = v.next
    },
  )
}
const options = computed(() => [
  ...(props.modelValue && !accounts.value.some((a) => a.principalId === props.modelValue)
    ? [{ value: props.modelValue, label: t('devices.linkedPerson') }]
    : []),
  ...accounts.value.map((a) => ({
    value: a.principalId,
    label: a.login ?? t('devices.linkedPerson'),
    disabled: !a.enabled || !a.memberActive,
  })),
])
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    accounts.value = []
    cursor.value = null
    load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <UiCombobox
    :model-value="modelValue"
    :label="t('registration.user')"
    :options="options"
    :empty-label="t('devices.empty')"
    :invalid-label="t('devices.invalidRequest')"
    :disabled="disabled || busy"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <p class="ui-help">{{ t('devices.loadedPeopleOnly') }}</p>
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <div class="console-toolbar">
    <UiButton type="button" :disabled="disabled || busy" @click="emit('update:modelValue', '')">{{
      t('registration.empty')
    }}</UiButton
    ><UiButton type="button" :disabled="disabled || busy" @click="load()">{{
      t('devices.reload')
    }}</UiButton
    ><UiButton v-if="cursor" type="button" :disabled="disabled || busy" @click="load(true)">{{
      t('registration.more')
    }}</UiButton>
  </div>
</template>
