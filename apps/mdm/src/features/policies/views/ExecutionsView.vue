<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import PageFrame from '../../../components/PageFrame.vue'
import { deviceBinding } from '../../devices/useDeviceBinding'
import DeviceControlPanel from '../../devices/components/DeviceControlPanel.vue'
import NativeTaskFacts from '../components/NativeTaskFacts.vue'
import type { NativeOperation } from '../clients/native'
import type { EndpointDetail } from '../../devices/clients/endpoint-model'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute()
const { run, busy, failure } = useOperation(
  [],
  () => deviceBinding(runtime),
  () => JSON.stringify([route.path, route.query['device'], route.query['policy']]),
)
const picker = useOperation(
  [],
  () => deviceBinding(runtime),
  () => JSON.stringify([route.path, route.query['device'], route.query['policy']]),
)
const commandDetails = ref<Record<string, NativeOperation>>({})
const applied = ref<{
  device?: string | undefined
  policy?: string | undefined
  kind?: 'command' | 'action_run' | undefined
  status?: string | undefined
}>({})
const records = ref<Awaited<ReturnType<typeof runtime.policies.executions.directory>>>()
const device = ref(''),
  policy = ref(''),
  kind = ref<'' | 'command' | 'action_run'>(''),
  status = ref('')
const devices = ref<Awaited<ReturnType<typeof runtime.devices.directory.list>>>()
const selected = ref<EndpointDetail>(),
  name = ref('')
const selectedDevice = ref('')
const pinned = computed(() => typeof route.query['operation'] === 'string')
function load(cursor?: { id: string; kind: 'command' | 'action_run' }) {
  if (busy.value) return
  const selection = cursor
    ? applied.value
    : {
        device: device.value || undefined,
        policy: policy.value || undefined,
        kind: kind.value || undefined,
        status: status.value || undefined,
      }
  const query = { ...selection, after: cursor?.id, afterKind: cursor?.kind }
  void run(
    () => runtime.policies.executions.directory(query),
    (value) => {
      records.value = value
      applied.value = selection
      commandDetails.value = {}
    },
  )
}
function inspect(device: string, id: string) {
  void run(
    () => runtime.policies.native.read(device, id),
    (value) => {
      commandDetails.value[id] = value
    },
  )
}
function loadDevices(after?: string) {
  void picker.run(
    () => runtime.devices.directory.list(after),
    (value) => {
      devices.value = value
    },
  )
}
async function readDevice(id: string) {
  const endpoint = await runtime.devices.directory.detail(id)
  const view = await runtime.devices.views.detail({ kind: 'endpoint', id })
  const display = view.endpoints[0]?.displayName
  return {
    endpoint,
    name:
      display?.state.kind === 'known' && display.state.value.kind === 'string'
        ? display.state.value.value
        : endpoint.id,
  }
}
async function choose() {
  if (pinned.value) return
  selected.value = undefined
  name.value = ''
  if (!selectedDevice.value) return
  await picker.run(
    () => readDevice(selectedDevice.value),
    (value) => {
      selected.value = value.endpoint
      name.value = value.name
    },
  )
}

