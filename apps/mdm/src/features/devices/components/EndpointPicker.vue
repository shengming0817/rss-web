<script setup lang="ts">
import { comparison } from '../../../services/directory-query'
import { computed, ref, watch } from 'vue'
import { UiButton } from '@rss/core/components'
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
    <label
      >{{ t('devices.directorySearch')
      }}<input
        v-model="search"
        class="ui-input"
        type="search"
        @keydown.enter.prevent="load()" /></label
    ><UiButton type="button" :disabled="busy" @click="load()">{{
      t('devices.searchGroups')
    }}</UiButton>
    <p>{{ t('devices.selectedDevices') }}: {{ model.length }}</p>
    <div v-for="endpoint in choices" :key="endpoint.id" class="field-choice">
      <label
        ><input
          type="checkbox"
          :checked="model.includes(endpoint.id)"
          @change="toggle(endpoint.id)"
        />
        {{ label(endpoint) }}</label
      >
      <details>
        <summary>{{ t('devices.evidence') }}</summary>
        {{ endpoint.id }}
      </details>
    </div>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <UiButton v-if="next" type="button" :disabled="busy" @click="load(true)">{{
      t('devices.next')
    }}</UiButton>
  </section>
</template>
