<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import DeviceFrame from '../components/DeviceFrame.vue'
import AssetValue from '../components/AssetValue.vue'
import ManualPanel from '../components/ManualPanel.vue'
import BatchPanel from '../components/BatchPanel.vue'
import type { FieldDefinition, Inventory } from '../clients/assets'
const { t } = useI18n(),
  route = useRoute(),
  runtime = useMdm(),
  clients = runtime.devices,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const id = computed(() => String(route.params['device']))
const detail = ref<Awaited<ReturnType<typeof clients.directory.detail>>>(),
  detailStale = ref(false),
  inventory = ref<Inventory>(),
  fields = ref<FieldDefinition[]>([])
const hardware = ref<Awaited<ReturnType<typeof clients.directory.hardware>>>(),
  software = ref<Awaited<ReturnType<typeof clients.directory.software>>>(),
  history = ref<Awaited<ReturnType<typeof clients.directory.history>>>(),
  registrations = ref<Awaited<ReturnType<typeof clients.enrollment.registrations>>>()
const tabs = [
  'inventory',
  'hardware',
  'software',
  'assignment',
  'credentials',
  'capabilities',
  'history',
] as const
const tab = ref<(typeof tabs)[number]>('inventory'),
  owner = ref(''),
  department = ref(''),
  confirmRevoke = ref(false)
