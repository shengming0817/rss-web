<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SoftwareRun } from '../clients/runs'
defineProps<{ run: SoftwareRun }>()
const { t } = useI18n()
const utc = (at: number) =>
  new Date(at * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
</script>
<template>
  <section>
    <h3>{{ run.device }} · {{ run.taskId }}</h3>
    <dl>
      <dt>{{ t('policies.dispatch') }}</dt>
      <dd>{{ t(`software.run_${run.state.delivery.kind}`) }}</dd>
      <dt>{{ t('policies.execution') }}</dt>
      <dd>{{ t(`policies.fact.${run.state.execution}`) }}</dd>
      <dt>{{ t('policies.cancel') }}</dt>
      <dd>{{ t(`policies.state.${run.state.cancellation}`) }}</dd>
      <dt>{{ t('policies.effect') }}</dt>
      <dd>{{ t(`software.effect_${run.effect}`) }}</dd>
      <dt>{{ t('software.userAction') }}</dt>
      <dd>{{ run.userAction ? t('software.waitingUser') : '—' }}</dd>
      <dt>{{ t('software.registration') }}</dt>
      <dd>{{ run.registrationId }} / {{ run.generation }}</dd>
      <dt>{{ t('software.runWindow') }}</dt>
      <dd>{{ utc(run.availableAt) }} → {{ utc(run.deadline) }}</dd>
      <dt>{{ t('policies.attempt') }}</dt>
      <dd>{{ run.state.delivery.kind === 'queued' ? '—' : run.state.delivery.attempt }}</dd>
      <template v-if="run.result?.kind === 'software'">
        <dt>{{ t('software.installerExit') }}</dt>
        <dd>{{ run.result.installerExitCode ?? '—' }}</dd>
        <dt>{{ t('software.detection') }}</dt>
        <dd>{{ t(`software.detection_${run.result.detection}`) }}</dd>
        <dt>{{ t('software.observedVersion') }}</dt>
        <dd>{{ run.result.observedVersion ?? '—' }}</dd>
        <dt>{{ t('software.rebootRequired') }}</dt>
        <dd>{{ run.result.rebootRequired ? t('software.yes') : t('software.no') }}</dd>
        <dt>{{ t('software.definitionDigest') }}</dt>
        <dd class="device-wrap">{{ run.result.definitionDigest.join(',') }}</dd>
        <dt>{{ t('software.evidenceDigest') }}</dt>
        <dd class="device-wrap">{{ run.result.evidenceDigest.join(',') }}</dd>
      </template>
    </dl>
    <p v-if="!run.result">{{ t('software.noRunResult') }}</p>
    <template v-if="run.result?.kind === 'script'">
      <p>{{ t('software.scriptHistory') }}</p>
      <dl>
        <dt>{{ t('software.installerExit') }}</dt>
        <dd>{{ run.result.exitCode ?? '—' }}</dd>
        <dt>{{ t('software.collectedAt') }}</dt>
        <dd>{{ utc(run.result.collectedAt) }}</dd>
        <dt>{{ t('policies.observation.receivedAt') }}</dt>
        <dd>{{ utc(run.result.receivedAt) }}</dd>
        <dt>{{ t('software.budgetValid') }}</dt>
        <dd>{{ run.result.budgetValid ? t('software.yes') : t('software.no') }}</dd>
        <dt>{{ t('software.outputQuality') }}</dt>
        <dd>{{ run.result.quality }}</dd>
      </dl>
      <p v-if="run.result.outputReference">
        {{ t('software.outputReference') }} · {{ run.result.outputReference.bytes }} bytes ·
        {{ run.result.outputReference.sha256 }}
      </p>
      <pre v-if="'output' in run.result">{{ JSON.stringify(run.result.output, null, 2) }}</pre>
    </template>
    <details v-if="run.result && 'stdout' in run.result.diagnostics">
      <summary>{{ t('software.diagnostics') }}</summary>
      <p>
        {{ utc(run.result.diagnostics.executedAt) }} · {{ run.result.diagnostics.durationMs }} ms ·
        {{ run.result.diagnostics.failure ?? '—' }}
      </p>
      <pre>{{ run.result.diagnostics.stdout }}</pre>
      <pre>{{ run.result.diagnostics.stderr }}</pre>
    </details>
  </section>
</template>
