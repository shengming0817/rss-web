<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { utc } from '../format'
const props = defineProps<{ device: string }>(),
  runtime = useMdm(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), props.device])
const result = ref<Awaited<ReturnType<typeof runtime.devices.telemetry.configurations>>>()
async function load() {
  result.value = undefined
  await run(
    () => runtime.devices.telemetry.configurations(props.device),
    (v) => (result.value = v),
  )
}
watch(
  () => JSON.stringify([props.device, ...deviceBinding(runtime)]),
  () => void load(),
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <section class="console-panel telemetry-section" :aria-busy="busy">
    <header class="telemetry-heading">
      <div>
        <h2>{{ t('telemetry.assigned') }}</h2>
        <p>{{ t('telemetry.assignedHint') }}</p>
      </div>
      <UiButton :disabled="busy" @click="load">{{ t('devices.reload') }}</UiButton>
    </header>
    <UiMessage v-if="failure" tone="danger" :title="t('devices.' + failure)" />
    <p v-if="result" class="telemetry-caption">
      {{ t('telemetry.evaluatedAt') }} {{ utc(result.evaluatedAtMicros) }} ·
      {{ t('telemetry.registration') }} {{ result.registration?.id ?? '—' }} /
      {{ result.registration?.generation ?? '—' }}
    </p>
    <article
      v-for="config in result?.configurations"
      :key="config.policyId"
      class="telemetry-assignment"
    >
      <div>
        <strong>{{ config.resource.id }} / {{ config.resource.version }}</strong>
        <p>
          {{ config.source }} · {{ config.projection }} · {{ config.sampleMillis / 1000 }}s /
          {{ config.uploadMillis / 1000 }}s ·
          {{ t(config.supported ? 'telemetry.supported' : 'telemetry.unsupported') }}
        </p>
        <p v-if="config.boostExpiresAt">
          {{ t('telemetry.boost') }} {{ utc(config.boostExpiresAt * 1_000_000) }} ·
          {{ t('telemetry.normalCadence') }} {{ config.normalSampleMillis / 1000 }}s
        </p>
        <details>
          <summary>{{ t('devices.evidence') }}</summary>
          <pre>{{ config }}</pre>
        </details>
      </div>
      <RouterLink
        :to="{
          name: 'policy-telemetry',
          params: { tenant: runtime.tenant },
          query: { resource: config.resource.id, policy: config.policyId },
        }"
        >{{ t('telemetry.manageProfile') }}</RouterLink
      >
    </article>
    <p v-if="result && !result.configurations.length" class="telemetry-empty">
      {{ t('telemetry.noConfigurations') }}
    </p>
  </section>
</template>
