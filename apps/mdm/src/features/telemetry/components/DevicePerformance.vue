<script setup lang="ts">
import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import { VAlert, VSelect, VTextField, VTable, VBtn } from 'vuetify/components'
import { controlEvent } from '../../policies/control-event'

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { FieldDefinition } from '../../devices/clients/assets'
import { seriesKey, type HistoryQuery } from '../client'
import type { Observation, Bucket } from '../model'
import TelemetryChart, { type ChartPoint } from './TelemetryChart.vue'
import { utc, quantity } from '../format'
const props = defineProps<{ device: string }>()
const runtime = useMdm(),
  { t } = useI18n()
const fields = ref<FieldDefinition[]>([]),
  field = ref(''),
  resource = ref(''),
  resources = ref<string[]>([]),
  resourceNext = ref<string | null>(null)
const range = ref('1h'),
  resolution = ref('auto'),
  series = ref(''),
  counterMode = ref('rate'),
  counterGap = ref(300)
const discoveryNext = ref<string | null>(null)
const rows = ref<Observation[]>([]),
  buckets = ref<Bucket[]>([]),
  next = ref<string | null>(null),
  unavailable = ref<Awaited<ReturnType<typeof runtime.devices.telemetry.history>>['unavailable']>(
    [],
  )
const aggregateOperation = ref('mean')
const end = ref(Date.now() * 1000),
  refreshed = ref<number | null>(null),
  retired = ref(false),
  table = ref(false)
