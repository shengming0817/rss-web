<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { DeviceView } from '../clients/device-views'
import type { EndpointDetail } from '../clients/endpoint-model'
import type { Association } from '../clients/associations'
import type { Inventory, FieldDefinition } from '../clients/assets'
import DeviceFrame from '../components/DeviceFrame.vue'
import ViewFacts from '../components/ViewFacts.vue'
import ManualPanel from '../components/ManualPanel.vue'
import AssociationPanel from '../components/AssociationPanel.vue'
import BatchPanel from '../components/BatchPanel.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  clients = runtime.devices,
  id = computed(() => String(route.params['device'])),
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const detail = ref<EndpointDetail>(),
  view = ref<DeviceView>(),
  inventory = ref<Inventory>(),
  fields = ref<FieldDefinition[]>([]),
  history = ref<Awaited<ReturnType<typeof clients.directory.history>>>(),
  registrations = ref<Awaited<ReturnType<typeof clients.enrollment.registrations>>>(),
  assignment = ref<Awaited<ReturnType<typeof clients.candidate.assignment>>>(),
  owner = ref(''),
  department = ref(''),
  confirmRevoke = ref(false)
const tabs = ['inventory', 'manual', 'credentials', 'history', 'assignment', 'actions'] as const,
  tab = ref<(typeof tabs)[number]>('inventory')
