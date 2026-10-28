<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VChip,
  VCol,
  VExpansionPanel,
  VExpansionPanels,
  VRow,
  VSelect,
  VSwitch,
  VTable,
  VTextField,
} from 'vuetify/components'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { HistoryFilter } from '../clients/compliance'
import { currentStatuses, type CurrentCompliance } from '../clients/compliance-model'
import AssessmentFacts from '../components/AssessmentFacts.vue'
import MdmPage from '../../../ui/MdmPage.vue'
const deviceQuery = useDirectoryQuery(
  ['id', 'status', 'primaryMdmRegistration', 'channels', 'enrollments', 'inventoryAvailable'],
  100,
)
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.compliance,
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const device = ref(''),
  current = ref<CurrentCompliance>(),
  directory = ref<Awaited<ReturnType<typeof runtime.devices.directory.list>>>(),
  assessments = ref<{ device: string; value?: CurrentCompliance }[]>([]),
  history = ref<Awaited<ReturnType<typeof client.history>>>(),
  bounded = ref(false),
  from = ref(Math.floor(Date.now() / 1000) - 86400),
  until = ref(Math.floor(Date.now() / 1000)),
  filter = ref<HistoryFilter>(),
  status = ref('all')
const counts = computed(() =>
  currentStatuses.map((value) => ({
    value,
    count: assessments.value.filter((row) => row.value?.status === value).length,
  })),
)
const visible = computed(() =>
  assessments.value.filter((row) => status.value === 'all' || row.value?.status === status.value),
)
const utc = (seconds: number) =>
  Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString().slice(0, 19) : ''
const fromInput = computed({
  get: () => utc(from.value),
  set: (v: string) => {
    from.value = Date.parse(v + 'Z') / 1000
  },
})
const untilInput = computed({
  get: () => utc(until.value),
  set: (v: string) => {
    until.value = Date.parse(v + 'Z') / 1000
  },
})
const tone = (value: string) =>
  value === 'compliant'
    ? 'success'
    : value === 'non_compliant'
      ? 'error'
      : value === 'pending'
        ? 'info'
        : 'warning'
