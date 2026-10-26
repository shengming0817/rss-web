<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
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
import AgentConnectionObservation from '../components/AgentConnectionObservation.vue'
import AssignedConfigurations from '../../telemetry/components/AssignedConfigurations.vue'
import DeviceActivity from '../../telemetry/components/DeviceActivity.vue'
import DevicePerformance from '../../telemetry/components/DevicePerformance.vue'
import DeviceCollections from '../../telemetry/components/DeviceCollections.vue'
import '../../telemetry/telemetry.css'
import PageFrame from '../../../components/PageFrame.vue'
import ViewFacts from '../components/ViewFacts.vue'
import PersonnelPanel from '../components/PersonnelPanel.vue'
import ScopedInventory from '../components/ScopedInventory.vue'
import ManualPanel from '../components/ManualPanel.vue'
import AssociationPanel from '../components/AssociationPanel.vue'
import DeviceControlPanel from '../components/DeviceControlPanel.vue'
import CredentialsPanel from '../../security/components/CredentialsPanel.vue'
import ManagementQueries from '../components/ManagementQueries.vue'
import RegistrationPanel from '../components/RegistrationPanel.vue'
const runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  { t } = useI18n()
const reference = ref(
  objectRef(
    route.params['device']
      ? { kind: 'endpoint', id: route.params['device'] }
      : { kind: route.params['kind'], id: route.params['view'] },
  ),
)
const { run, busy, failure } = useOperation(
  [],
  () => deviceBinding(runtime),
  () => reference.value.kind + '/' + reference.value.id,
)
const view = ref<DeviceView>(),
  endpoints = ref<EndpointDetail[]>([]),
  fields = ref<FieldDefinition[]>([])
const section = computed(() =>
  String(route.name).endsWith('-management')
    ? 'management'
    : String(route.name).endsWith('-history')
      ? 'history'
      : 'inventory',
)
const historySection = computed(() => String(route.params['history'] ?? 'activity'))
function destination(section: string, history?: string) {
  const name = route.params['device'] ? 'device' : 'device-view'
  return {
    name: section === 'inventory' ? name + '-detail' : name + '-' + section,
    params: {
      tenant: runtime.tenant,
      ...(route.params['device']
        ? { device: route.params['device'] }
        : { kind: route.params['kind'], view: route.params['view'] }),
      ...(history ? { history } : {}),
    },
    query: { ...route.query, endpoint: target.value },
  }
}
const target = ref(''),
  manualOpen = ref(false),
  inventory = ref<Inventory>()
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
  inventory.value = undefined
  manualOpen.value = false
}
function syncTarget() {
  const endpoint = route.query['endpoint']
  const requested =
    endpoint === undefined && typeof route.query['operation'] === 'string'
      ? route.query['operationDevice']
      : endpoint
  target.value =
    typeof requested === 'string' && endpoints.value.some((e) => e.id === requested)
      ? requested
      : endpoints.value.length === 1
        ? endpoints.value[0]!.id
        : ''
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
      syncTarget()
    },
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
      route.params['device'],
      route.params['kind'],
      route.params['view'],
      ...deviceBinding(runtime),
    ]),
  () => {
    clear()
    target.value = ''
    if (!route.params['device'] && (!route.params['kind'] || !route.params['view'])) return
    reference.value = objectRef(
      route.params['device']
        ? { kind: 'endpoint', id: route.params['device'] }
        : { kind: route.params['kind'], id: route.params['view'] },
    )
    void load()
  },
  { immediate: true, flush: 'sync' },
)
watch(target, () => {
  inventory.value = undefined
})
function selectEndpoint(event: Event) {
  void router.replace({
    query: { ...route.query, endpoint: (event.target as HTMLSelectElement).value },
  })
}
watch(() => route.query['endpoint'], syncTarget, { flush: 'sync' })
watch(section, () => (manualOpen.value = false))
watch(target, () => {
  manualOpen.value = false
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
      <nav class="telemetry-tabs" :aria-label="t('devices.detail')">
        <RouterLink
          v-for="item in ['inventory', 'management', 'history']"
          :key="item"
          :to="destination(item, item === 'history' ? 'activity' : undefined)"
          :aria-current="section === item ? 'page' : undefined"
          >{{ t('devices.' + item) }}</RouterLink
        >
      </nav>
      <template v-if="section === 'inventory'"
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
            }}<select :value="target" class="ui-input" @change="selectEndpoint">
              <option value="">{{ t('devices.select') }}</option>
              <option v-for="e in endpoints" :key="e.id" :value="e.id">{{ e.id }}</option>
            </select></label
          >
          <UiButton :disabled="busy || !target" @click="editManual">{{
            t('devices.editAssets')
          }}</UiButton>
        </section>
      </template>
      <template v-else-if="section === 'management'">
        <label v-if="endpoints.length > 1"
          >{{ t('devices.originalEndpoint')
          }}<select :value="target" class="ui-input" @change="selectEndpoint">
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
        <ManagementQueries v-if="selected" :key="selected.id" :device="selected.id" />
        <CredentialsPanel v-if="selected" :key="selected.id" :endpoint="selected" />
        <AssignedConfigurations v-if="selected" :key="selected.id" :device="selected.id" />
        <AgentConnectionObservation v-if="selected" :key="selected.id" :device="selected.id" />
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
      <template v-else>
        <nav class="telemetry-tabs telemetry-tabs--secondary" :aria-label="t('devices.history')">
          <RouterLink
            v-for="item in ['activity', 'performance', 'collection']"
            :key="item"
            :to="destination('history', item)"
            :aria-current="historySection === item ? 'page' : undefined"
            >{{ t('telemetry.' + item) }}</RouterLink
          >
        </nav>
        <label v-if="endpoints.length > 1"
          >{{ t('devices.originalEndpoint')
          }}<select :value="target" class="ui-input" @change="selectEndpoint">
            <option value="">{{ t('devices.select') }}</option>
            <option v-for="e in endpoints" :key="e.id" :value="e.id">{{ e.id }}</option>
          </select></label
        >
        <RouterLink
          v-if="target"
          :to="{ name: 'device-activities', params: { tenant: runtime.tenant, device: target } }"
          >{{ t('policies.entry.activities') }}</RouterLink
        >
        <template v-if="target">
          <DeviceActivity v-if="historySection === 'activity'" :key="target" :device="target" />
          <DevicePerformance
            v-else-if="historySection === 'performance'"
            :key="target"
            :device="target"
          />
          <DeviceCollections v-else :key="target" :device="target" />
        </template>
        <p v-else class="telemetry-empty">{{ t('devices.select') }}</p>
      </template>
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
