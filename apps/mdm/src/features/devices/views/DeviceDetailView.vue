<script setup lang="ts">
import { UiButton, UiTabs, UiDialog } from '@rss/core/components'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import { objectRef } from '../clients/objects'
import type { DeviceView } from '../clients/device-views'
import type { EndpointDetail } from '../clients/endpoint-model'
import type { FieldDefinition, Inventory } from '../clients/assets'
import type { Association } from '../clients/associations'
import PageFrame from '../../../components/PageFrame.vue'
import ViewFacts from '../components/ViewFacts.vue'
import PersonnelPanel from '../components/PersonnelPanel.vue'
import ScopedInventory from '../components/ScopedInventory.vue'
import ManualPanel from '../components/ManualPanel.vue'
import AssociationPanel from '../components/AssociationPanel.vue'
import DeviceControlPanel from '../components/DeviceControlPanel.vue'
import RegistrationPanel from '../components/RegistrationPanel.vue'
const runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  { t } = useI18n()
const reference = computed(() =>
  objectRef(
    route.name === 'device-detail'
      ? { kind: 'endpoint', id: route.params['device'] }
      : { kind: route.params['kind'], id: route.params['view'] },
  ),
)
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const view = ref<DeviceView>(),
  endpoints = ref<EndpointDetail[]>([]),
  fields = ref<FieldDefinition[]>([])
const tab = ref('inventory'),
  target = ref(''),
  manualOpen = ref(false),
  inventory = ref<Inventory>()
