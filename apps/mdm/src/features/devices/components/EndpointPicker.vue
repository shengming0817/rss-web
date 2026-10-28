<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import { objectRef } from '../clients/objects'
import { comparison } from '@rss/api/mdm-query'
import { computed, ref, watch } from 'vue'
import {
  VBtn,
  VTextField,
  VCheckbox,
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelTitle,
  VExpansionPanelText,
} from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { ViewEndpoint } from '../clients/endpoint-model'
const viewQuery = useDirectoryQuery(['key', 'reference', 'association', 'endpoints'], 100)

const model = defineModel<string[]>({ required: true })
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const endpoints = ref<ViewEndpoint[]>([]),
  search = ref(''),
  next = ref<string | null>(null)
const choices = computed(() => [...new Map(endpoints.value.map((e) => [e.id, e])).values()])
function label(e: ViewEndpoint) {
  return e.displayName?.state.kind === 'known' && e.displayName.state.value.kind === 'string'
    ? e.displayName.state.value.value
    : t('devices.unnamedDevice')
}
const projectedViews = ref<object[]>([])
async function readView(row: Record<string, unknown>) {
  if (!row['reference']) return
  await run(
    () => runtime.devices.views.detail(objectRef(row['reference'])),
    (value) => {
      endpoints.value = value.endpoints
    },
  )
}
async function load(after?: string) {
  await run(
    () =>
      viewQuery.read(after, (query) => runtime.devices.views.list(query), {
        filter: search.value ? comparison('search', '=icontains=', search.value) : undefined,
      }),
    (value) => {
      projectedViews.value = value.items
      endpoints.value = viewQuery.complete.value ? value.items.flatMap((v) => v.endpoints) : []
      next.value = value.nextCursor
    },
  )
}
function toggle(id: string) {
  model.value = model.value.includes(id)
    ? model.value.filter((x) => x !== id)
    : [...model.value, id]
}
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    model.value = []
    endpoints.value = []
    next.value = null
    void load()
  },
  { immediate: true, flush: 'sync' },
)
viewQuery.onClear(() => {
  endpoints.value = []
  projectedViews.value = []
})
</script>
<template>
  <DirectoryControls
    :query="viewQuery"
    :busy="busy"
    hint="key / status / assetState / channel / source / platform / search；sort: key"
    @load="load"
  />
  <DirectoryResults
    :disabled="busy"
    :required="['reference']"
    v-if="!viewQuery.complete.value"
    :items="projectedViews"
    @open="
      (row) => {
        readView(row)
      }
    "
  />

  <section class="endpoint-picker">
    <v-text-field
      v-model="search"
      :label="t('devices.directorySearch')"
      type="search"
      @keydown.enter.prevent="load()"
    /><v-btn type="button" :disabled="busy" @click="load()">{{ t('devices.searchGroups') }}</v-btn>
    <p>{{ t('devices.selectedDevices') }}: {{ model.length }}</p>
    <div v-for="endpoint in choices" :key="endpoint.id" class="field-choice">
      <v-checkbox
        :model-value="model.includes(endpoint.id)"
        :label="label(endpoint)"
        :disabled="busy"
        @update:model-value="toggle(endpoint.id)"
      />
      <v-expansion-panels
        ><v-expansion-panel>
          <v-expansion-panel-title>{{ t('devices.evidence') }}</v-expansion-panel-title>
          <v-expansion-panel-text>{{ endpoint.id }}</v-expansion-panel-text>
        </v-expansion-panel></v-expansion-panels
      >
    </div>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  </section>
</template>
