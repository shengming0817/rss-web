<script setup lang="ts">
import { ref, watch } from 'vue'
import { UiButton } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { GroupRead } from '../clients/groups'
const props = defineProps<{
  modelValue: string
  assetContext: 'endpoint' | 'associated_device'
  referenceableFor?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation([], () => [
    ...deviceBinding(runtime),
    props.assetContext,
    props.referenceableFor,
  ])
const rows = ref<GroupRead['group'][]>([]),
  search = ref(''),
  next = ref<string | null>(null)
async function load(more = false) {
  await run(
    () =>
      runtime.devices.groups.list({
        name: search.value || undefined,
        assetContext: props.assetContext,
        referenceableFor: props.referenceableFor,
        after: more ? (next.value ?? undefined) : undefined,
      }),
    (value) => {
      rows.value = more ? [...rows.value, ...value.items] : value.items
      next.value = value.nextCursor
    },
  )
}
watch(
  () => JSON.stringify([...deviceBinding(runtime), props.assetContext, props.referenceableFor]),
  () => {
    rows.value = []
    next.value = null
    search.value = ''
    void load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <div class="group-picker">
    <label
      >{{ t('devices.findGroup')
      }}<input
        v-model="search"
        class="ui-input"
        type="search"
        :disabled="disabled || busy"
        @keydown.enter.prevent="load()" /></label
    ><UiButton :disabled="disabled || busy" @click="load()">{{
      t('devices.searchGroups')
    }}</UiButton
    ><select
      class="ui-input"
      :aria-label="t('devices.groups')"
      :value="modelValue"
      :disabled="disabled || busy"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ t('devices.select') }}</option>
      <option v-if="modelValue && !rows.some((g) => g.id === modelValue)" :value="modelValue">
        {{ t('devices.referencedGroup') }}
      </option>
      <option v-for="group in rows" :key="group.id" :value="group.id">
        {{ group.presentation.name }}
      </option></select
    ><UiButton v-if="next" :disabled="disabled || busy" @click="load(true)">{{
      t('devices.next')
    }}</UiButton>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  </div>
</template>