watch(
  () =>
    JSON.stringify([
      route.path,
      route.query['device'],
      route.query['policy'],
      ...deviceBinding(runtime),
    ]),
  () => {
    records.value = undefined
    commandDetails.value = {}
    selected.value = undefined
    devices.value = undefined
    device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
    policy.value = typeof route.query['policy'] === 'string' ? route.query['policy'] : ''
    selectedDevice.value =
      typeof route.query['operationDevice'] === 'string'
        ? route.query['operationDevice']
        : device.value
    load()
    if (selectedDevice.value) {
      // The original locator is read-only recovery, even after navigation or reload.
      void picker.run(
        () => readDevice(selectedDevice.value),
        (value) => {
          selected.value = value.endpoint
          name.value = value.name
        },
      )
    }
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('policies.executions')" :busy="busy" :failure="failure">
    <form class="console-toolbar" @submit.prevent="load()">
      <label>{{ t('policies.device') }}<input v-model="device" class="ui-input" /></label>
      <label>{{ t('policies.policies') }}<input v-model="policy" class="ui-input" /></label>
      <label
        >{{ t('policies.kind')
        }}<select v-model="kind" class="ui-input">
          <option value="">{{ t('devices.all') }}</option>
          <option value="command">{{ t('policies.nativeAction') }}</option>
          <option value="action_run">{{ t('policies.policies') }}</option>
        </select></label
      >
      <label
        >{{ t('policies.execution')
        }}<input v-model="status" class="ui-input" :placeholder="t('policies.statusFilter')"
      /></label>
      <UiButton :disabled="busy" type="submit">{{ t('policies.reload') }}</UiButton>
    </form>
    <p>{{ t('policies.statusFilterBoundary') }}</p>
    <section class="console-panel">
      <h2>{{ t('policies.nativeAction') }}</h2>
      <UiButton :disabled="picker.busy.value || pinned" @click="loadDevices()">{{
        t('console.chooseLoaded')
      }}</UiButton>
      <template v-if="devices"
        ><p>{{ t('console.pageNotTotal') }}</p>
        <label
          >{{ t('policies.device')
          }}<select
            v-model="selectedDevice"
            class="ui-input"
            :disabled="picker.busy.value || pinned"
            @change="choose"
          >
            <option value="">{{ t('devices.select') }}</option>
            <option
              v-if="selectedDevice && !devices.items.some((d) => d.id === selectedDevice)"
              :value="selectedDevice"
            >
              {{ selectedDevice }}
            </option>
            <option v-for="item in devices.items" :key="item.id" :value="item.id">
              {{ item.id }}
            </option>
          </select></label
        ><UiButton
          v-if="devices.nextCursor"
          :disabled="picker.busy.value || pinned"
          @click="loadDevices(devices.nextCursor)"
          >{{ t('policies.next') }}</UiButton
        ></template
      >
      <p v-if="picker.failure.value" role="alert">{{ t(`devices.${picker.failure.value}`) }}</p>
      <DeviceControlPanel
        v-if="selected"
        :key="selected.id"
        :endpoint="selected"
        :device-name="name"
      />
    </section>
    <section v-if="records" class="console-panel">
      <p>{{ t('policies.authorizedTotal') }} {{ records.statistics.total }} · {{ records.asOf }}</p>
      <p v-if="!records.items.length">{{ t('policies.empty') }}</p>
      <ul>
        <li v-for="item in records.items" :key="`${item.kind}/${item.id}`">
          <RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: item.id },
              query: item.kind === 'command' ? { device: item.device } : { policy: item.policy },
            }"
            >{{ item.device }} · {{ item.id }} · {{ item.status }}</RouterLink
          >
          <p>{{ item.registrationId }} / {{ item.generation }}</p>
          <dl>
            <dt>{{ t('policies.admission') }}</dt>
            <dd>{{ t('policies.fact.accepted') }}</dd>
            <dt>{{ t('policies.execution') }}</dt>
            <dd>{{ item.status }}</dd>
          </dl>
          <dl v-if="item.evidence.kind === 'command'">
            <dt>{{ t('policies.dispatch') }}</dt>
            <dd>{{ item.evidence.commandStatus }}</dd>
            <dt>{{ t('policies.receipt') }}</dt>
            <dd>{{ item.evidence.observation.progress }}</dd>
            <dt>{{ t('policies.effect') }}</dt>
            <dd>{{ item.evidence.observation.effect }}</dd>
          </dl>
          <dl v-else>
            <dt>{{ t('policies.dispatch') }}</dt>
            <dd>{{ item.evidence.state.delivery.kind }}</dd>
            <dt>{{ t('policies.execution') }}</dt>
            <dd>{{ item.evidence.state.execution }}</dd>
            <dt>{{ t('policies.effect') }}</dt>
            <dd>{{ item.evidence.effect }}</dd>
          </dl>
          <p v-if="item.evidence.kind === 'command' && item.evidence.dispatchFailure" role="status">
            {{ t('policies.dispatchFailure') }}
          </p>
          <template v-if="item.kind === 'command'">
            <UiButton :disabled="busy" @click="inspect(item.device, item.id)">{{
              t('policies.inspectAction')
            }}</UiButton>
            <NativeTaskFacts
              v-if="commandDetails[item.id]"
              :operation="commandDetails[item.id]!"
              :device="item.device"
            />
          </template>
          <p>{{ t('policies.readFormalEvidence') }}</p>
        </li>
      </ul>
      <UiButton v-if="records.nextCursor" :disabled="busy" @click="load(records.nextCursor)">{{
        t('policies.next')
      }}</UiButton>
    </section>
  </PageFrame>
</template>
