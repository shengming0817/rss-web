<script setup lang="ts">
import { VAutocomplete, VBtn, VAlert } from 'vuetify/components'
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
    ? [{ value: props.modelValue, label: t('devices.linkedPerson'), disabled: false }]
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
  <v-autocomplete
    :model-value="modelValue"
    :label="t('registration.user')"
    :items="options"
    item-title="label"
    item-value="value"
    :item-props="(item) => ({ disabled: item.disabled })"
    :no-data-text="t('devices.empty')"
    :disabled="disabled || busy"
    @update:model-value="emit('update:modelValue', $event ?? '')"
  />
  <p>{{ t('devices.loadedPeopleOnly') }}</p>
  <v-alert v-if="failure" type="error" variant="tonal">{{ t('devices.' + failure) }}</v-alert>
  <div class="console-toolbar">
    <v-btn type="button" :disabled="disabled || busy" @click="emit('update:modelValue', '')">{{
      t('registration.empty')
    }}</v-btn
    ><v-btn type="button" :disabled="disabled || busy" @click="load()">{{
      t('devices.reload')
    }}</v-btn
    ><v-btn v-if="cursor" type="button" :disabled="disabled || busy" @click="load(true)">{{
      t('registration.more')
    }}</v-btn>
  </div>
</template>
