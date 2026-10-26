<script setup lang="ts">
import { VBtn } from 'vuetify/components'

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import AssetItems from './AssetItems.vue'
import type { DeviceView } from '../clients/device-views'
const props = defineProps<{
  view: DeviceView
  field: string
  source: DeviceView['lists'][string]['sources'][number]
}>()
const emit = defineEmits<{ invalidated: [reason: 'cursorInvalidated' | 'denied' | 'notFound'] }>()
const { t } = useI18n(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), props.source.cursor])
const search = ref('')
const visibleItems = computed(
  () =>
    page.value?.items.filter((item) =>
      JSON.stringify(item).toLocaleLowerCase().includes(search.value.toLocaleLowerCase()),
    ) ?? [],
)
const page = ref<Awaited<ReturnType<typeof runtime.devices.views.items>>>()
async function load(next?: string) {
  page.value = undefined
  search.value = ''
  await run(
    () => runtime.devices.views.items(props.view.reference, props.field, props.source, next),
    (v) => (page.value = v),
  )
  if (
    failure.value === 'cursorInvalidated' ||
    failure.value === 'denied' ||
    failure.value === 'notFound'
  ) {
    page.value = undefined
    search.value = ''
    emit('invalidated', failure.value)
  }
}
</script>
<template>
  <section :aria-busy="busy" :data-list-endpoint="source.endpoint">
    <h4>
      {{ source.endpoint }} · {{ source.evidence.source }} · {{ source.evidence.dataset ?? '—' }}
    </h4>
    <p>
      {{ t(`devices.state.${source.state.kind}`)
      }}<template v-if="source.state.kind === 'known'"> · {{ source.state.count }}</template>
    </p>
    <p>
      {{ t('devices.registration') }}: {{ source.evidence.registration ?? '—' }} /
      {{ source.evidence.registrationGeneration ?? '—' }} · {{ t('devices.snapshot') }}:
      {{ source.evidence.snapshotId }} · {{ t('devices.observed') }}:
      {{ source.evidence.observedAt }} · {{ t('devices.received') }}:
      {{ source.evidence.receivedAt }}
    </p>
    <p v-if="source.lastKnown">
      {{ t('devices.lastKnown') }}: {{ source.lastKnown.state?.kind }} ·
      {{ source.lastKnown.evidence.snapshotId }} · {{ source.lastKnown.evidence.observedAt }}
    </p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <v-btn v-if="source.state.kind === 'known'" :disabled="!!busy" type="submit" @click="load()">
      {{ t('devices.expandSource') }}
    </v-btn>
    <label v-if="page"
      >{{ t('devices.searchLoadedPage') }}<input v-model="search" class="ui-input" type="search"
    /></label>
    <AssetItems v-if="page" :items="visibleItems" :complete-empty="page.total === 0" />
    <v-btn v-if="page?.nextCursor" :disabled="!!busy" type="submit" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </v-btn>
  </section>
</template>