function metricName(key: string) {
  const names: Record<string, string> = {
    'custom.baseline.cpu_busy_percent': 'cpu',
    'custom.baseline.memory_available_bytes': 'memory',
    'custom.baseline.memory_total_bytes': 'memoryTotal',
    'custom.baseline.filesystem_free_bytes': 'disk',
    'custom.baseline.filesystem_total_bytes': 'diskTotal',
    'custom.demo.cpu_busy_percent': 'cpu',
    'custom.demo.memory_available_bytes': 'memory',
    'custom.demo.filesystem_free_bytes': 'disk',
    'custom.demo.network_received': 'network',
    'custom.demo.service_state': 'serviceState',
  }
  return names[key] ? t('telemetry.names.' + names[key]) : key
}
const selectedField = computed(() => fields.value.find((x) => x.key === field.value))
const state = computed(() => selectedField.value?.timeSeries?.kind === 'state')
const counter = computed(() => selectedField.value?.timeSeries?.kind.endsWith('_counter') ?? false)
const start = computed(
  () => end.value - ({ '1h': 3600, '24h': 86400, '7d': 604800 }[range.value] ?? 3600) * 1_000_000,
)
const step = computed(() =>
  !counter.value && !operations.value.length
    ? 0
    : state.value || (counter.value && counterMode.value === 'total')
      ? 0
      : resolution.value === 'raw'
        ? counter.value
          ? 300_000_000
          : 0
        : resolution.value === '5m'
          ? 300_000_000
          : resolution.value === '1h'
            ? 3_600_000_000
            : range.value === '1h' && !counter.value
              ? 0
              : range.value === '7d'
                ? 3_600_000_000
                : 300_000_000,
)
const choices = computed(() => [...new Map(rows.value.map((r) => [seriesKey(r), r])).entries()])
const selectedRows = computed(() =>
  rows.value
    .filter((r) => seriesKey(r) === series.value)
    .sort(
      (a, b) => a.sample.observedAt - b.sample.observedAt || a.sample.sequence - b.sample.sequence,
    ),
)
const operations = computed(
  () =>
    selectedField.value?.timeSeries?.aggregations.filter((x) =>
      ['min', 'max', 'sum', 'count', 'mean'].includes(x),
    ) ?? [],
)
const basis = computed(() => selectedRows.value[0])
const { run, busy, failure } = useOperation(
  [],
  () => [
    ...deviceBinding(runtime),
    props.device,
    field.value,
    resource.value,
    range.value,
    resolution.value,
    series.value,
    counterMode.value,
    String(counterGap.value),
    aggregateOperation.value,
  ],
  () => props.device,
)
const query = (): HistoryQuery => ({
  device: props.device,
  field: field.value,
  resource: resource.value,
  startMicros: start.value,
  endMicros: end.value,
  maxPoints: 256,
  mode: 'history',
  after: null,
})
function clearData() {
  rows.value = []
  buckets.value = []
  unavailable.value = []
  next.value = null
  refreshed.value = null
  retired.value = false
  discoveryNext.value = null
}
function clearSelection() {
  const problem = failure.value
  clearData()
  resources.value = []
  resource.value = ''
  resourceNext.value = null
  failure.value = problem
}
function reload() {
  return resource.value ? load() : loadResources()
}
async function catalog() {
  fields.value = []
  clearData()
  resources.value = []
  field.value = ''
  await run(
    () => runtime.devices.assets.catalog(),
    (v) => {
      fields.value = v.fields
      field.value = v.fields.find((f) => f.timeSeries)?.key ?? ''
    },
  )
}
async function loadResources(after: string | null = null) {
  if (!after) {
    resources.value = []
    resource.value = ''
    resourceNext.value = null
    clearData()
  }
  if (!field.value || !selectedField.value?.timeSeries) return
  const old = after ? resources.value : []
  const ok = await run(
    () => runtime.devices.telemetry.resources(props.device, field.value, after),
    (v) => {
      resources.value = [...old, ...v.resources]
      resourceNext.value = v.nextAfter
      retired.value = v.retired
      if (!after) resource.value = v.resources[0] ?? ''
    },
  )
  if (!ok && failure.value) clearSelection()
}
async function load(after: string | null = null) {
  if (!resource.value) return
  if (after && step.value) {
    await aggregate(after, buckets.value)
    return
  }
  const oldRows = after ? rows.value : [],
    oldBuckets = after ? buckets.value : [],
    oldUnavailable = after ? unavailable.value : []
  if (!after) {
    clearData()
    end.value = Date.now() * 1000
  }
  const q = query()
  const ok = await run(
    () => runtime.devices.telemetry.history({ ...q, after: step.value ? null : after }),
    (v) => {
      rows.value = [...oldRows, ...v.rows]
      discoveryNext.value = v.next
      unavailable.value = [...oldUnavailable, ...v.unavailable]
      next.value = step.value ? null : v.next
      retired.value = v.retired
    },
  )
  if (!ok) {
    if (failure.value) clearSelection()
    return
  }
  if (!choices.value.some(([key]) => key === series.value))
    series.value = choices.value[0]?.[0] ?? ''
  if (step.value && basis.value) await aggregate(after, oldBuckets)
}
async function discover() {
  if (!discoveryNext.value) return
  const previous = rows.value
  const ok = await run(
    () => runtime.devices.telemetry.history({ ...query(), after: discoveryNext.value }),
    (v) => {
      rows.value = [...previous, ...v.rows]
      discoveryNext.value = v.next
    },
  )
  if (!ok && failure.value) clearSelection()
}
async function aggregate(after: string | null = null, previous: Bucket[] = []) {
  const row = basis.value
  if (!row || !step.value) return
  buckets.value = []
  next.value = null
  if (
    counter.value &&
    (!Number.isSafeInteger(counterGap.value) ||
      counterGap.value < 1 ||
      !Number.isSafeInteger(counterGap.value * 1_000_000))
  ) {
    failure.value = 'invalidRequest'
    return
  }
  const ok = await run(
    () =>
      runtime.devices.telemetry.aggregate({
        query: { ...query(), after },
        definitionVersion: row.sample.series.definition.version,
        registration: row.registration,
        source: row.source,
        epoch: row.epoch,
        dimensions: row.sample.series.dimensions,
        resolutionMicros: step.value,
        operation: counter.value
          ? 'rate'
          : (aggregateOperation.value as 'min' | 'max' | 'sum' | 'count' | 'mean'),
        coverage: { coverage: 'observedOnly' },
        maxGapMicros: counter.value ? counterGap.value * 1_000_000 : null,
      }),
    (v) => {
      buckets.value = [...previous, ...v.buckets]
      unavailable.value = v.unavailable
      next.value = v.next
      refreshed.value = v.refreshedThrough
    },
  )
  if (!ok && failure.value) clearSelection()
}
async function chooseSeries(event: Event) {
  series.value = (event.target as HTMLSelectElement).value
  buckets.value = []
  unavailable.value = []
  next.value = null
  if (step.value) await aggregate()
}
const points = computed<ChartPoint[]>(() => {
  if (step.value)
    return buckets.value.map((b, i) => ({
      id: String(b.window.start),
      at: b.window.start,
      end: b.window.end,
      value: b.value.kind === 'number' ? b.value.value : null,
      quality: b.completeness.join(', ') || t('telemetry.valid'),
      breakBefore:
        b.completeness.length > 0 || (i > 0 && buckets.value[i - 1]!.window.end < b.window.start),
    }))
  return selectedRows.value.map((row, i) => {
    const s = row.sample,
      previous = selectedRows.value[i - 1]?.sample
    return {
      id: s.id,
      at: s.observedAt,
      value: s.reading.quality === 'valid' ? s.reading.value : null,
      quality: t('telemetry.' + s.reading.quality),
      breakBefore:
        !!previous &&
        (s.sequence !== previous.sequence + 1 ||
          (counter.value &&
            s.reading.quality === 'valid' &&
            previous.reading.quality === 'valid' &&
            typeof s.reading.value === 'number' &&
            typeof previous.reading.value === 'number' &&
            s.reading.value < previous.reading.value)),
    }
  })
})
const unit = computed(
  () =>
    (!counter.value && step.value && aggregateOperation.value === 'count'
      ? t('telemetry.samplesUnit')
      : String(selectedField.value?.unit ?? '')) +
    (counter.value && counterMode.value === 'rate' ? '/s' : ''),
)
watch(
  () => JSON.stringify([props.device, ...deviceBinding(runtime)]),
  () => void catalog(),
  { immediate: true, flush: 'sync' },
)
watch(
  field,
  () => {
    const ops = operations.value
    aggregateOperation.value = ops.includes('mean') ? 'mean' : (ops[0] ?? 'mean')
    counterMode.value = selectedField.value?.timeSeries?.aggregations.includes('rate')
      ? 'rate'
      : 'total'
    void loadResources()
  },
  { flush: 'post' },
)
watch(
  [resource, range, resolution, counterMode, counterGap, aggregateOperation],
  () => void load(),
  {
    flush: 'post',
  },
)
</script>
<template>
  <section class="telemetry-section" :aria-busy="busy">
    <header class="telemetry-heading">
      <div>
        <h2>{{ t('telemetry.performance') }}</h2>
        <p>{{ t('telemetry.performanceHint') }}</p>
      </div>
      <v-btn :disabled="busy || !field" @click="reload">{{ t('devices.reload') }}</v-btn>
    </header>
    <VAlert v-if="failure" type="error" variant="tonal" :title="t('devices.' + failure)" />
    <div class="telemetry-toolbar">
      <label
        >{{ t('telemetry.range')
        }}<VSelect
          v-model="range"
          :aria-label="t('telemetry.range')"
          :items="[
            { title: String(t('telemetry.hour')), value: '1h' },
            { title: String(t('telemetry.day')), value: '24h' },
            { title: String(t('telemetry.week')), value: '7d' },
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><label
        >{{ t('telemetry.resolution')
        }}<VSelect
          v-model="resolution"
          :aria-label="t('telemetry.resolution')"
          :disabled="state || (counter && counterMode === 'total')"
          :items="[
            { title: String(t('telemetry.auto')), value: 'auto' },
            ...(!counter ? [{ title: String(t('telemetry.raw')), value: 'raw' }] : []),
            { title: String(t('telemetry.fiveMinutes')), value: '5m' },
            { title: String(t('telemetry.oneHour')), value: '1h' },
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><label v-if="!state && !counter && step"
        >{{ t('telemetry.aggregateOperation')
        }}<VSelect
          v-model="aggregateOperation"
          :aria-label="t('telemetry.aggregateOperation')"
          :items="[
            ...operations.map((op) => ({
              title: String(t('telemetry.aggregation.' + op)),
              value: op,
            })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><span class="telemetry-caption">{{ utc(start) }} — {{ utc(end) }}</span>
    </div>
    <div class="telemetry-history-layout">
      <nav class="telemetry-metrics" :aria-label="t('telemetry.metrics')">
        <VBtn
          v-for="f in fields"
          :key="f.key"
          variant="text"
          height="auto"
          type="button"
          :aria-current="field === f.key ? 'page' : undefined"
          @click="field = f.key"
        >
          <strong>{{ metricName(f.key) }}</strong
          ><small v-if="metricName(f.key) !== f.key">{{ f.key }}</small
          ><small>{{ f.unit ?? '—' }} · {{ f.timeSeries?.kind ?? t('telemetry.unbound') }}</small>
        </VBtn>
      </nav>
      <div class="telemetry-series">
        <template v-if="selectedField?.timeSeries"
          ><div class="telemetry-toolbar">
            <label
              >{{ t('telemetry.resource')
              }}<VSelect
                v-model="resource"
                :aria-label="t('telemetry.resource')"
                :items="[...resources.map((id) => ({ title: String(id), value: id }))]"
                variant="outlined"
                density="comfortable"
                hide-details="auto" /></label
            ><v-btn v-if="resourceNext" :disabled="busy" @click="loadResources(resourceNext)">{{
              t('devices.next')
            }}</v-btn
            ><label v-if="choices.length"
              >{{ t('telemetry.series')
              }}<VSelect
                :aria-label="t('telemetry.series')"
                :model-value="series"
                :items="[
                  ...choices.map(([key, row]) => ({
                    title:
                      'v' +
                      String(row.sample.series.definition.version) +
                      '·' +
                      String(row.source) +
                      '·' +
                      String(row.registration) +
                      '·' +
                      String(row.epoch) +
                      '·' +
                      String(JSON.stringify(row.sample.series.dimensions)),
                    value: key,
                  })),
                ]"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
                @update:model-value="chooseSeries(controlEvent($event))" /></label
            ><v-btn v-if="step && discoveryNext" :disabled="busy" @click="discover">{{
              t('telemetry.moreSeries')
            }}</v-btn
            ><label v-if="counter"
              >{{ t('telemetry.counterMode')
              }}<VSelect
                v-model="counterMode"
                :aria-label="t('telemetry.counterMode')"
                :items="[
                  {
                    title: String(t('telemetry.rate')),
                    value: 'rate',
                    props: { disabled: !selectedField?.timeSeries?.aggregations.includes('rate') },
                  },
                  { title: String(t('telemetry.total')), value: 'total' },
                ]"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
            /></label>
          </div>
          <label v-if="counter && counterMode === 'rate'"
            >{{ t('telemetry.counterGap')
            }}<VTextField
              v-model.number="counterGap"
              type="number"
              min="1"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
          /></label>
          <p v-if="retired" role="status">{{ t('telemetry.retired') }}</p>
          <TelemetryChart
            v-if="points.length"
            :points="points"
            :start="start"
            :end="end"
            :unit="unit"
            :state="state"
          />
          <p v-else-if="!busy && !failure" class="telemetry-empty">
            {{ t('telemetry.noSamples') }}
          </p>
          <p v-if="refreshed !== null" class="telemetry-caption">
            {{ t('telemetry.refreshedThrough') }} {{ utc(refreshed) }}
          </p>
          <p v-for="(entry, i) in unavailable" :key="i" class="telemetry-notice">
            {{ t('telemetry.' + entry.reason) }} · {{ utc(entry.window.start) }} —
            {{ utc(entry.window.end) }}
          </p>
          <v-btn v-if="points.length" @click="table = !table">{{
            t('telemetry.dataDetails')
          }}</v-btn>
          <div v-if="table" class="telemetry-table-wrap">
            <VTable density="comfortable">
              <thead>
                <tr>
                  <th>{{ t('telemetry.observedAt') }}</th>
                  <th>{{ t('telemetry.value') }}</th>
                  <th>{{ t('telemetry.quality') }}</th>
                  <th>{{ t('telemetry.coverage') }}</th>
                  <th>{{ t('telemetry.source') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(p, i) in points" :key="p.id">
                  <td>{{ utc(p.at) }}</td>
                  <td>{{ p.value === null ? '—' : quantity(p.value) }} {{ unit }}</td>
                  <td>{{ p.quality }}</td>
                  <td>
                    {{
                      step && counter
                        ? quantity(
                            ((buckets[i]?.coveredMicros ?? 0) /
                              Math.max(
                                1,
                                (buckets[i]?.window.end ?? 0) - (buckets[i]?.window.start ?? 0),
                              )) *
                              100,
                          ) + '%'
                        : t('telemetry.notApplicable')
                    }}
                  </td>
                  <td>
                    {{ basis?.source }} / v{{ basis?.sample.series.definition.version }}
                    <MdmDisclosure>
                      <template #title>{{ t('devices.evidence') }}</template>
                      <pre>{{ step ? buckets[i] : selectedRows[i] }}</pre>
                    </MdmDisclosure>
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div>
          <v-btn v-if="next" :disabled="busy" @click="load(next)">{{ t('devices.next') }}</v-btn>
        </template>
        <div v-else class="telemetry-empty">
          <h3>{{ t('telemetry.unbound') }}</h3>
          <p>{{ t('telemetry.unboundHint') }}</p>
          <RouterLink :to="{ name: 'policy-metrics', params: { tenant: runtime.tenant } }">{{
            t('telemetry.metricsSettings')
          }}</RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
