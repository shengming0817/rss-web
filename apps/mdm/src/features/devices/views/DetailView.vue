<script setup lang="ts">
import { UiButton, UiTabs, UiBadge, UiDialog, UiMessage } from '@rss/core/components'
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
import PageFrame from '../../../components/PageFrame.vue'
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
  revokeTarget = ref<string | null>(null)
const tabs = [
    'inventory',
    'manual',
    'credentials',
    'history',
    'assignment',
    'actions',
    'associationManagement',
  ] as const,
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
  revokeTarget.value = null
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
async function selectTab(key: string) {
  if (!(tabs as readonly string[]).includes(key)) return
  tab.value = key as (typeof tabs)[number]
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
  if (busy.value || uncertain.value || revokeTarget.value !== registration) return
  const device = id.value,
    op = crypto.randomUUID()
  pending = async () => {
    if (
      await runWrite(
        () => clients.enrollment.revoke(device, registration, op),
        () => {
          revokeTarget.value = null
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
  <PageFrame :title="`${t('devices.detail')} · ${id}`" :busy="busy" :failure="failure">
    <template #actions
      ><UiButton :disabled="busy" @click="load">{{ t('devices.reload') }}</UiButton></template
    >
    <template v-if="detail && view">
      <div class="console-object-summary">
        <span class="console-object-mark" aria-hidden="true">▱</span>
        <div>
          <h2>{{ id }}</h2>
          <p>{{ t('devices.originalEndpoint') }}</p>
        </div>
        <UiBadge>{{ t(`devices.endpointState.${detail.status}`) }}</UiBadge
        ><UiBadge v-for="channel in detail.channels" :key="channel.registrationId"
          >{{ channel.channel }} · {{ channel.source }}</UiBadge
        >
      </div>
      <UiTabs
        :model-value="tab"
        :label="t('devices.detail')"
        :items="tabs.map((value) => ({ value, label: t(`devices.${value}`), disabled: busy }))"
        keep-mounted
        @update:model-value="selectTab"
      >
        <template #inventory
          ><section>
            <ViewFacts :view="view" :endpoints="[detail]" @invalidated="invalidated" />
          </section> </template
        ><template #manual
          ><section>
            <p>{{ t('devices.manualOwner') }}: {{ id }}</p>
            <ManualPanel
              v-if="inventory"
              :device="id"
              :inventory="inventory"
              :fields="fields"
              @updated="inventory = $event"
            />
          </section> </template
        ><template #credentials
          ><section v-if="tab === 'credentials'">
            <p>{{ t('devices.revokeNote') }}</p>
            <p>{{ t('devices.enrollmentNote') }}</p>
            <RouterLink
              :to="{
                name: 'registration-users',
                params: { tenant: runtime.tenant },
                query: { device: id },
              }"
              >{{ t('registration.user') }}</RouterLink
            >
            <ul>
              <li v-for="r in registrations?.items" :key="r.registrationId">
                {{ r.registrationId }} · {{ r.source }} · {{ r.generation }} · {{ r.status
                }}<UiButton
                  :disabled="!!(busy || uncertain || r.status !== 'active')"
                  type="submit"
                  @click="revokeTarget = r.registrationId"
                >
                  {{ t('devices.revoke') }}
                </UiButton>
              </li>
            </ul>
            <UiButton :disabled="!!busy" type="submit" @click="loadTab()">{{
              t('devices.reload')
            }}</UiButton
            ><UiButton
              v-if="registrations?.nextCursor"
              :disabled="!!busy"
              type="submit"
              @click="loadTab(registrations.nextCursor)"
            >
              {{ t('devices.next') }}
            </UiButton>
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
          </section> </template
        ><template #history
          ><section v-if="tab === 'history'">
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
            <UiButton
              v-if="history?.nextCursor"
              :disabled="!!busy"
              type="submit"
              @click="loadTab(history.nextCursor)"
            >
              {{ t('devices.next') }}
            </UiButton>
          </section> </template
        ><template #assignment
          ><section v-if="tab === 'assignment'">
            <p>{{ t('devices.candidateOperation') }}</p>
            <p v-if="assignment">
              {{ t('devices.current') }}: {{ assignment.owner ?? '—' }} /
              {{ assignment.department ?? '—' }} · {{ t('devices.revision') }}
              {{ assignment.revision }}
            </p>
            <form @submit.prevent="assign">
              <fieldset :disabled="busy || uncertain || !assignment">
                <label
                  >{{ t('devices.owner')
                  }}<input v-model="owner" class="ui-input" maxlength="256" /></label
                ><label
                  >{{ t('devices.department')
                  }}<input v-model="department" class="ui-input" maxlength="256" /></label
                ><UiButton type="submit">{{ t('devices.save') }}</UiButton>
              </fieldset>
            </form>
            <UiButton :disabled="!!busy" type="submit" @click="loadTab()">{{
              t('devices.compare')
            }}</UiButton>
          </section> </template
        ><template #actions
          ><section v-if="tab === 'actions'">
            <p>{{ t('devices.candidateOperation') }}</p>
            <BatchPanel :devices="[id]" />
          </section> </template
        ><template #associationManagement
          ><AssociationPanel :endpoint="detail" @changed="changed" @denied="denied" /></template
      ></UiTabs>
      <UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="pending()">
        {{ t('devices.replay') }}
      </UiButton>
      <nav class="console-inline-actions" :aria-label="t('security.relatedRecords')">
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
    <UiDialog
      :open="revokeTarget !== null"
      :title="t('devices.revoke')"
      :description="t('devices.revokeNote')"
      :close-label="t('console.cancel')"
      kind="alertdialog"
      :dismissible="!busy && !uncertain"
      @update:open="!$event && (revokeTarget = null)"
      ><UiMessage v-if="failure" tone="danger" :title="t(`devices.${failure}`)" />
      <p>{{ t('devices.detail') }}: {{ id }}</p>
      <code>{{ revokeTarget }}</code>
      <p v-if="uncertain">{{ t('devices.replay') }}</p>
      <template #footer
        ><UiButton v-if="!uncertain" :disabled="busy" @click="revokeTarget = null">{{
          t('console.cancel')
        }}</UiButton
        ><UiButton v-if="uncertain && pending" :disabled="busy" @click="pending()">{{
          t('devices.replay')
        }}</UiButton
        ><UiButton
          v-else
          variant="danger"
          :disabled="busy || !revokeTarget"
          @click="revokeTarget && revoke(revokeTarget)"
          >{{ t('devices.confirmAction') }}</UiButton
        ></template
      ></UiDialog
    >
  </PageFrame>
</template>