let pending: (() => Promise<void>) | undefined
let pendingAssignment: (() => ReturnType<typeof clients.directory.assign>) | undefined
function load() {
  const device = id.value
  return run(
    async () => {
      const value = await clients.directory.detail(device)
      const catalog = await clients.assets.catalog()
      const assets = value.device.inventoryAvailable
        ? await clients.assets.inventory(device)
        : undefined
      return { value, catalog, assets }
    },
    (v) => {
      detail.value = v.value
      detailStale.value = false
      fields.value = v.catalog.fields
      inventory.value = v.assets
      owner.value = v.value.device.owner ?? ''
      department.value = v.value.device.department ?? ''
    },
  )
}
function loadTab(next?: string) {
  const device = id.value
  if (tab.value === 'hardware')
    void run(
      () => clients.directory.hardware(device, next),
      (v) => (hardware.value = v),
    )
  if (tab.value === 'software')
    void run(
      () => clients.directory.software(device, next),
      (v) => (software.value = v),
    )
  if (tab.value === 'history')
    void run(
      () => clients.directory.history(device, next),
      (v) => (history.value = v),
    )
  if (tab.value === 'credentials')
    void run(
      () => clients.enrollment.registrations(device, next),
      (v) => (registrations.value = v),
    )
}
function assign() {
  if (busy.value || uncertain.value || detailStale.value || !detail.value) return
  const device = id.value,
    body = operation(
      { owner: owner.value || null, department: department.value || null },
      detail.value.device.revision,
    )
  pending = undefined
  pendingAssignment = () => clients.directory.assign(device, body)
  void runWrite(pendingAssignment, (v) => (detail.value = v))
}
function revoke(registration: string) {
  if (busy.value || uncertain.value || !confirmRevoke.value) return
  const device = id.value,
    op = crypto.randomUUID()
  pendingAssignment = undefined
  pending = async () => {
    const acknowledged = await runWrite(
      () => clients.enrollment.revoke(device, registration, op),
      () => {
        detailStale.value = true
        registrations.value = undefined
        confirmRevoke.value = false
      },
    )
    if (acknowledged)
      await run(
        async () => ({
          detail: await clients.directory.detail(device),
          registrations: await clients.enrollment.registrations(device),
        }),
        (v) => {
          detail.value = v.detail
          detailStale.value = false
          registrations.value = v.registrations
        },
      )
  }
  void pending()
}
watch(
  [id, () => route.query['tab']],
  async () => {
    detail.value = undefined
    detailStale.value = false
    inventory.value = undefined
    hardware.value = undefined
    software.value = undefined
    history.value = undefined
    registrations.value = undefined
    pending = undefined
    pendingAssignment = undefined
    tab.value = route.query['tab'] === 'credentials' ? 'credentials' : 'inventory'
    if (await load()) loadTab()
  },
  { immediate: true },
)
function selectTab(key: (typeof tabs)[number]) {
  tab.value = key
  loadTab()
}
</script>
<template>
  <DeviceFrame
    :title="`${t('devices.detail')} · ${detail?.device.name ?? id}`"
    :busy="busy"
    :failure="failure"
  >
    <button :disabled="busy" @click="load">{{ t('devices.reload') }}</button>
    <template v-if="detail"
      ><RouterLink
        :to="{
          name: 'policy-scopes',
          params: { tenant: runtime.tenant },
          query: { device: detail.device.id },
        }"
        >{{ t('policies.scopes') }}</RouterLink
      >
      <nav class="device-actions" :aria-label="t('security.relatedRecords')">
        <RouterLink
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
            query: { device: detail.device.id },
          }"
          >{{ t(`security.${name}`) }}</RouterLink
        >
        <RouterLink
          v-for="name in ['audit', 'alerts']"
          :key="name"
          :to="{
            name: `operations-${name}`,
            params: { tenant: runtime.tenant },
            query: { device: detail.device.id },
          }"
          >{{ t(`operations.${name}`) }}</RouterLink
        >
      </nav>
      <p v-if="detailStale" role="status">{{ t('devices.refreshDetail') }}</p>
      <p v-else>
        {{ t(`devices.${detail.device.status}`) }} · {{ t(`devices.${detail.device.platform}`) }} ·
        {{ detail.device.channels.join(' + ') || '—' }}
      </p>
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
        <p>{{ t('devices.noTtl') }}</p>
        <dl v-if="inventory">
          <template v-for="field in inventory.fields" :key="field.field"
            ><dt>{{ field.field }}</dt>
            <dd><AssetValue :field="field" /></dd
          ></template>
        </dl>
        <p v-else>{{ t('devices.noInventory') }}</p>
        <ManualPanel
          v-if="inventory"
          :key="id"
          :device="id"
          :inventory="inventory"
          :fields="fields"
          @updated="inventory = $event"
        />
      </section>
      <section v-if="tab === 'hardware'">
        <dl>
          <template v-for="field in hardware?.items" :key="field.field"
            ><dt>{{ field.field }}</dt>
            <dd><AssetValue :field="field" /></dd
          ></template>
        </dl>
        <p v-if="hardware && !hardware.items.length">
          {{ detail.device.inventoryAvailable ? t('devices.empty') : t('devices.noInventory') }}
        </p>
        <button v-if="hardware?.nextCursor" :disabled="busy" @click="loadTab(hardware.nextCursor)">
          {{ t('devices.next') }}
        </button>
      </section>
      <section v-if="tab === 'software'">
        <p v-if="software">
          {{
            software.state === 'partial'
              ? t('devices.partial')
              : t(`devices.state.${software.state}`)
          }}
        </p>
        <dl>
          <template v-for="item in software?.items" :key="item.id"
            ><dt>{{ item.name }}</dt>
            <dd><AssetValue :field="item.version" /></dd
          ></template>
        </dl>
        <button v-if="software?.nextCursor" :disabled="busy" @click="loadTab(software.nextCursor)">
          {{ t('devices.next') }}
        </button>
      </section>
      <section v-if="tab === 'assignment'">
        <button
          v-if="uncertain && pendingAssignment"
          :disabled="busy"
          @click="runWrite(pendingAssignment!, (v) => (detail = v))"
        >
          {{ t('devices.replay') }}
        </button>
        <p>
          {{ t('devices.current') }}: {{ detail.device.owner ?? '—' }} /
          {{ detail.device.department ?? '—' }} · {{ t('devices.revision') }}
          {{ detail.device.revision }}
        </p>
        <form @submit.prevent="assign">
          <label>{{ t('devices.owner') }}<input v-model="owner" maxlength="256" /></label
          ><label>{{ t('devices.department') }}<input v-model="department" maxlength="256" /></label
          ><button :disabled="busy || uncertain || detailStale">{{ t('devices.save') }}</button>
        </form>
        <button
          :disabled="busy"
          @click="
            run(
              () => clients.directory.detail(id),
              (v) => (detail = v),
            )
          "
        >
          {{ t('devices.compare') }}
        </button>
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
        >
        <label
          ><input v-model="confirmRevoke" type="checkbox" />{{ t('devices.confirmAction') }}</label
        >
        <ul>
          <li v-for="r in registrations?.items" :key="r.registrationId">
            {{ r.registrationId }} · {{ r.source }} · {{ r.generation }} · {{ r.status }}
            <button
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
          <li v-for="enrollment in detail.enrollments" :key="enrollment">
            <RouterLink
              :to="{
                name: 'device-enroll',
                params: { tenant: runtime.tenant },
                query: { enrollment, device: id },
              }"
              >{{ enrollment }}</RouterLink
            >
          </li>
        </ul>
        <button v-if="uncertain && pending" :disabled="busy" @click="pending!()">
          {{ t('devices.replay') }}
        </button>
      </section>
      <section v-if="tab === 'capabilities' && !detailStale">
        <h2>{{ t('devices.readiness') }}</h2>
        <p>{{ t(`devices.${detail.readiness}`) }}</p>
        <ul>
          <li
            v-for="capability in detail.capabilities"
            :key="`${capability.action}-${capability.channel}`"
          >
            {{ t(`devices.action.${capability.action}`) }} · {{ capability.channel }} ·
            {{
              capability.support === 'supported'
                ? t('devices.yes')
                : t(`devices.${capability.support}`)
            }}
          </li>
        </ul>
        <RouterLink
          :to="{
            name: 'device-enroll',
            params: { tenant: runtime.tenant },
            query: { device: id, source: 'agent.builtin' },
          }"
          >{{ t('devices.mdmToAgent') }}</RouterLink
        >
        ·
        <RouterLink
          :to="{
            name: 'device-enroll',
            params: { tenant: runtime.tenant },
            query: {
              device: id,
              source: detail.device.platform === 'macos' ? 'mdm.apple' : 'mdm.windows',
            },
          }"
          >{{ t('devices.agentToMdm') }}</RouterLink
        >
      </section>
      <section v-if="tab === 'history'">
        <ol>
          <li v-for="event in history?.items" :key="event.id">
            {{ event.at }} · {{ t(`devices.${event.event}`) }} · {{ event.operation ?? '—' }}
          </li>
        </ol>
        <button v-if="history?.nextCursor" :disabled="busy" @click="loadTab(history.nextCursor)">
          {{ t('devices.next') }}
        </button>
      </section>
      <BatchPanel :key="id" :devices="[id]" />
    </template>
  </DeviceFrame>
</template>
