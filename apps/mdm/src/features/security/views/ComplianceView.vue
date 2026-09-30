<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { HistoryFilter } from '../clients/compliance'
import type { CurrentCompliance } from '../clients/compliance-model'
import AssessmentFacts from '../components/AssessmentFacts.vue'
import SecurityFrame from '../components/SecurityFrame.vue'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.compliance,
  { run, busy, failure } = useOperation()
const device = ref(''),
  current = ref<CurrentCompliance>(),
  directory = ref<Awaited<ReturnType<typeof runtime.devices.directory.list>>>(),
  history = ref<Awaited<ReturnType<typeof client.history>>>(),
  bounded = ref(false),
  from = ref(Math.floor(Date.now() / 1000) - 86400),
  until = ref(Math.floor(Date.now() / 1000)),
  filter = ref<HistoryFilter>()
function open(id = device.value) {
  if (busy.value) return
  current.value = undefined
  history.value = undefined
  filter.value = undefined
  device.value = id
  void run(
    () => client.current(id),
    (v) => (current.value = v),
  )
}
function devices(cursor?: string) {
  void run(
    () => runtime.devices.directory.list(cursor),
    (v) => (directory.value = v),
  )
}
function loadHistory(cursor?: string) {
  if (!current.value || busy.value) return
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
    (v) => {
      history.value = v
      filter.value = next
    },
  )
}
function routeDevice() {
  current.value = undefined
  history.value = undefined
  filter.value = undefined
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  if (device.value) open(device.value)
}
watch(() => route.fullPath, routeDevice, { flush: 'sync' })
onMounted(() => {
  if (typeof route.query['device'] === 'string') routeDevice()
  else devices()
})
</script>
<template>
  <SecurityFrame :title="t('security.compliance')" :busy="busy" :failure="failure">
    <p>{{ t('security.complianceHint') }}</p>
    <form data-testid="open-device" @submit.prevent="open()">
      <label>{{ t('policies.device') }}<input v-model="device" required :readonly="busy" /></label
      ><button :disabled="busy">{{ t('devices.open') }}</button>
    </form>
    <button :disabled="busy" @click="devices()">{{ t('security.chooseDevice') }}</button>
    <ul>
      <li v-for="item in directory?.items" :key="item.id">
        <button :disabled="busy" @click="open(item.id)">{{ item.name }} · {{ item.id }}</button>
      </li>
    </ul>
    <button v-if="directory?.nextCursor" :disabled="busy" @click="devices(directory.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <section v-if="current" data-testid="current-compliance">
      <h2>{{ current.device }} · {{ t(`security.state.${current.status}`) }}</h2>
      <RouterLink
        :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device: current.device } }"
        >{{ t('security.deviceDetail') }}</RouterLink
      >
      <p v-if="current.reason === 'no_rules'">{{ t('security.noRules') }}</p>
      <article v-for="rule in current.rules" :key="rule.ruleId" class="identity-card">
        <h3>
          {{ t(`security.state.${rule.status}`) }} · {{ rule.ruleId }} / {{ rule.ruleVersion }}
        </h3>
        <RouterLink
          :to="{
            name: 'security-rules',
            params: { tenant: runtime.tenant },
            query: { rule: rule.ruleId },
          }"
          >{{ t('security.openRule') }}</RouterLink
        >
        <AssessmentFacts v-if="rule.current" :assessment="rule.current" />
        <template v-else
          ><p>{{ t('security.pendingHint') }}</p>
          <details v-if="rule.previous" data-testid="previous-assessment">
            <summary>{{ t('security.previous') }}</summary>
            <AssessmentFacts :assessment="rule.previous" /></details
        ></template>
      </article>
      <h2>{{ t('security.history') }}</h2>
      <form data-testid="history-filter" @submit.prevent="loadHistory()">
        <fieldset :disabled="busy">
          <label
            ><input v-model="bounded" type="checkbox" data-testid="bounded-history" />{{
              t('security.filterTime')
            }}</label
          >
          <template v-if="bounded"
            ><label for="compliance-from">{{ t('security.from') }}</label
            ><UtcTimeInput id="compliance-from" v-model="from" :max="until" /><label
              for="compliance-until"
              >{{ t('security.until') }}</label
            ><UtcTimeInput id="compliance-until" v-model="until" :min="from"
          /></template>
          <button>{{ t('security.readHistory') }}</button>
        </fieldset>
      </form>
      <p v-if="filter">
        {{
          filter.from === undefined
            ? t('security.allTime')
            : `${new Date(filter.from * 1000).toISOString()} — ${new Date(filter.until! * 1000).toISOString()}`
        }}
      </p>
      <p v-if="history && !history.items.length">{{ t('security.emptyHistory') }}</p>
      <article
        v-for="item in history?.items"
        :key="item.task"
        class="identity-card"
        data-testid="historical-assessment"
      >
        <h3>{{ t(`security.state.${item.disposition}`) }} · {{ item.task }}</h3>
        <AssessmentFacts :assessment="item" />
        <RouterLink
          :to="{
            name: 'security-rules',
            params: { tenant: runtime.tenant },
            query: { rule: item.ruleId, task: item.task },
          }"
          >{{ t('security.evaluationTask') }}</RouterLink
        >
      </article>
      <button
        v-if="history?.nextCursor"
        :disabled="busy"
        data-testid="next-history"
        @click="loadHistory(history.nextCursor)"
      >
        {{ t('devices.next') }}
      </button>
    </section>
  </SecurityFrame>
</template>