function clearDevice() {
  current.value = undefined
  history.value = undefined
  filter.value = undefined
}
function open(id = device.value) {
  if (busy.value || !id.trim()) return
  clearDevice()
  device.value = id
  void run(
    () => client.current(id),
    (v) => {
      current.value = v
    },
  )
}
function devices(cursor?: string) {
  assessments.value = []
  directory.value = undefined
  void run(
    async () => {
      const page = await deviceQuery.read(cursor, (query) => runtime.devices.directory.list(query))
      if (!deviceQuery.complete.value) return { page, rows: [] }
      const results = await Promise.allSettled(page.items.map((item) => client.current(item.id)))
      return {
        page,
        rows: page.items.map((item, i) => {
          const result = results[i]!
          return {
            device: item.id,
            ...(result.status === 'fulfilled' ? { value: result.value } : {}),
          }
        }),
      }
    },
    (value) => {
      directory.value = value.page
      assessments.value = value.rows
    },
  )
}
deviceQuery.onClear(() => {
  directory.value = undefined
  assessments.value = []
})
function loadHistory(cursor?: string) {
  if (!current.value || busy.value) return
  if (
    bounded.value &&
    (!Number.isFinite(from.value) || !Number.isFinite(until.value) || from.value > until.value)
  ) {
    failure.value = 'invalidRequest'
    return
  }
  const id = current.value.device,
    next =
      cursor && filter.value
        ? { ...filter.value }
        : { limit: 20, ...(bounded.value ? { from: from.value, until: until.value } : {}) }
  if (!cursor) {
    history.value = undefined
    filter.value = undefined
  }
  void run(
    () => client.history(id, { ...next, ...(cursor ? { cursor } : {}) }),
    (value) => {
      history.value = value
      filter.value = next
    },
  )
}
function routeDevice() {
  clearDevice()
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  if (device.value) open(device.value)
  else devices()
}
watch(() => route.fullPath, routeDevice, { flush: 'sync' })
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    clearDevice()
    device.value = ''
    directory.value = undefined
    assessments.value = []
  },
  { flush: 'sync' },
)
onMounted(routeDevice)
</script>
<template>
  <MdmPage
    :title="t('security.compliance')"
    :description="t('security.complianceHint')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><v-btn :disabled="busy" @click="devices()">{{ t('devices.reload') }}</v-btn
      ><v-btn
        variant="tonal"
        :to="{ name: 'security-rules', params: { tenant: runtime.tenant } }"
        >{{ t('security.rules') }}</v-btn
      ></template
    >
    <v-alert type="info" variant="tonal" class="mb-4">{{ t('security.dashboardScope') }}</v-alert>
    <v-row v-if="directory" class="mb-4">
      <v-col v-for="item in counts" :key="item.value" cols="6" md="auto"
        ><v-card variant="tonal" :color="tone(item.value)"
          ><v-card-text
            ><div class="text-overline">{{ t(`security.state.${item.value}`) }}</div>
            <div class="text-h4">{{ item.count }}</div></v-card-text
          ></v-card
        ></v-col
      >
    </v-row>
    <v-card v-if="directory" :title="t('security.assessmentDirectory')" class="mb-4">
      <v-card-text>
        <v-select
          v-model="status"
          :label="t('security.conclusion')"
          :items="[
            { value: 'all', title: t('devices.all') },
            ...currentStatuses.map((value) => ({ value, title: t(`security.state.${value}`) })),
          ]"
        />
        <v-table :aria-label="t('security.assessmentDirectory')"
          ><thead>
            <tr>
              <th>{{ t('devices.deviceId') }}</th>
              <th>{{ t('security.conclusion') }}</th>
              <th>{{ t('security.rules') }}</th>
              <th>{{ t('devices.open') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visible" :key="row.device">
              <td>{{ row.device }}</td>
              <td>
                <v-chip :color="tone(row.value?.status ?? '')" size="small">{{
                  row.value
                    ? t(`security.state.${row.value.status}`)
                    : t('security.assessmentUnavailable')
                }}</v-chip>
              </td>
              <td>{{ row.value?.rules.length ?? '—' }}</td>
              <td>
                <v-btn variant="text" :disabled="busy" @click="open(row.device)">{{
                  t('security.assessmentDetails')
                }}</v-btn>
              </td>
            </tr>
            <tr v-if="directory && !visible.length">
              <td colspan="4">{{ t('devices.empty') }}</td>
            </tr>
          </tbody></v-table
        >
      </v-card-text>
    </v-card>
    <DirectoryControls :query="deviceQuery" :busy="busy" @load="devices" />
    <DirectoryResults
      v-if="!deviceQuery.complete.value"
      :items="directory?.items ?? []"
      :disabled="busy"
      @open="(row) => open(String(row.id))"
    />
    <v-card :title="t('security.assessmentDetails')" class="mb-4"
      ><v-card-text
        ><form data-testid="open-device" @submit.prevent="open()">
          <v-text-field
            v-model="device"
            :label="t('devices.deviceId')"
            required
            :readonly="busy"
          /><v-btn :disabled="busy" type="submit">{{ t('devices.open') }}</v-btn>
        </form></v-card-text
      ></v-card
    >
    <section v-if="current" data-testid="current-compliance">
      <h2 class="text-h5 mb-3">
        {{ current.device }} · {{ t(`security.state.${current.status}`) }}
      </h2>
      <v-btn
        variant="text"
        :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device: current.device } }"
        >{{ t('security.deviceDetail') }}</v-btn
      >
      <v-alert v-if="current.reason === 'no_rules'" type="warning" variant="tonal" class="my-4">{{
        t('security.noRules')
      }}</v-alert>
      <v-card v-for="rule in current.rules" :key="rule.ruleId" class="my-4"
        ><v-card-text
          ><div class="d-flex flex-wrap align-center ga-3 mb-3">
            <v-chip :color="tone(rule.status)">{{ t(`security.state.${rule.status}`) }}</v-chip>
            <h3 class="text-subtitle-1">{{ rule.ruleId }} / {{ rule.ruleVersion }}</h3>
            <v-btn
              variant="text"
              :to="{
                name: 'security-rules',
                params: { tenant: runtime.tenant },
                query: { rule: rule.ruleId },
              }"
              >{{ t('security.openRule') }}</v-btn
            >
          </div>
          <AssessmentFacts v-if="rule.current" :assessment="rule.current" />
          <template v-else
            ><v-alert type="info" variant="tonal">{{ t('security.pendingHint') }}</v-alert
            ><v-expansion-panels v-if="rule.previous" class="my-3"
              ><v-expansion-panel data-testid="previous-assessment" :title="t('security.previous')"
                ><template #text
                  ><AssessmentFacts
                    :assessment="
                      rule.previous
                    " /></template></v-expansion-panel></v-expansion-panels
          ></template>
          <v-btn
            variant="text"
            :to="{ name: 'policy-executions', params: { tenant: runtime.tenant } }"
            >{{ t('policies.executions') }}</v-btn
          >
          <p class="text-body-2 mt-2">{{ t('security.remediationVerification') }}</p>
        </v-card-text></v-card
      >
      <v-card :title="t('security.history')" class="my-4"
        ><v-card-text
          ><form data-testid="history-filter" @submit.prevent="loadHistory()">
            <v-switch
              v-model="bounded"
              :disabled="busy"
              data-testid="bounded-history"
              :label="t('security.filterTime')"
            /><v-row v-if="bounded"
              ><v-col
                ><v-text-field
                  id="compliance-from"
                  v-model="fromInput"
                  type="datetime-local"
                  :label="t('security.from') + ' (UTC)'"
                  required
                  :max="untilInput"
                  :disabled="busy" /></v-col
              ><v-col
                ><v-text-field
                  id="compliance-until"
                  v-model="untilInput"
                  type="datetime-local"
                  :label="t('security.until') + ' (UTC)'"
                  required
                  :min="fromInput"
                  :disabled="busy" /></v-col></v-row
            ><v-btn type="submit" :disabled="busy">{{ t('security.readHistory') }}</v-btn>
          </form>
          <p v-if="filter" class="mt-3">
            {{
              filter.from === undefined
                ? t('security.allTime')
                : `${new Date(filter.from * 1000).toISOString()} — ${new Date(filter.until! * 1000).toISOString()}`
            }}
          </p>
          <v-alert
            v-if="history && !history.items.length"
            type="info"
            variant="tonal"
            class="mt-3"
            >{{ t('security.emptyHistory') }}</v-alert
          ></v-card-text
        ></v-card
      >
      <v-card
        v-for="item in history?.items"
        :key="item.task"
        class="my-4"
        data-testid="historical-assessment"
        ><v-card-text
          ><h3 class="text-subtitle-1 mb-3">
            {{ t(`security.state.${item.disposition}`) }} · {{ item.task }}
          </h3>
          <AssessmentFacts :assessment="item" /><v-btn
            variant="text"
            :to="{
              name: 'security-rules',
              params: { tenant: runtime.tenant },
              query: { rule: item.ruleId, task: item.task },
            }"
            >{{ t('security.evaluationTask') }}</v-btn
          ></v-card-text
        ></v-card
      >
      <v-btn
        v-if="history?.nextCursor"
        :disabled="busy"
        data-testid="next-history"
        @click="loadHistory(history.nextCursor)"
        >{{ t('devices.next') }}</v-btn
      >
    </section>
  </MdmPage>
</template>
