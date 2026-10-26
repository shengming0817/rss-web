<script setup lang="ts">
import {
  VMenu,
  VBtn,
  VCard,
  VCardText,
  VTextField,
  VList,
  VListItem,
  VAlert,
} from 'vuetify/components'
import { comparison as queryComparison, allOf } from '../../../services/directory-query'
import { computed, ref, watch } from 'vue'
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
  <v-menu v-model="open" :close-on-content-click="false" max-width="560">
    <template #activator="{ props: activator }"
      ><v-btn v-bind="activator" :disabled="!!disabled" variant="outlined">{{
        label
      }}</v-btn></template
    >
    <v-card
      ><v-card-text>
        <v-text-field
          v-model="search"
          type="search"
          :label="t('devices.findGroup')"
          :disabled="disabled || busy"
          @keydown.enter.prevent="load()"
        />
        <v-btn :disabled="disabled || busy" @click="load()">{{ t('devices.searchGroups') }}</v-btn>
        <v-list :aria-label="t('devices.findGroup')"
          ><v-list-item
            v-for="group in rows"
            :key="group.id"
            :disabled="disabled || busy"
            :active="modelValue === group.id"
            :title="group.presentation.name"
            @click="select(group.id)"
        /></v-list>
        <p v-if="!rows.length && !busy">{{ t('devices.empty') }}</p>
        <v-btn v-if="next" :disabled="disabled || busy" @click="load(true)">{{
          t('devices.next')
        }}</v-btn>
        <v-alert v-if="failure" type="error" variant="tonal">{{ t('devices.' + failure) }}</v-alert>
      </v-card-text></v-card
    >
  </v-menu>
</template>
