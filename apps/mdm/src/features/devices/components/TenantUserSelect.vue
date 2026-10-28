<script setup lang="ts">
import { VAlert, VAutocomplete, VBtn } from 'vuetify/components'
import { computed, onMounted } from 'vue'
import { useAccountDirectory } from '@rss/auth'
import AccountQueryControls from '@rss/auth/account-query'
import { useI18n } from 'vue-i18n'
const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t } = useI18n()
const {
  rows,
  query,
  busy,
  error,
  errorMessage,
  trail,
  previous,
  next,
  load,
  navigate,
  run,
  detail,
} = useAccountDirectory()
const options = computed(() => [
  ...(props.modelValue && !rows.value.some((a) => a.principalId === props.modelValue)
    ? [{ value: props.modelValue, label: t('devices.linkedPerson'), disabled: false }]
    : []),
  ...rows.value.map((a) => ({
    value: a.principalId,
    label: `${a.displayName ?? a.email ?? a.login ?? a.principalId}${a.profileStatus ? ' · ' + a.profileStatus : ''}${a.departmentStatus ? ' · ' + a.departmentStatus : ''}`,
    disabled: a.enabled === false || a.memberActive === false,
  })),
])
async function choose(value: unknown) {
  if (typeof value !== 'string' || !value) {
    emit('update:modelValue', '')
    return
  }
  await run(async () => {
    const account = await detail({ principalId: value })
    if (account.enabled && account.memberActive) emit('update:modelValue', value)
  })
}
onMounted(() => {
  void run(() => load())
})
</script>
<template>
  <AccountQueryControls
    :query="query"
    departments
    :busy="busy || !!disabled"
    :previous="!!trail.length"
    :next="!!next"
    @change="Object.assign(query, $event)"
    @apply="run(() => load())"
    @first="run(() => navigate())"
    @previous="run(() => navigate(previous))"
    @next="run(() => navigate(next ?? undefined))"
  />
  <VAutocomplete
    no-filter
    :model-value="modelValue"
    :label="t('registration.user')"
    :items="options"
    item-title="label"
    item-value="value"
    :item-props="(item) => ({ disabled: !!item.disabled })"
    :no-data-text="t('devices.empty')"
    :disabled="!!disabled || busy"
    @update:model-value="choose"
  />
  <VAlert v-if="error" type="error" variant="tonal" role="alert">{{ errorMessage }}</VAlert>
  <VBtn type="button" :disabled="!!disabled || busy" @click="emit('update:modelValue', '')">{{
    t('registration.empty')
  }}</VBtn>
</template>