let pending: (() => Promise<void>) | undefined
function clear() {
  detail.value = undefined
  view.value = undefined
  inventory.value = undefined
  fields.value = []
  history.value = undefined
  registrations.value = undefined
  assignment.value = undefined
  owner.value = ''
  department.value = ''
  confirmRevoke.value = false
  pending = undefined
}
async function load() {
  detail.value = undefined
  view.value = undefined
  const device = id.value
  await run(
    async () => ({
      detail: await clients.directory.detail(device),
      view: await clients.views.detail({ kind: 'endpoint', id: device }),
    }),
    (v) => {
      detail.value = v.detail
      view.value = v.view
    },
  )
}
async function loadTab(next?: string) {
  const device = id.value
  if (tab.value === 'history')
    await run(
      () => clients.directory.history(device, next),
      (v) => (history.value = v),
    )
  else if (tab.value === 'credentials')
    await run(
      () => clients.enrollment.registrations(device, next),
      (v) => (registrations.value = v),
    )
  else if (tab.value === 'manual')
    await run(
      async () => ({
        inventory: await clients.assets.inventory(device),
        fields: await clients.assets.catalog(),
      }),
      (v) => {
        inventory.value = v.inventory
        fields.value = v.fields.fields
      },
    )
  else if (tab.value === 'assignment')
    await run(
      () => clients.candidate.assignment(device),
      (v) => {
        assignment.value = v
        owner.value = v.owner ?? ''
        department.value = v.department ?? ''
      },
    )
}
async function selectTab(key: (typeof tabs)[number]) {
  tab.value = key
  await loadTab()
}
function assign() {
  if (!assignment.value || busy.value || uncertain.value) return
  const device = id.value,
    body = operation(
      { owner: owner.value || null, department: department.value || null },
      assignment.value.revision,
    )
  pending = async () => {
    await runWrite(
      () => clients.candidate.assign(device, body),
      (v) => (assignment.value = v),
    )
  }
  void pending()
}
function revoke(registration: string) {
  if (busy.value || uncertain.value || !confirmRevoke.value) return
  const device = id.value,
    op = crypto.randomUUID()
  pending = async () => {
    if (
      await runWrite(
        () => clients.enrollment.revoke(device, registration, op),
        () => {
          confirmRevoke.value = false
          registrations.value = undefined
          detail.value = undefined
          view.value = undefined
        },
      )
    ) {
      await load()
      if (detail.value) await loadTab()
    }
  }
  void pending()
}
function denied() {
  clear()
  failure.value = 'denied'
}
async function changed(a: Association) {
  clear()
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
  () => [...deviceBinding(runtime), id.value],
  () => {
    clear()
    tab.value =
      route.query['tab'] === 'credentials'
        ? 'credentials'
        : route.query['tab'] === 'manual'
          ? 'manual'
          : 'inventory'
    void load().then(() => {
      if (detail.value) void loadTab()
    })
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => route.query['tab'],
  () => {
    if (route.query['tab'] === 'manual') void selectTab('manual')
    else if (route.query['tab'] === 'credentials') void selectTab('credentials')
  },
)
</script>
<template>
  <DeviceFrame :title="`${t('devices.detail')} · ${id}`" :busy="busy" :failure="failure">
    <button :disabled="busy" @click="load">{{ t('devices.reload') }}</button>
    <template v-if="detail && view">
      <nav class="device-actions" :aria-label="t('devices.detail')">
        <button
          v-for="key in tabs"
          :key="key"
          :aria-pressed="tab === key"
          :disabled="busy"
          @click="selectTab(key)"
        >
          {{ t(`devices.${key}`) }}
        </button>
      </nav>
      <section v-show="tab === 'inventory'">
        <AssociationPanel :endpoint="detail" @changed="changed" @denied="denied" /><ViewFacts
          :view="view"
          :endpoints="[detail]"
          @invalidated="invalidated"
        />
      </section>
      <section v-show="tab === 'manual'">
        <p>{{ t('devices.manualOwner') }}: {{ id }}</p>
        <ManualPanel
          v-if="inventory"
          :device="id"
          :inventory="inventory"
          :fields="fields"
          @updated="inventory = $event"
        />
      </section>
      <section v-if="tab === 'credentials'">
        <p>{{ t('devices.revokeNote') }}</p>
        <p>{{ t('devices.enrollmentNote') }}</p>
        <RouterLink
          :to="{
            name: 'registration-users',
            params: { tenant: runtime.tenant },
            query: { device: id },
          }"
          >{{ t('registration.user') }}</RouterLink
        ><label
          ><input v-model="confirmRevoke" type="checkbox" />{{ t('devices.confirmAction') }}</label
        >
        <ul>
          <li v-for="r in registrations?.items" :key="r.registrationId">
            {{ r.registrationId }} · {{ r.source }} · {{ r.generation }} · {{ r.status
            }}<button
              :disabled="busy || uncertain || !confirmRevoke || r.status !== 'active'"
              @click="revoke(r.registrationId)"
            >
              {{ t('devices.revoke') }}
            </button>
          </li>
        </ul>
        <button :disabled="busy" @click="loadTab()">{{ t('devices.reload') }}</button
        ><button
          v-if="registrations?.nextCursor"
          :disabled="busy"
          @click="loadTab(registrations.nextCursor)"
        >
          {{ t('devices.next') }}
        </button>
        <ul>
          <li v-for="enrollment in detail.enrollments" :key="enrollment.enrollmentId">
            <RouterLink
              :to="{
                name: 'device-enroll',
                params: { tenant: runtime.tenant },
                query: { enrollment: enrollment.enrollmentId, device: id },
              }"
              >{{ enrollment.enrollmentId }} · {{ enrollment.status }}</RouterLink
            >
          </li>
        </ul>
      </section>
      <section v-if="tab === 'history'">
        <p v-if="history">
          {{ t('devices.historyCoverage') }}:
          {{ t(history.coverage.complete ? 'devices.yes' : 'devices.no') }}
        </p>
        <ol>
          <li v-for="fact in history?.items" :key="fact.eventId">
            {{ fact.recordedAt }} · {{ fact.action }} · {{ fact.auditOutcome }} ·
            {{ fact.registrationId ?? '—' }} · {{ fact.operationId ?? '—' }} · {{ fact.effect }}
          </li>
        </ol>
        <button v-if="history?.nextCursor" :disabled="busy" @click="loadTab(history.nextCursor)">
          {{ t('devices.next') }}
        </button>
      </section>
      <section v-if="tab === 'assignment'">
        <p>{{ t('devices.candidateOperation') }}</p>
        <p v-if="assignment">
          {{ t('devices.current') }}: {{ assignment.owner ?? '—' }} /
          {{ assignment.department ?? '—' }} · {{ t('devices.revision') }} {{ assignment.revision }}
        </p>
        <form @submit.prevent="assign">
          <fieldset :disabled="busy || uncertain || !assignment">
            <label>{{ t('devices.owner') }}<input v-model="owner" maxlength="256" /></label
            ><label
              >{{ t('devices.department') }}<input v-model="department" maxlength="256" /></label
            ><button>{{ t('devices.save') }}</button>
          </fieldset>
        </form>
        <button :disabled="busy" @click="loadTab()">{{ t('devices.compare') }}</button>
      </section>
      <section v-if="tab === 'actions'">
        <p>{{ t('devices.candidateOperation') }}</p>
        <BatchPanel :devices="[id]" />
      </section>
      <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
        {{ t('devices.replay') }}
      </button>
      <nav class="device-actions" :aria-label="t('security.relatedRecords')">
        <RouterLink
          :to="{ name: 'policy-scopes', params: { tenant: runtime.tenant }, query: { device: id } }"
          >{{ t('policies.scopes') }}</RouterLink
        ><RouterLink
          v-for="name in [
            'compliance',
            'materials',
            'certificates',
            'support',
            'experience',
            'actions',
            'requests',
          ]"
          :key="name"
          :to="{
            name: `security-${name}`,
            params: { tenant: runtime.tenant },
            query: { device: id },
          }"
          >{{ t(`security.${name}`) }}</RouterLink
        ><RouterLink
          v-for="name in ['audit', 'alerts']"
          :key="name"
          :to="{
            name: `operations-${name}`,
            params: { tenant: runtime.tenant },
            query: { device: id },
          }"
          >{{ t(`operations.${name}`) }}</RouterLink
        >
      </nav>
    </template>
  </DeviceFrame>
</template>
