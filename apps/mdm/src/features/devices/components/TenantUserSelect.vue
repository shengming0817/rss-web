<script setup lang="ts">
import { ref } from 'vue'
import { useIdentity } from '@rss/auth'
import { useI18n } from 'vue-i18n'
import { useOperation } from '../../../services/useOperation'
defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n(),
  { api } = useIdentity(),
  { run, busy, failure } = useOperation()
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
load()
</script>
<template>
  <label
    >{{ t('registration.user') }}
    <select
      :value="modelValue"
      :disabled="disabled || busy"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ t('registration.empty') }}</option>
      <option
        v-if="modelValue && !accounts.some((a) => a.principalId === modelValue)"
        :value="modelValue"
      >
        {{ modelValue }}
      </option>
      <option
        v-for="a in accounts"
        :key="a.principalId"
        :value="a.principalId"
        :disabled="!a.enabled || !a.memberActive"
      >
        {{ a.login ?? a.principalId }}
      </option>
    </select>
  </label>
  <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
  <button type="button" :disabled="disabled || busy" @click="load()">
    {{ t('devices.reload') }}
  </button>
  <button v-if="cursor" type="button" :disabled="disabled || busy" @click="load(true)">
    {{ t('registration.more') }}
  </button>
</template>
