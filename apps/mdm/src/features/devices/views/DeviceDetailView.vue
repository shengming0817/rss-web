<script setup lang="ts">
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
import MdmPage from '../../../ui/MdmPage.vue'
import DeviceSummary from '../components/DeviceSummary.vue'
import ChannelCard from '../components/ChannelCard.vue'
import PersonDisplay from '../components/PersonDisplay.vue'
import { scalarText } from '../presentation'
import { assetLabel } from '../assetPresentation'
import { useDialogFocus } from '../../../ui/dialog-focus'
import ViewFacts from '../components/ViewFacts.vue'
import PersonnelPanel from '../components/PersonnelPanel.vue'
import ManualPanel from '../components/ManualPanel.vue'
import AssociationPanel from '../components/AssociationPanel.vue'
import DeviceControlPanel from '../components/DeviceControlPanel.vue'
import CredentialsPanel from '../../security/components/CredentialsPanel.vue'
import ManagementQueries from '../components/ManagementQueries.vue'
import RegistrationPanel from '../components/RegistrationPanel.vue'
import NativeEnrollmentPanel from '../../enrollment/components/NativeEnrollmentPanel.vue'
import SelfEnrollmentProgress from '../../enrollment/components/SelfEnrollmentProgress.vue'
import DeviceRecoveryPanel from '../../security/pki/DeviceRecoveryPanel.vue'
const runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  { t, locale } = useI18n()
const personalEnrollment = computed(() =>
  route.query['mode'] === 'self-enrollment' &&
  typeof route.params['device'] === 'string' &&
  typeof route.query['enrollment'] === 'string'
    ? { device: route.params['device'], enrollment: route.query['enrollment'] }
    : undefined,
)
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
      : route.query['tab'] === 'inventory'
        ? 'inventory'
        : 'overview',
)
const historySection = computed(() => String(route.params['history'] ?? 'activity'))
function destination(section: string, history?: string) {
  const name = route.params['device'] ? 'device' : 'device-view'
  return {
    name:
      section === 'inventory' || section === 'overview' ? name + '-detail' : name + '-' + section,
    params: {
      tenant: runtime.tenant,
      ...(route.params['device']
        ? { device: route.params['device'] }
        : { kind: route.params['kind'], view: route.params['view'] }),
      ...(history ? { history } : {}),
    },
    query: {
      ...route.query,
      endpoint: target.value,
      tab: section === 'inventory' ? 'inventory' : undefined,
    },
  }
}
const target = ref(''),
  manualOpen = ref(false),
  inventory = ref<Inventory>(),
  manualGeneration = ref(0)
