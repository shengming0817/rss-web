<script setup lang="ts">
import { comparison } from '../../../services/directory-query'
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
async function load(more = false) {
  await run(
    () =>
      runtime.devices.views.list({
        filter: search.value ? comparison('search', '=icontains=', search.value) : undefined,
        cursor: more ? (next.value ?? undefined) : undefined,
        limit: 20,
      }),
    (value) => {
      endpoints.value = more
        ? [...endpoints.value, ...value.items.flatMap((v) => v.endpoints)]
        : value.items.flatMap((v) => v.endpoints)
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
</script>
<template>
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
    <v-btn v-if="next" type="button" :disabled="busy" @click="load(true)">{{
      t('devices.next')
    }}</v-btn>
  </section>
</template>
