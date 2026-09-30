<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import SecurityFrame from '../components/SecurityFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.support,
  { run, busy, failure } = useOperation(),
  device = ref(''),
  report = ref<Awaited<ReturnType<typeof client.experience>>>()
const at = (v: number) => (v <= 253402300799 ? new Date(v * 1000).toISOString() : String(v))
function load() {
  if (busy.value || !device.value) return
  report.value = undefined
  const id = device.value
  void run(
    () => client.experience(id),
    (v) => {
      report.value = v
    },
  )
}
function changed() {
  report.value = undefined
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  load()
}
watch(() => route.fullPath, changed, { flush: 'sync' })
onMounted(changed)
</script>
<template>
  <SecurityFrame :title="t('security.experience')" :busy="busy" :failure="failure">
    <p>{{ t('security.experienceHint') }}</p>
    <form @submit.prevent="load">
      <label>{{ t('policies.device') }}<input v-model="device" :readonly="busy" required /></label
      ><button :disabled="busy">{{ t('devices.open') }}</button>
    </form>
    <section v-if="report" data-testid="experience-report">
      <h2>{{ report.experience.device }}</h2>
      <dl>
        <dt>{{ t('security.experienceWindow') }}</dt>
        <dd>{{ at(report.experience.window.from) }} → {{ at(report.experience.window.until) }}</dd>
        <dt>{{ t('security.provider') }}</dt>
        <dd>{{ report.experience.source?.provider ?? t('security.state.unknown') }}</dd>
        <dt>{{ t('security.frozenSource') }}</dt>
        <dd>
          {{
            report.experience.source
              ? `${report.experience.source.registration.source} · ${report.experience.source.registration.registrationId} / ${report.experience.source.registration.generation}`
              : t('security.state.unknown')
          }}
        </dd>
        <dt>{{ t('security.evaluatedAt') }}</dt>
        <dd>{{ at(report.experience.evaluatedAt) }}</dd>
        <dt>{{ t('security.asOf') }}</dt>
        <dd>{{ at(report.asOf) }}</dd>
      </dl>
      <table>
        <thead>
          <tr>
            <th>{{ t('security.experienceMetric') }}</th>
            <th>{{ t('security.experienceValue') }}</th>
            <th>{{ t('security.experienceCoverage') }}</th>
            <th>{{ t('security.sampleCount') }}</th>
            <th>{{ t('security.denominator') }}</th>
            <th>{{ t('security.unknownCount') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in report.experience.metrics" :key="m.metric">
            <th scope="row">{{ t(`security.experienceMetrics.${m.metric}`) }}</th>
            <td>
              {{ m.value === null ? t('security.state.unknown') : m.value }} ·
              {{ t(`security.experienceUnits.${m.metric}`) }}
            </td>
            <td>{{ t(`security.coverageStates.${m.state}`) }}</td>
            <td>{{ m.sampleCount }}</td>
            <td>
              {{ m.denominator ?? t('security.state.unknown') }} ·
              {{ t(`security.denominatorUnits.${m.metric}`) }}
            </td>
            <td>{{ m.unknownCount ?? t('security.state.unknown') }}</td>
          </tr>
        </tbody>
      </table>
      <nav class="device-actions" :aria-label="t('security.relatedRecords')">
        <RouterLink
          :to="{
            name: 'device-detail',
            params: { tenant: runtime.tenant, device: report.experience.device },
          }"
          >{{ t('policies.device') }}</RouterLink
        ><RouterLink
          :to="{
            name: 'security-support',
            params: { tenant: runtime.tenant },
            query: { device: report.experience.device },
          }"
          >{{ t('security.support') }}</RouterLink
        >
      </nav>
    </section>
  </SecurityFrame>
</template>
