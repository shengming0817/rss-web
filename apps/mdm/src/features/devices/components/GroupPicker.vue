<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

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
import { comparison as queryComparison, allOf } from '@rss/api/mdm-query'
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

const groupQuery = useDirectoryQuery(
  [
    'id',
    'kind',
    'systemSelector',
    'assetContext',
    'calculationRevision',
    'presentation',
    'revision',
    'memberVersion',
    'memberCount',
    'ruleVersion',
    'deleted',
  ],
  1000,
)

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
const projectedGroups = ref<object[]>([])
async function readGroup(id: string) {
  if (props.disabled || busy.value) return
  await run(
    () => runtime.devices.groups.read(id),
    (value) => {
      rows.value = [value.group]
      select(value.group.id)
    },
  )
}
async function load(after?: string) {
  await run(
    () =>
      groupQuery.read(
        after,
        (query) =>
          runtime.devices.groups.list({ ...query, referenceableFor: props.referenceableFor }),
        {
          filter: allOf(
            search.value ? queryComparison('name', '=icontains=', search.value) : undefined,
            props.assetContext
              ? queryComparison('assetContext', '==', props.assetContext)
              : undefined,
          ),
        },
      ),
    (value) => {
      projectedGroups.value = value.items
      rows.value = groupQuery.complete.value ? value.items : []
      next.value = value.nextCursor
    },
  )
}
groupQuery.bind(() => JSON.stringify([props.assetContext, props.referenceableFor]))
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
groupQuery.onClear(() => {
  rows.value = []
  projectedGroups.value = []
})
</script>
<template>
  <DirectoryControls
    :query="groupQuery"
    :busy="busy"
    hint="id / revision / kind / assetContext / deleted / name / memberCount / calculationRevision / memberVersion"
    @load="load"
  />
  <DirectoryResults
    v-if="!groupQuery.complete.value"
    :disabled="busy"
    :items="projectedGroups"
    @open="
      (row) => {
        readGroup(String(row.id))
      }
    "
  />

  <div class="group-picker">
    <v-menu v-model="open" :close-on-content-click="false" max-width="560">
      <template #activator="{ props: activator }"
        ><v-btn v-bind="activator" :disabled="!!disabled" variant="outlined">{{
          label
        }}</v-btn></template
      >
      <v-card
        ><v-card-text class="group-picker-content">
          <v-text-field
            v-model="search"
            type="search"
            :label="t('devices.findGroup')"
            :disabled="disabled || busy"
            @keydown.enter.prevent="load()"
          />
          <v-btn :disabled="disabled || busy" @click="load()">{{
            t('devices.searchGroups')
          }}</v-btn>
          <v-list :aria-label="t('devices.findGroup')"
            ><v-list-item
              v-for="group in rows"
              :key="group.id"
              tag="button"
              :disabled="disabled || busy"
              :active="modelValue === group.id"
              :title="group.presentation.name"
              @click="select(group.id)"
          /></v-list>
          <p v-if="!rows.length && !busy">{{ t('devices.empty') }}</p>

          <v-alert v-if="failure" type="error" variant="tonal">{{
            t('devices.' + failure)
          }}</v-alert>
        </v-card-text></v-card
      >
    </v-menu>
  </div>
</template>
