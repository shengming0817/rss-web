<script setup lang="ts">
import { UiButton, UiChart, UiUtcDateTimeInput } from '@rss/core/components'
import { utc } from '../../../../src/features/operations/presentation'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useDemo } from '../../../context'
import { operation, useOperation } from '../../../../src/services/useOperation'
import type { Metrics, Report } from '../clients/admin-model'
import PageFrame from '../../../../src/components/PageFrame.vue'
const { t } = useI18n(),
  route = useRoute(),
  client = useDemo().operations.admin,
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
    if (accepted && (await open(body.operationId))) await load()
    return accepted
  }
  void pending()
}
async function open(id: string) {
  if (uncertain.value && id !== selected.value?.id) return false
  if (!uncertain.value) selected.value = undefined
  return run(
    () => client.reports.read(id),
    (v) => (selected.value = v),
  )
}
function routeTarget() {
  selected.value = undefined
  pending = undefined
  if (typeof route.query['id'] === 'string') void open(route.query['id'])
}
watch(() => route.fullPath, routeTarget, { flush: 'post' })
onMounted(async () => {
  await refresh()
  await load()
  routeTarget()
})
</script>
<template>
  <PageFrame :title="t('operations.reports')" :busy="busy" :failure="failure">
    <p>{{ t('operations.metricHint') }}</p>
    <section class="console-panel">
      <h2>{{ t('console.activeFilters') }}</h2>
      <form @submit.prevent="refresh()">
        <fieldset :disabled="busy">
          <label for="report-from">{{ t('security.from') }}</label
          ><UiUtcDateTimeInput
            id="report-from"
            required
            :invalid-label="t('policies.invalidDate')"
            :model-value="from"
            :max="until"
            @update:model-value="from = $event ?? Number.NaN"
          /><label for="report-until">{{ t('security.until') }}</label
          ><UiUtcDateTimeInput
            id="report-until"
            required
            :invalid-label="t('policies.invalidDate')"
            :model-value="until"
            :min="from"
            @update:model-value="until = $event ?? Number.NaN"
          /><UiButton data-testid="refresh-metrics" type="submit">
            {{ t('devices.reload') }}
          </UiButton>
        </fieldset>
      </form>
    </section>
    <section v-if="metrics" class="console-panel">
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
      <UiChart
        kind="line"
        :label="t('operations.trend') + ' · ' + t('operations.known')"
        :points="metrics.trend.map((sample) => ({ label: utc(sample.at), value: sample.known }))"
        :empty-label="t('operations.noSamples')"
        :data-label="t('console.advanced')"
      />
      <h3>{{ t('operations.trend') }}</h3>
      <p v-if="!metrics.trend.length">{{ t('operations.noSamples') }}</p>
      <ul>
        <li v-for="sample in metrics.trend" :key="sample.at">
          {{ utc(sample.at) }} · {{ sample.known }} / {{ sample.unknown ?? t('mdm.unknown') }}
        </li>
      </ul>
    </section>
    <UiButton
      data-testid="run-report"
      :disabled="!!(busy || uncertain)"
      type="submit"
      @click="create()"
    >
      {{ t('operations.runReport') }}</UiButton
    ><UiButton :disabled="!!busy" type="submit" @click="load()">{{
      t('operations.history')
    }}</UiButton>
    <ul class="console-object-list">
      <li v-for="item in page?.items" :key="item.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="open(item.id)">
          {{ item.id }} · {{ item.phase }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="load(page.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
    <section v-if="selected" class="console-panel">
      <h2>{{ selected.id }}</h2>
      <p>
        {{ selected.phase }} · {{ selected.operation }} · {{ utc(selected.range.from) }} —
        {{ utc(selected.range.until) }}
      </p>
      <UiButton :disabled="!!busy" type="submit" @click="open(selected.id)">{{
        t('policies.refresh')
      }}</UiButton>
      <p v-if="selected.result">
        {{ selected.result.known }} / {{ selected.result.unknown ?? t('mdm.unknown') }} ·
        {{ selected.result.complete ? t('operations.complete') : t('operations.partial') }}
      </p>
    </section>
    <UiButton
      v-if="uncertain && pending"
      data-testid="replay-write"
      :disabled="!!busy"
      type="submit"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </UiButton>
  </PageFrame>
</template>
