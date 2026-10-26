<script setup lang="ts">
import { VBtn } from 'vuetify/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { utc } from '../format'
import AssignedConfigurations from './AssignedConfigurations.vue'
const props = defineProps<{ device: string }>(),
  runtime = useMdm(),
  { t } = useI18n()
const fields = ref<string[]>([]),
  field = ref(''),
  hours = ref('1'),
  from = ref(0),
  until = ref(0)
const { run, busy, failure } = useOperation([], () => [
  ...deviceBinding(runtime),
  props.device,
  field.value,
  hours.value,
])
const health = ref<Awaited<ReturnType<typeof runtime.devices.telemetry.health>>>(),
  gaps = ref<Awaited<ReturnType<typeof runtime.devices.telemetry.gaps>>>()
async function catalog() {
  fields.value = []
  health.value = undefined
  gaps.value = undefined
  await run(
    () => runtime.devices.assets.catalog(),
    (v) => {
      fields.value = v.fields.filter((f) => f.timeSeries).map((f) => f.key)
      field.value = fields.value[0] ?? ''
    },
  )
}
async function load() {
  health.value = undefined
  gaps.value = undefined
  if (!field.value) return
  until.value = Date.now() * 1000
  from.value = until.value - Number(hours.value) * 3600_000_000
  await run(
    async () => ({
      health: await runtime.devices.telemetry.health(
        props.device,
        field.value,
        from.value,
        until.value,
      ),
      gaps: await runtime.devices.telemetry.gaps(props.device, from.value, until.value),
    }),
    (v) => {
      health.value = v.health
      gaps.value = v.gaps
    },
  )
}
async function more() {
  const previous = gaps.value
  if (!previous?.next) return
  gaps.value = undefined
  const ok = await run(
    () => runtime.devices.telemetry.gaps(props.device, from.value, until.value, previous.next),
    (v) => (gaps.value = { ...v, reports: [...previous.reports, ...v.reports] }),
  )
  if (!ok && failure.value) health.value = undefined
}
watch(
  () => JSON.stringify([props.device, ...deviceBinding(runtime)]),
  () => void catalog(),
  { immediate: true, flush: 'sync' },
)
watch([field, hours], () => void load(), { flush: 'post' })
</script>
<template>
  <section class="telemetry-section" :aria-busy="busy">
    <header class="telemetry-heading">
      <div>
        <h2>{{ t('telemetry.collection') }}</h2>
        <p>{{ t('telemetry.collectionHint') }}</p>
      </div>
      <v-btn :disabled="busy || !field" @click="load">{{ t('devices.reload') }}</v-btn>
    </header>
    <UiMessage v-if="failure" tone="danger" :title="t('devices.' + failure)" />
    <div class="telemetry-toolbar">
      <label
        >{{ t('telemetry.metrics')
        }}<select v-model="field" :aria-label="t('telemetry.metrics')" class="ui-input">
          <option v-for="key in fields" :key="key" :value="key">{{ key }}</option>
        </select></label
      ><label
        >{{ t('telemetry.range')
        }}<select v-model="hours" :aria-label="t('telemetry.range')" class="ui-input">
          <option value="1">{{ t('telemetry.hour') }}</option>
          <option value="24">{{ t('telemetry.day') }}</option>
          <option value="168">{{ t('telemetry.week') }}</option>
        </select></label
      >
    </div>
    <p class="telemetry-notice">
      {{ t('telemetry.receivedWindowHint')
      }}<span v-if="until"> · {{ utc(from) }} — {{ utc(until) }}</span>
    </p>
    <div class="telemetry-health-grid">
      <section class="console-panel">
        <h3>{{ t('telemetry.batches') }}</h3>
        <article v-for="batch in health?.batches" :key="batch.batchId" class="telemetry-log">
          <time>{{ utc(batch.receivedAt) }}</time
          ><strong>{{ t('telemetry.delivery.' + batch.delivery) }}</strong>
          <p>
            {{ t('telemetry.valid') }} {{ batch.qualityCounts[0] }} · {{ t('telemetry.missing') }}
            {{ batch.qualityCounts[1] }} · {{ t('telemetry.failed') }} {{ batch.qualityCounts[2] }}
          </p>
          <details>
            <summary>{{ t('devices.evidence') }}</summary>
            <pre>{{ batch }}</pre>
          </details>
        </article>
        <p v-if="health?.batchesTruncated" role="status">{{ t('telemetry.truncated') }}</p>
        <p v-if="health && !health.batches.length">{{ t('telemetry.empty') }}</p>
        <details v-if="health?.retention.length">
          <summary>{{ t('telemetry.retentionProgress') }}</summary>
          <pre>{{ health.retention }}</pre>
          <p v-if="health.retentionTruncated">{{ t('telemetry.truncated') }}</p>
        </details>
      </section>
      <section class="console-panel">
        <h3>{{ t('telemetry.lossReports') }}</h3>
        <p class="telemetry-caption">{{ t('telemetry.lossHint') }}</p>
        <article v-for="report in gaps?.reports" :key="report.reportId" class="telemetry-log">
          <time>{{ utc(report.receivedAt) }}</time>
          <p v-for="(gap, i) in report.gaps" :key="i">
            {{ t('telemetry.loss.' + gap.reason) }} · {{ gap.count }} · {{ utc(gap.first) }} —
            {{ utc(gap.last) }}
          </p>
          <details>
            <summary>{{ t('devices.evidence') }}</summary>
            <pre>{{ report }}</pre>
          </details>
        </article>
        <p v-if="gaps && !gaps.reports.length">{{ t('telemetry.empty') }}</p>
        <v-btn v-if="gaps?.next" :disabled="busy" @click="more">{{ t('devices.next') }}</v-btn>
      </section>
    </div>
    <AssignedConfigurations :device="device" />
  </section>
</template>
