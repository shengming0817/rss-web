<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
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
const page = ref<Awaited<ReturnType<typeof runtime.devices.views.items>>>()
async function load(next?: string) {
  page.value = undefined
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
    <button v-if="source.state.kind === 'known'" :disabled="busy" @click="load()">
      {{ t('devices.expandSource') }}
    </button>
    <ol v-if="page">
      <li v-for="(item, index) in page.items" :key="index">
        <pre>{{ JSON.stringify(item, null, 2) }}</pre>
      </li>
    </ol>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
  </section>
</template>
