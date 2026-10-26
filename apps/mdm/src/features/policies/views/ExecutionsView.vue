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
import AuthorizationFacts from '../components/AuthorizationFacts.vue'
import NativeTaskFacts from '../components/NativeTaskFacts.vue'
import OperationStages from '../components/OperationStages.vue'
import type { NativeOperation } from '../clients/native'
import type { EndpointDetail } from '../../devices/clients/endpoint-model'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute()
const activeFilter = ref<string>()
const queue = ref<'all' | 'waiting' | 'blocked' | 'unknown'>('all'),
  authorizationState = ref(''),
  authorizationReason = ref('')
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
  queue?: string | undefined
  authorizationState?: string | undefined
  authorizationReason?: string | undefined
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
  records.value = undefined
  const selection = cursor
    ? applied.value
    : {
        device: device.value || undefined,
        policy: policy.value || undefined,
        kind: kind.value || undefined,
        status: status.value || undefined,
        queue: queue.value,
        authorizationState: authorizationState.value || undefined,
        authorizationReason: authorizationReason.value || undefined,
      }
  const filter = allOf(
    ...(['device', 'policy', 'kind', 'status'] as const).map((key) =>
      selection[key] ? comparison(key, '==', selection[key]!) : undefined,
    ),
    selection.queue === 'waiting'
      ? allOf(
          comparison('kind', '==', 'command'),
          `(${comparison('status', '==', 'queued')}),(${comparison('status', '==', 'published')})`,
        )
      : selection.queue === 'blocked'
        ? comparison('authorization.state', '==', 'blocked')
        : selection.queue === 'unknown'
          ? comparison('status', '==', 'unknown')
          : undefined,
    selection.authorizationState
      ? comparison('authorization.state', '==', selection.authorizationState)
      : undefined,
    selection.authorizationReason
      ? comparison('authorization.reason', '==', selection.authorizationReason)
      : undefined,
  )
  activeFilter.value = filter
  commandDetails.value = {}
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
  ).then((ok) => {
    if (!ok && activeFilter.value === filter) statistics.value = undefined
  })
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
    statistics.value = undefined
    queue.value = 'all'
    authorizationState.value = ''
    authorizationReason.value = ''
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
    <div class="console-toolbar" role="group" :aria-label="t('policies.queues.title')">
      <UiButton
        v-for="value in ['all', 'waiting', 'blocked', 'unknown'] as const"
        :key="value"
        :aria-pressed="queue === value"
        :disabled="busy"
        @click="
          queue = value
          load()
        "
        >{{ t(`policies.queues.${value}`) }}</UiButton
      >
    </div>
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
      <label
        >{{ t('policies.authorization.title')
        }}<select v-model="authorizationState" class="ui-input">
          <option value="">{{ t('devices.all') }}</option>
          <option
            v-for="value in ['authorized', 'blocked', 'not_applicable']"
            :key="value"
            :value="value"
          >
            {{ t(`policies.authorization.${value}`) }}
          </option>
        </select></label
      >
      <label
        >{{ t('policies.authorization.reason')
        }}<select v-model="authorizationReason" class="ui-input">
          <option value="">{{ t('devices.all') }}</option>
          <option
            v-for="value in [
              'lifecycle_blocked',
              'registration_changed',
              'input_mismatch',
              'source_invalid',
            ]"
            :key="value"
            :value="value"
          >
            {{ t(`policies.authorization.${value}`) }}
          </option>
        </select></label
      >
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
          { key: 'authorization', label: t('policies.authorization.title') },
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
        <template #cell-authorization="{ row }"
          ><AuthorizationFacts
            :authorization="row.authorization"
            :reauthorization="row.reauthorization"
        /></template>
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
                  ? (commandDetails[item.id]?.observation.progress ??
                    item.evidence.observation.progress)
                  : item.evidence.state.execution
              "
              :effect="
                item.evidence.kind === 'command'
                  ? (commandDetails[item.id]?.observation.effect ??
                    item.evidence.observation.effect)
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
