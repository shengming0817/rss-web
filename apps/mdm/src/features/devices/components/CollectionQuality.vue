<script setup lang="ts">
import { ref, watch } from 'vue'
import { UiButton } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { CollectionScope } from '../clients/asset-model'
const props = defineProps<{ device: string; id: string; scope?: CollectionScope }>()
const emit = defineEmits<{ invalidated: [reason: 'denied' | 'notFound'] }>()
const runtime = useMdm(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => [
  ...deviceBinding(runtime),
  props.device,
  props.id,
  JSON.stringify(props.scope),
])
const result = ref<Awaited<ReturnType<typeof runtime.devices.assets.collectionRun>>>()
const items = ref<Awaited<ReturnType<typeof runtime.devices.assets.collectionItems>>>()
const field = ref('')
function invalidate() {
  if (failure.value !== 'denied' && failure.value !== 'notFound') return
  result.value = undefined
  items.value = undefined
  emit('invalidated', failure.value)
}
async function load() {
  result.value = undefined
  items.value = undefined
  await run(
    () => runtime.devices.assets.collectionRun(props.device, props.id, props.scope),
    (v) => {
      result.value = v
    },
  )
  invalidate()
}
async function loadItems(key: string, offset = 0) {
  items.value = undefined
  field.value = key
  await run(
    () =>
      runtime.devices.assets.collectionItems(
        props.device,
        props.id,
        key,
        props.scope ?? { kind: 'device' },
        offset,
      ),
    (v) => {
      items.value = v
    },
  )
  invalidate()
}
watch(
  () => JSON.stringify([props.device, props.id, props.scope, ...deviceBinding(runtime)]),
  () => {
    void load()
  },
  { immediate: true },
)
</script>
<template>
  <article class="console-panel" :data-collection-run="id" :aria-busy="busy">
    <h3>{{ t('devices.latestRun') }} · {{ id }}</h3>
    <UiButton :disabled="busy" @click="load">{{ t('devices.reload') }}</UiButton>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <template v-if="result">
      <p>{{ t('devices.runResult.' + result.quality.result) }} · {{ result.reason ?? '—' }}</p>
      <dl>
        <dt>{{ t('devices.source') }}</dt>
        <dd>{{ result.quality.source }} / {{ result.quality.channel }}</dd>
        <dt>{{ t('devices.collectionTemplate') }}</dt>
        <dd>{{ result.quality.dataset }} / {{ result.quality.templateVersion }}</dd>
        <dt>{{ t('devices.coverage') }}</dt>
        <dd>
          {{ result.quality.coverage.id }} / {{ result.quality.coverage.version }} /
          {{ result.quality.coverage.definition }}
        </dd>
        <dt>{{ t('devices.complete') }}</dt>
        <dd>{{ t(result.quality.complete ? 'devices.yes' : 'devices.no') }}</dd>
        <dt>{{ t('devices.observed') }}</dt>
        <dd>{{ result.startedAt }} · {{ result.finishedAt ?? '—' }}</dd>
        <dt>{{ t('devices.deliveryPending') }}</dt>
        <dd>{{ t(result.quality.deliveryPending ? 'devices.yes' : 'devices.no') }}</dd>
        <dt>{{ t('devices.projectionStatus') }}</dt>
        <dd>{{ t('devices.projection.' + result.delivery.projection) }}</dd>
        <dt>{{ t('devices.received') }}</dt>
        <dd>{{ result.delivery.receipt?.receivedAt ?? '—' }}</dd>
      </dl>
      <ul>
        <li v-for="quality in result.quality.fields" :key="quality.field">
          {{ quality.field }} · {{ t('devices.quality.' + quality.quality) }} ·
          {{ quality.reason ?? '—' }} · {{ quality.status ?? '—' }} · {{ quality.receivedAt ?? '—'
          }}<template v-if="quality.itemCount">
            · {{ t('devices.invalidItems') }} {{ quality.invalidItems }} / {{ quality.itemCount
            }}<UiButton
              :disabled="busy || result.finishedAt === null"
              @click="loadItems(quality.field)"
              >{{ t('devices.itemQuality') }}</UiButton
            ></template
          >
        </li>
      </ul>
      <div v-if="items">
        <h4>{{ t('devices.itemQuality') }} · {{ field }}</h4>
        <ol>
          <li v-for="item in items.items" :key="item.index">
            {{ item.index }} · {{ t('devices.quality.' + item.quality) }}
          </li>
        </ol>
        <UiButton
          v-if="items.nextOffset !== null"
          :disabled="busy"
          @click="loadItems(field, items.nextOffset)"
          >{{ t('devices.next') }}</UiButton
        >
      </div>
    </template>
  </article>
</template>
