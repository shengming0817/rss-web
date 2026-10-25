<script setup lang="ts">
import { comparison, allOf } from '../../../services/directory-query'
import { UiButton, UiTable, UiBadge, UiDialog } from '@rss/core/components'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import PageFrame from '../../../components/PageFrame.vue'
import { deviceBinding } from '../../devices/useDeviceBinding'
import DeviceControlPanel from '../../devices/components/DeviceControlPanel.vue'
import NativeTaskFacts from '../components/NativeTaskFacts.vue'
import OperationStages from '../components/OperationStages.vue'
import type { NativeOperation } from '../clients/native'
import type { EndpointDetail } from '../../devices/clients/endpoint-model'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute()
const activeFilter = ref<string>()
const { run, busy, failure } = useOperation(
  [],
  () => [...deviceBinding(runtime), activeFilter.value],
  () => JSON.stringify([route.path, route.query['device'], route.query['policy']]),
)
const picker = useOperation(
  [],
  () => deviceBinding(runtime),
  () => JSON.stringify([route.path, route.query['device'], route.query['policy']]),
)
const statisticsOperation = useOperation([], () => [...deviceBinding(runtime), activeFilter.value])
const statistics = ref<Awaited<ReturnType<typeof runtime.policies.executions.statistics>>>()
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
const selectedDevice = ref(''),
  choosingDevice = ref(false)
function beginRemote() {
  choosingDevice.value = true
  loadDevices()
}
const utc = (at: number) =>
  new Date(at * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
const pinned = computed(() => typeof route.query['operation'] === 'string')
function load(cursor?: string) {
  if (busy.value) return
  const selection = cursor
    ? applied.value
    : {
        device: device.value || undefined,
        policy: policy.value || undefined,
        kind: kind.value || undefined,
        status: status.value || undefined,
      }
  const filter = allOf(
    ...Object.entries(selection).map(([key, value]) =>
      value ? comparison(key, '==', value) : undefined,
    ),
  )
  activeFilter.value = filter
  const query = { filter, cursor }
  if (!cursor) {
    statistics.value = undefined
    void statisticsOperation.run(
      () => runtime.policies.executions.statistics(filter),
      (v) => {
        statistics.value = v
      },
    )
  }
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
    () => runtime.devices.directory.list({ cursor: after }),
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
      choosingDevice.value = false
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
    choosingDevice.value = false
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
  <PageFrame
    :title="t('policies.executions')"
    :description="t('policies.ux.executionsHint')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><UiButton :disabled="picker.busy.value || pinned" @click="beginRemote">{{
        t('policies.ux.remote')
      }}</UiButton></template
    >
    <p v-if="statisticsOperation.failure.value" role="alert">
      {{ t('devices.' + statisticsOperation.failure.value) }}
    </p>
    <dl v-if="statistics" class="task-statistics">
      <div>
        <dt>{{ t('policies.ux.total') }}</dt>
        <dd>{{ statistics.statistics.total }}</dd>
      </div>
      <div>
        <dt>{{ t('policies.ux.commands') }}</dt>
        <dd>{{ statistics.statistics.commands }}</dd>
      </div>
      <div>
        <dt>{{ t('policies.ux.runs') }}</dt>
        <dd>{{ statistics.statistics.actionRuns }}</dd>
      </div>
      <div>
        <dt>{{ t('policies.ux.unknown') }}</dt>
        <dd>{{ statistics.statistics.unknown }}</dd>
      </div>
    </dl>
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
    <UiDialog
      v-model:open="choosingDevice"
      placement="right"
      :title="t('policies.ux.chooseDevice')"
      :description="t('policies.ux.chooseDeviceHint')"
      :close-label="t('console.close')"
    >
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
    </UiDialog>
    <DeviceControlPanel
      v-if="selected"
      :key="selected.id"
      :endpoint="selected"
      :device-name="name"
    />
    <section v-if="records" class="console-panel">
      <p v-if="statistics" class="ui-help">
        {{ t('policies.ux.observedAt') }} · {{ utc(statistics.asOf) }}
      </p>
      <UiTable
        :label="t('policies.executions')"
        :rows="records.items"
        :row-key="(item) => `${item.kind}/${item.id}`"
        :busy="busy"
        :busy-label="t('devices.loading')"
        :empty-label="t('policies.empty')"
        :columns="[
          { key: 'operation', label: t('policies.operation') },
          { key: 'device', label: t('policies.device') },
          { key: 'status', label: t('policies.execution') },
          { key: 'evidence', label: t('devices.evidence') },
        ]"
      >
        <template #cell-operation="{ row: item }"
          ><RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: item.id },
              query: item.kind === 'command' ? { device: item.device } : { policy: item.policy },
            }"
            >{{ t(item.kind === 'command' ? 'policies.nativeAction' : 'policies.policies') }} ·
            {{ item.id.slice(0, 8) }}</RouterLink
          ><small class="task-object-description"
            >{{ item.registrationId }} / {{ item.generation }}</small
          ></template
        >
        <template #cell-device="{ row }"
          ><RouterLink
            :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device: row.device } }"
            >{{ row.device }}</RouterLink
          ></template
        >
        <template #cell-status="{ row }"
          ><UiBadge :tone="row.status === 'unknown' ? 'warning' : 'neutral'">{{
            row.status
          }}</UiBadge></template
        >
        <template #cell-evidence="{ row: item }">
          <details class="operation-evidence">
            <summary>{{ t('devices.evidence') }}</summary>
            <OperationStages
              v-if="item.evidence"
              :kind="item.kind"
              :dispatch="
                item.evidence.kind === 'command'
                  ? item.evidence.commandStatus
                  : item.evidence.state.delivery.kind
              "
              :receipt="
                item.evidence.kind === 'command'
                  ? (commandDetails[item.id]?.observation.progress ?? 'unknown')
                  : item.evidence.state.execution
              "
              :effect="
                item.evidence.kind === 'command'
                  ? (commandDetails[item.id]?.observation.effect ?? 'unverified')
                  : item.evidence.effect
              "
            />
            <p
              v-if="item.evidence?.kind === 'command' && item.evidence.dispatchFailure"
              role="status"
            >
              {{ t('policies.dispatchFailure') }}
            </p>
            <template v-if="item.kind === 'command'"
              ><UiButton :disabled="busy" @click="inspect(item.device, item.id)">{{
                t('policies.inspectAction')
              }}</UiButton
              ><NativeTaskFacts
                v-if="commandDetails[item.id]"
                :operation="commandDetails[item.id]!"
                :device="item.device"
            /></template>
            <p class="ui-help">{{ t('policies.ux.stagesHint') }}</p>
          </details>
        </template>
      </UiTable>
      <UiButton v-if="records.nextCursor" :disabled="busy" @click="load(records.nextCursor)">{{
        t('policies.next')
      }}</UiButton>
    </section>
  </PageFrame>
</template>