const manualOperation = useOperation([], () => [
  ...deviceBinding(runtime),
  target.value,
  String(manualGeneration.value),
])
const restoreManualFocus = useDialogFocus(manualOpen)
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
const displayName = computed(
  () =>
    view.value?.endpoints
      .map((endpoint) => {
        const state = endpoint.displayName?.state
        return state?.kind === 'known' && state.value.kind === 'string'
          ? state.value.value
          : endpoint.id
      })
      .join(' / ') ?? reference.value.id,
)
const selectedName = computed(() => {
  const state = view.value?.endpoints.find((endpoint) => endpoint.id === target.value)?.displayName
    ?.state
  return state?.kind === 'known' && state.value.kind === 'string' ? state.value.value : target.value
})
function clear() {
  manualGeneration.value++
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
  // Rereading the same device withdraws reads, while ManualPanel keeps any original write intent.
  manualGeneration.value++
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
  const endpoint = target.value
  if (!endpoint) return
  if (inventory.value?.device === endpoint) {
    manualOpen.value = true
    return
  }
  await manualOperation.run(
    async () => ({
      inventory: await runtime.devices.assets.inventory(endpoint),
      catalog: await runtime.devices.assets.catalog(),
    }),
    (value) => {
      if (!view.value || target.value !== endpoint) return
      if (value.inventory.device !== endpoint) {
        manualOperation.failure.value = 'invalidResponse'
        return
      }
      inventory.value = value.inventory
      fields.value = value.catalog.fields
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
      personalEnrollment.value,
      ...deviceBinding(runtime),
    ]),
  () => {
    clear()
    target.value = ''
    if (personalEnrollment.value) return
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
function selectEndpoint(value: string) {
  void router.replace({
    query: { ...route.query, endpoint: value },
  })
}
watch(() => route.query['endpoint'], syncTarget, { flush: 'sync' })
watch(section, () => (manualOpen.value = false))
watch(target, () => {
  manualOpen.value = false
})
</script>
<template>
  <MdmPage
    :title="personalEnrollment ? t('registration.self') : displayName"
    :busy="busy || manualOperation.busy.value"
    :failure="personalEnrollment ? null : (failure ?? manualOperation.failure.value)"
  >
    <template #breadcrumb>
      <RouterLink v-if="personalEnrollment" :to="{ name: 'self-enrollments' }">{{
        t('registration.self')
      }}</RouterLink>
      <RouterLink
        v-else
        class="device-caption"
        :to="{ name: 'devices', params: { tenant: runtime.tenant }, query: directoryQuery }"
        >{{ t('devices.returnDirectory') }}</RouterLink
      ></template
    >
    <template #actions
      ><v-btn v-if="!personalEnrollment" variant="text" :disabled="busy" @click="load">{{
        t('devices.reload')
      }}</v-btn></template
    >
    <SelfEnrollmentProgress
      v-if="personalEnrollment"
      :key="personalEnrollment.device + '/' + personalEnrollment.enrollment"
      :device-id="personalEnrollment.device"
      :enrollment-id="personalEnrollment.enrollment"
    />
    <template v-else-if="view">
      <DeviceSummary :view="view" @invalidated="invalidated" />
      <v-tabs :model-value="section" class="device-tabs" :aria-label="t('devices.detail')">
        <v-tab
          v-for="item in ['overview', 'inventory', 'management', 'history']"
          :key="item"
          :value="item"
          exact
          :to="destination(item, item === 'history' ? 'activity' : undefined)"
          >{{ t(item === 'inventory' ? 'devices.workspace.assets' : 'devices.' + item) }}</v-tab
        >
      </v-tabs>
      <v-select
        v-if="endpoints.length > 1"
        class="device-endpoint-select"
        :model-value="target"
        :label="t('devices.originalEndpoint')"
        :items="[
          { value: '', title: t('devices.select') },
          ...endpoints.map((e) => ({ value: e.id, title: e.id })),
        ]"
        @update:model-value="selectEndpoint"
      />
      <div v-if="section === 'overview'" class="device-overview">
        <div>
          <section class="device-section">
            <div class="device-section-heading">
              <h2>{{ t('devices.overview') }}</h2>
              <v-btn variant="text" :to="destination('inventory')">{{
                t('devices.workspace.assets')
              }}</v-btn>
            </div>
            <dl class="device-facts">
              <div
                v-for="field in Object.values(view.fields).filter((f) =>
                  [
                    'device.model',
                    'device.serial_number',
                    'device.os.name',
                    'device.os.version',
                    'device.cpu.model',
                    'device.memory.bytes',
                    'device.disk_encryption.enabled',
                    'device.security.macos.sip',
                  ].includes(f.field),
                )"
                :key="field.field"
              >
                <dt>{{ assetLabel(field.field, locale) }}</dt>
                <dd>
                  {{
                    field.state.kind === 'known'
                      ? scalarText(field.state.value)
                      : t('devices.state.' + field.state.kind)
                  }}
                </dd>
              </div>
            </dl>
            <p>{{ t('devices.workspace.overviewNote') }}</p>
          </section>
          <PersonnelPanel
            v-for="endpoint in view.endpoints"
            :key="endpoint.id"
            :endpoint="endpoint"
            @changed="load"
            @invalidated="invalidated"
          />
        </div>
        <aside>
          <section class="device-section">
            <h2>{{ t('devices.channels') }}</h2>
            <div v-for="endpoint in view.endpoints" :key="endpoint.id">
              <h3>
                {{
                  endpoint.displayName?.state.kind === 'known'
                    ? scalarText(endpoint.displayName.state.value)
                    : endpoint.id
                }}
              </h3>
              <p>{{ t('devices.endpointState.' + endpoint.status) }}</p>
              <v-chip v-for="channel in endpoint.channels" :key="channel.registrationId"
                >{{ channel.channel === 'mdm' ? 'MDM' : 'Agent' }} ·
                {{ t('devices.endpointState.' + channel.status) }}</v-chip
              >
            </div>
          </section>
          <section class="device-section">
            <h2>{{ t('devices.currentUser') }}</h2>
            <p v-for="endpoint in view.endpoints" :key="endpoint.id">
              <PersonDisplay :display="endpoint.currentUser?.display ?? null" />
            </p>
          </section>
        </aside>
      </div>
      <template v-else-if="section === 'inventory'">
        <div class="device-actions">
          <v-btn variant="outlined" :disabled="busy || !target" @click="editManual">{{
            t('devices.editAssets')
          }}</v-btn>
        </div>
        <ViewFacts :view="view" :endpoints="endpoints" @invalidated="invalidated" />
      </template>
      <template v-else-if="section === 'management'">
        <p class="device-caption">{{ t('devices.workspace.managementNote') }}</p>
        <DeviceControlPanel
          v-if="selected"
          :key="selected.id"
          :endpoint="selected"
          :device-name="selectedName"
        />
        <p v-if="!selected">{{ t('devices.select') }}</p>
        <details class="device-section" data-device-channels>
          <summary>{{ t('devices.channels') }}</summary>
          <ChannelCard
            v-for="endpoint in view.endpoints"
            :key="endpoint.id"
            :endpoint="endpoint"
            :detail="endpoints.find((e) => e.id === endpoint.id)"
            :view="view"
          />
        </details>
        <div v-if="selected" class="device-panel-grid">
          <div>
            <ManagementQueries :key="selected.id" :device="selected.id" />
            <AssignedConfigurations :key="selected.id" :device="selected.id" />
            <AgentConnectionObservation :key="selected.id" :device="selected.id" />
          </div>
          <div>
            <CredentialsPanel :key="selected.id" :endpoint="selected" />
            <RegistrationPanel :key="selected.id" :endpoint="selected" @changed="load" />
            <NativeEnrollmentPanel :key="selected.id" :endpoint="selected" />
            <DeviceRecoveryPanel :key="selected.id" :endpoint="selected" />
          </div>
        </div>
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
        <v-btn
          variant="text"
          :to="{ name: 'policy-resources', params: { tenant: runtime.tenant } }"
          >{{ t('devices.collectionPackages') }}</v-btn
        >
      </template>
      <template v-else>
        <v-tabs :model-value="historySection" class="device-tabs" :aria-label="t('devices.history')"
          ><v-tab
            v-for="item in ['activity', 'performance', 'collection']"
            :key="item"
            :value="item"
            :to="destination('history', item)"
            >{{ t('telemetry.' + item) }}</v-tab
          ></v-tabs
        >
        <v-btn
          v-if="target"
          variant="text"
          :to="{ name: 'device-activities', params: { tenant: runtime.tenant, device: target } }"
          >{{ t('policies.entry.activities') }}</v-btn
        >
        <template v-if="target"
          ><DeviceActivity
            v-if="historySection === 'activity'"
            :key="target"
            :device="target" /><DevicePerformance
            v-else-if="historySection === 'performance'"
            :key="target"
            :device="target" /><DeviceCollections v-else :key="target" :device="target"
        /></template>
        <p v-else>{{ t('devices.select') }}</p>
      </template>
    </template>
    <v-dialog
      :model-value="manualOpen"
      eager
      :aria-label="t('devices.editAssets')"
      :data-state="manualOpen ? 'open' : 'closed'"
      @update:model-value="manualOpen = $event"
      @after-leave="restoreManualFocus"
    >
      <v-card :title="t('devices.editAssets')"
        ><v-card-text
          ><ManualPanel
            v-if="inventory && inventory.device === target"
            :key="inventory.device"
            :device="inventory.device"
            :inventory="inventory"
            :fields="fields"
            @updated="inventory = $event" /></v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn variant="text" @click="manualOpen = false">{{
            t('console.cancel')
          }}</v-btn></v-card-actions
        ></v-card
      >
    </v-dialog>
  </MdmPage>
</template>
