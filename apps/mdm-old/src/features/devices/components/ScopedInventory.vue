<script setup lang="ts">
import {
  VBtn,
  VSelect,
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelTitle,
  VExpansionPanelText,
} from 'vuetify/components'
import { ref, watch, computed } from 'vue'

import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { ViewEndpoint } from '../clients/endpoint-model'
import type { CollectionScope, Inventory } from '../clients/asset-model'
import AssetValue from './AssetValue.vue'
import AssetItems from './AssetItems.vue'
import CollectionQuality from './CollectionQuality.vue'
const props = defineProps<{ endpoints: ViewEndpoint[] }>()
const emit = defineEmits<{ invalidated: [reason: 'denied' | 'notFound'] }>()
const runtime = useMdm(),
  { t } = useI18n()
const device = ref(''),
  selected = ref(''),
  scopes = ref<CollectionScope[]>([]),
  next = ref<string | null>(null)
const inventory = ref<Inventory>(),
  runId = ref('')
const page = ref<Awaited<ReturnType<typeof runtime.devices.assets.listItems>>>()
const activeList = ref<{ field: string; cursor: string }>()
const scope = computed(() => scopes.value.find((x) => JSON.stringify(x) === selected.value))
const { run, busy, failure } = useOperation([], () => [
  ...deviceBinding(runtime),
  device.value,
  selected.value,
])
function label(value: CollectionScope) {
  const { kind, ...coordinates } = value
  return (
    t('devices.scopeKind.' + kind) +
    ' · ' +
    Object.values(coordinates)
      .map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x)))
      .join(' / ')
  )
}
function invalidateQuality(reason: 'denied' | 'notFound') {
  inventory.value = undefined
  page.value = undefined
  scopes.value = []
  selected.value = ''
  next.value = null
  runId.value = ''
  emit('invalidated', reason)
}
function invalidate() {
  const reason = failure.value
  if (!['denied', 'notFound', 'conflict', 'cursorInvalidated'].includes(reason ?? '')) return
  inventory.value = undefined
  page.value = undefined
  scopes.value = []
  selected.value = ''
  next.value = null
  runId.value = ''
  failure.value = reason
  if (reason === 'denied' || reason === 'notFound') emit('invalidated', reason)
}
async function directory(more = false) {
  const cursor = more ? (next.value ?? undefined) : undefined
  if (!more) {
    scopes.value = []
    selected.value = ''
    inventory.value = undefined
    page.value = undefined
    runId.value = ''
  }
  if (!device.value) return
  await run(
    () => runtime.devices.assets.scopes(device.value, cursor),
    (value) => {
      scopes.value = more ? [...scopes.value, ...value.items] : value.items
      next.value = value.nextCursor
    },
  )
  invalidate()
}
async function read() {
  inventory.value = undefined
  page.value = undefined
  runId.value = ''
  if (!scope.value || !device.value) return
  await run(
    () => runtime.devices.assets.inventory(device.value, scope.value!),
    (value) => {
      inventory.value = value
    },
  )
  invalidate()
}
async function list(field: string, cursor: string) {
  page.value = undefined
  activeList.value = { field, cursor }
  if (!scope.value) return
  await run(
    () => runtime.devices.assets.listItems(device.value, field, scope.value!, cursor),
    (value) => {
      page.value = value
    },
  )
  invalidate()
}
watch(
  () => JSON.stringify([props.endpoints.map((e) => e.id), ...deviceBinding(runtime)]),
  () => {
    device.value = props.endpoints.length === 1 ? props.endpoints[0]!.id : ''
    scopes.value = []
    selected.value = ''
    inventory.value = undefined
    page.value = undefined
    runId.value = ''
    if (device.value) void directory()
  },
  { immediate: true },
)
watch(selected, () => {
  void read()
})
</script>
<template>
  <section class="console-panel" :aria-busy="busy" data-testid="scope-inventory">
    <h2>{{ t('devices.scopedInventory') }}</h2>
    <p>{{ t('devices.trustedAssetsNote') }}</p>
    <p>{{ t('devices.scopeDirectoryNote') }}</p>
    <v-select
      v-model="device"
      :label="t('devices.originalEndpoint')"
      :disabled="busy"
      :items="[
        { title: t('devices.select'), value: '' },
        ...endpoints.map((e) => ({ title: e.id, value: e.id })),
      ]"
      @update:model-value="directory()"
    />
    <v-btn :disabled="busy || !device" @click="directory()">{{ t('devices.reloadScopes') }}</v-btn>
    <v-select
      v-model="selected"
      :label="t('devices.assetContext')"
      :disabled="busy"
      :items="[
        { title: t('devices.deviceScopeAbove'), value: '' },
        ...scopes.map((s) => ({ title: label(s), value: JSON.stringify(s) })),
      ]"
    />
    <v-btn v-if="next" :disabled="busy" @click="directory(true)">{{
      t('devices.nextScopes')
    }}</v-btn>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <template v-if="inventory"
      ><h3>{{ scope ? label(scope) : '' }}</h3>
      <v-btn :disabled="busy" @click="read">{{ t('devices.reload') }}</v-btn>
      <dl>
        <template v-for="field in inventory.fields" :key="field.field"
          ><dt>{{ field.field }}</dt>
          <dd><AssetValue :field="field" /></dd
        ></template>
      </dl>
      <v-expansion-panels multiple>
        <v-expansion-panel v-for="(summary, field) in inventory.lists" :key="field">
          <v-expansion-panel-title
            >{{ field }} · {{ t('devices.state.' + summary.state.kind) }}</v-expansion-panel-title
          >
          <v-expansion-panel-text>
            <div v-for="source in summary.sources" :key="source.cursor">
              <p>
                {{ source.evidence.source }} / {{ source.evidence.dataset }} ·
                {{ source.evidence.observedAt }} · {{ t('devices.state.' + source.state.kind) }}
              </p>
              <v-btn
                v-if="source.state.kind === 'known'"
                :disabled="busy"
                @click="list(String(field), source.cursor)"
                >{{ t('devices.expandSource') }}</v-btn
              >
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <div v-if="page">
        <h4>{{ activeList?.field }} · {{ page.total }}</h4>
        <AssetItems :items="page.items" :complete-empty="page.total === 0" /><v-btn
          v-if="page.nextCursor"
          :disabled="busy"
          @click="list(activeList!.field, page.nextCursor)"
          >{{ t('devices.next') }}</v-btn
        >
      </div>
      <ul>
        <li v-for="quality in inventory.quality" :key="quality.runId">
          {{ quality.dataset }} / {{ quality.templateVersion }} ·
          {{ t('devices.runResult.' + quality.result)
          }}<v-btn :disabled="busy" @click="runId = quality.runId">{{
            t('devices.evidence')
          }}</v-btn>
        </li>
      </ul>
      <CollectionQuality
        v-if="runId && scope"
        :id="runId"
        :key="runId + selected"
        :device="device"
        :scope="scope"
        @invalidated="invalidateQuality"
      />
    </template>
  </section>
</template>
