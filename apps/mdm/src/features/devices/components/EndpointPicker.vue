<script setup lang="ts">
import { VBtn, VTextField, VCheckbox, VAlert } from 'vuetify/components'
import { comparison } from '../../../services/directory-query'
import { computed, ref, watch } from 'vue'
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
      type="search"
      :label="t('devices.directorySearch')"
      @keydown.enter.prevent="load()"
    />
    <v-btn type="button" :disabled="busy" @click="load()">{{ t('devices.searchGroups') }}</v-btn>
    <p>{{ t('devices.selectedDevices') }}: {{ model.length }}</p>
    <v-checkbox
      class="field-choice"
      v-for="endpoint in choices"
      :key="endpoint.id"
      :model-value="model.includes(endpoint.id)"
      :label="label(endpoint)"
      :hint="endpoint.id"
      persistent-hint
      @update:model-value="toggle(endpoint.id)"
    />
    <v-alert v-if="failure" type="error" variant="tonal">{{ t('devices.' + failure) }}</v-alert>
    <v-btn v-if="next" type="button" :disabled="busy" @click="load(true)">{{
      t('devices.next')
    }}</v-btn>
  </section>
</template>
