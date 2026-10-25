<script setup lang="ts">
import { comparison as queryComparison, allOf } from '../../../services/directory-query'
import { computed, ref, watch } from 'vue'
import { UiButton, UiPopover } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { GroupRead } from '../clients/groups'
const props = defineProps<{
  modelValue: string
  assetContext: 'endpoint' | 'associated_device'
  referenceableFor?: string | undefined
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
const open = ref(false)
const rows = ref<GroupRead['group'][]>([]),
  search = ref(''),
  next = ref<string | null>(null)
const label = computed(
  () =>
    rows.value.find((g) => g.id === props.modelValue)?.presentation.name ??
    t(props.modelValue ? 'devices.referencedGroup' : 'devices.select'),
)
function select(value: string) {
  emit('update:modelValue', value)
  open.value = false
}
async function load(more = false) {
  await run(
    () =>
      runtime.devices.groups.list({
        filter: allOf(
          search.value ? queryComparison('name', '=icontains=', search.value) : undefined,
          props.assetContext
            ? queryComparison('assetContext', '==', props.assetContext)
            : undefined,
        ),
        referenceableFor: props.referenceableFor,
        cursor: more ? (next.value ?? undefined) : undefined,
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
    <UiPopover v-model:open="open" :label="label" :close-label="t('console.close')">
      <div class="group-picker-content">
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
        }}</UiButton>
        <UiButton
          v-for="group in rows"
          :key="group.id"
          :disabled="disabled || busy"
          :aria-pressed="modelValue === group.id"
          variant="ghost"
          @click="select(group.id)"
          >{{ group.presentation.name }}</UiButton
        >
        <p v-if="!rows.length && !busy">{{ t('devices.empty') }}</p>
        <UiButton v-if="next" :disabled="disabled || busy" @click="load(true)">{{
          t('devices.next')
        }}</UiButton>
        <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
      </div>
    </UiPopover>
  </div>
</template>