const history = ref<Awaited<ReturnType<typeof runtime.devices.directory.history>>>()
const selected = computed(() => endpoints.value.find((e) => e.id === target.value))
const directoryQuery = computed(() => {
  try {
    const value: unknown = JSON.parse(String(route.query['directory'] ?? '{}'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        ([k, v]) =>
          [
            'search',
            'platform',
            'assetState',
            'limit',
            'status',
            'channel',
            'source',
            'descending',
            'cursor',
            'columns',
            'trail',
          ].includes(k) &&
          (typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'))),
      ),
    )
  } catch {
    return {}
  }
})
const displayName = computed(() => {
  const state =
    view.value?.endpoints[0]?.displayName?.state ?? view.value?.fields['device.name']?.state
  return state?.kind === 'known' && state.value.kind === 'string'
    ? state.value.value
    : reference.value.id
})
function clear() {
  view.value = undefined
  endpoints.value = []
  fields.value = []
  history.value = undefined
  inventory.value = undefined
  manualOpen.value = false
}
async function load() {
  view.value = undefined
  endpoints.value = []
  await run(
    async () => {
      const value = await runtime.devices.views.detail(reference.value)
      const details = await Promise.all(
        value.endpoints.map((e) => runtime.devices.directory.detail(e.id)),
      )
      return { value, details }
    },
    (result) => {
      view.value = result.value
      endpoints.value = result.details
      if (!result.details.some((e) => e.id === target.value))
        target.value = result.details.some((e) => e.id === route.query['operationDevice'])
          ? String(route.query['operationDevice'])
          : result.details.length === 1
            ? result.details[0]!.id
            : ''
    },
  )
}
async function loadHistory(next?: string) {
  if (!target.value) return
  await run(
    () => runtime.devices.directory.history(target.value, next),
    (v) => (history.value = v),
  )
}
async function editManual() {
  if (!target.value) return
  if (inventory.value?.device === target.value) {
    manualOpen.value = true
    return
  }
  await run(
    async () => ({
      inventory: await runtime.devices.assets.inventory(target.value),
      catalog: await runtime.devices.assets.catalog(),
    }),
    (v) => {
      inventory.value = v.inventory
      fields.value = v.catalog.fields
      manualOpen.value = true
    },
  )
}
async function changed(a: Association) {
  clear()
  if (a.state === 'revoked')
    await router.push({ name: 'devices', params: { tenant: runtime.tenant } })
  else
    await router.push({
      name: 'device-view-detail',
      params: { tenant: runtime.tenant, kind: 'association', view: a.id },
    })
}
function invalidated(reason: 'cursorInvalidated' | 'denied' | 'notFound') {
  clear()
  failure.value = reason
}
watch(
  () =>
    JSON.stringify([
      route.name,
      route.params['device'],
      route.params['kind'],
      route.params['view'],
      ...deviceBinding(runtime),
    ]),
  () => {
    clear()
    target.value = ''
    tab.value = route.query['operationDevice']
      ? 'management'
      : ['management', 'history'].includes(String(route.query['tab']))
        ? String(route.query['tab'])
        : 'inventory'
    void load().then(() => {
      if (tab.value === 'history') void loadHistory()
    })
  },
  { immediate: true, flush: 'sync' },
)
watch(target, () => {
  inventory.value = undefined
})
watch([tab, target], () => {
  history.value = undefined
  manualOpen.value = false
  if (tab.value === 'history') void loadHistory()
})
</script>
<template>
  <PageFrame :title="displayName" :busy="busy" :failure="failure">
    <template #actions
      ><RouterLink
        :to="{ name: 'devices', params: { tenant: runtime.tenant }, query: directoryQuery }"
        >{{ t('devices.returnDirectory') }}</RouterLink
      ><UiButton :disabled="busy" @click="load">{{ t('devices.reload') }}</UiButton></template
    >
    <template v-if="view">
      <UiTabs
        v-model="tab"
        keep-mounted
        :label="t('devices.detail')"
        :items="
          ['inventory', 'management', 'history'].map((value) => ({
            value,
            label: t('devices.' + value),
          }))
        "
      >
        <template #inventory
          ><ViewFacts :view="view" :endpoints="endpoints" @invalidated="invalidated" />
          <ScopedInventory :endpoints="view.endpoints" @invalidated="invalidated" />
          <PersonnelPanel
            v-for="endpoint in view.endpoints"
            :key="endpoint.id"
            :endpoint="endpoint"
            @changed="load"
            @invalidated="invalidated"
          />
          <section class="console-panel">
            <h2>{{ t('devices.manual') }}</h2>
            <label v-if="endpoints.length > 1"
              >{{ t('devices.originalEndpoint')
              }}<select v-model="target" class="ui-input">
                <option value="">{{ t('devices.select') }}</option>
                <option v-for="e in endpoints" :key="e.id" :value="e.id">{{ e.id }}</option>
              </select></label
            >
            <UiButton :disabled="busy || !target" @click="editManual">{{
              t('devices.editAssets')
            }}</UiButton>
          </section>
        </template>
        <template #management>
          <label v-if="endpoints.length > 1"
            >{{ t('devices.originalEndpoint')
            }}<select v-model="target" class="ui-input">
              <option value="">{{ t('devices.select') }}</option>
              <option v-for="e in endpoints" :key="e.id" :value="e.id">{{ e.id }}</option>
            </select></label
          >
          <DeviceControlPanel
            v-if="selected"
            :key="selected.id"
            :endpoint="selected"
            :device-name="displayName"
          />
          <RegistrationPanel
            v-if="selected"
            :key="selected.id"
            :endpoint="selected"
            @changed="load"
          />
          <AssociationPanel
            v-if="view.association"
            :key="view.association.id"
            :association="view.association"
            @changed="changed"
            @denied="invalidated('denied')"
          />
          <AssociationPanel
            v-else-if="selected"
            :key="selected.id"
            :endpoint="selected"
            @changed="changed"
            @denied="invalidated('denied')"
          />
          <RouterLink :to="{ name: 'policy-resources', params: { tenant: runtime.tenant } }">{{
            t('devices.collectionPackages')
          }}</RouterLink>
        </template>
        <template #history>
          <label v-if="endpoints.length > 1"
            >{{ t('devices.originalEndpoint')
            }}<select v-model="target" class="ui-input">
              <option value="">{{ t('devices.select') }}</option>
              <option v-for="e in endpoints" :key="e.id" :value="e.id">{{ e.id }}</option>
            </select></label
          >
          <UiButton :disabled="busy || !target" @click="loadHistory()">{{
            t('devices.reload')
          }}</UiButton>
          <p v-if="history">
            {{ t('devices.historyCoverage') }}:
            {{ t(history.coverage.complete ? 'devices.yes' : 'devices.no') }}
          </p>
          <ol>
            <li v-for="fact in history?.items" :key="fact.eventId">
              {{ fact.recordedAt }} · {{ fact.action }} · {{ fact.auditOutcome }} ·
              {{ fact.effect }}
              <details>
                <summary>{{ t('devices.evidence') }}</summary>
                {{ fact.registrationId ?? '—' }} · {{ fact.operationId ?? '—' }}
              </details>
            </li>
          </ol>
          <UiButton
            v-if="history?.nextCursor"
            :disabled="busy"
            @click="loadHistory(history.nextCursor)"
            >{{ t('devices.next') }}</UiButton
          >
        </template>
      </UiTabs>
    </template>
    <UiDialog
      keep-mounted
      :open="manualOpen"
      :title="t('devices.editAssets')"
      :close-label="t('console.cancel')"
      placement="right"
      @update:open="manualOpen = $event"
      ><ManualPanel
        v-if="inventory"
        :key="target"
        :device="target"
        :inventory="inventory"
        :fields="fields"
        @updated="inventory = $event"
    /></UiDialog>
  </PageFrame>
</template>
