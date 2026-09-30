<script setup lang="ts">
import { utc } from '../presentation'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { Metrics, Report } from '../clients/admin-model'
import OperationsFrame from '../components/OperationsFrame.vue'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
const { t } = useI18n(),
  client = useMdm().operations.admin,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const from = ref(Math.floor(Date.now() / 1000) - 86400),
  until = ref(Math.floor(Date.now() / 1000)),
  metrics = ref<Metrics>(),
  page = ref<Awaited<ReturnType<typeof client.reports.list>>>(),
  selected = ref<Report>()
let pending: (() => Promise<boolean>) | undefined
async function refresh() {
  await run(
    () => client.metrics(from.value, until.value),
    (v) => (metrics.value = v),
  )
}
async function load(cursor?: string) {
  await run(
    () => client.reports.list(cursor),
    (v) => (page.value = v),
  )
}
function create() {
  if (busy.value || uncertain.value) return
  const body = operation({ from: from.value, until: until.value })
  pending = async () => {
    const accepted = await runWrite(
      () => client.reports.run(body),
      (v) => (selected.value = v),
    )
    if (accepted) await load()
    return accepted
  }
  void pending()
}
function open(id: string) {
  if (uncertain.value && id !== selected.value?.id) return
  void run(
    () => client.reports.read(id),
    (v) => (selected.value = v),
  )
}
onMounted(async () => {
  await refresh()
  await load()
})
</script>
<template>
  <OperationsFrame :title="t('operations.reports')" :busy="busy" :failure="failure">
    <p>{{ t('operations.metricHint') }}</p>
    <form @submit.prevent="refresh()">
      <fieldset :disabled="busy">
        <label for="report-from">{{ t('security.from') }}</label
        ><UtcTimeInput id="report-from" v-model="from" :max="until" /><label for="report-until">{{
          t('security.until')
        }}</label
        ><UtcTimeInput id="report-until" v-model="until" :min="from" /><button
          data-testid="refresh-metrics"
        >
          {{ t('devices.reload') }}
        </button>
      </fieldset>
    </form>
    <section v-if="metrics">
      <h2>{{ t('operations.metrics') }}</h2>
      <p>
        {{ metrics.scope }} ·
        {{ metrics.complete ? t('operations.complete') : t('operations.partial') }} ·
        {{ utc(metrics.from) }} — {{ utc(metrics.until) }} · {{ t('operations.asOf') }}
        {{ utc(metrics.asOf) }}
      </p>
      <dl>
        <dt>{{ t('operations.known') }}</dt>
        <dd>{{ metrics.known }}</dd>
        <dt>{{ t('operations.unknownCount') }}</dt>
        <dd>{{ metrics.unknown ?? t('mdm.unknown') }}</dd>
        <dt>Windows</dt>
        <dd>{{ metrics.windows ?? t('mdm.unknown') }}</dd>
        <dt>macOS</dt>
        <dd>{{ metrics.macos ?? t('mdm.unknown') }}</dd>
        <dt>{{ t('operations.pending') }}</dt>
        <dd>{{ metrics.pending ?? t('mdm.unknown') }}</dd>
      </dl>
      <h3>{{ t('operations.trend') }}</h3>
      <p v-if="!metrics.trend.length">{{ t('operations.noSamples') }}</p>
      <ul>
        <li v-for="sample in metrics.trend" :key="sample.at">
          {{ utc(sample.at) }} · {{ sample.known }} / {{ sample.unknown ?? t('mdm.unknown') }}
        </li>
      </ul>
    </section>
    <button data-testid="run-report" :disabled="busy || uncertain" @click="create()">
      {{ t('operations.runReport') }}</button
    ><button :disabled="busy" @click="load()">{{ t('operations.history') }}</button>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">
          {{ item.id }} · {{ item.phase }}
        </button>
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <section v-if="selected">
      <h2>{{ selected.id }}</h2>
      <p>
        {{ selected.phase }} · {{ selected.operation }} · {{ utc(selected.range.from) }} —
        {{ utc(selected.range.until) }}
      </p>
      <button :disabled="busy" @click="open(selected.id)">{{ t('policies.refresh') }}</button>
      <p v-if="selected.result">
        {{ selected.result.known }} / {{ selected.result.unknown ?? t('mdm.unknown') }} ·
        {{ selected.result.complete ? t('operations.complete') : t('operations.partial') }}
      </p>
    </section>
    <button
      v-if="uncertain && pending"
      data-testid="replay-write"
      :disabled="busy"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </button>
  </OperationsFrame>
</template>
