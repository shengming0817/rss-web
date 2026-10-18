<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PolicyRun } from '../clients/runs'
defineProps<{ run: PolicyRun }>()
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
        <dt>{{ t('software.definitionDigest') }}</dt>
        <dd class="console-wrap">{{ run.result.definitionDigest.join(',') }}</dd>
      </template>
    </dl>
    <p v-if="run.result?.kind === 'enrollment'">
      {{ t('software.requestMdm') }} · {{ run.result.entryOutcome }}
    </p>
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
    <section v-if="run.result?.kind === 'software'">
      <article v-for="step in run.result.evidence.steps" :key="step.index">
        <h4>{{ step.index + 1 }} · {{ step.package }}</h4>
        <pre>{{ JSON.stringify({ target: step.target, identity: step.identity }, null, 2) }}</pre>
        <dl>
          <dt>{{ t('software.detection') }}</dt>
          <dd>{{ step.before.state }} → {{ step.after.state }}</dd>
          <dt>{{ t('software.installerExit') }}</dt>
          <dd>{{ step.process.kind === 'exited' ? step.process.code : step.process.kind }}</dd>
          <dt>{{ t('software.rebootRequired') }}</dt>
          <dd>{{ step.rebootRequired ? t('software.yes') : t('software.no') }}</dd>
        </dl>
        <pre>{{ JSON.stringify({ before: step.before, after: step.after }, null, 2) }}</pre>
        <details v-if="'stdout' in step.diagnostics">
          <summary>{{ t('software.diagnostics') }}</summary>
          <p>
            {{ utc(step.diagnostics.executedAt) }} · {{ step.diagnostics.durationMs }} ms ·
            {{ step.diagnostics.failure ?? '—' }}
          </p>
          <pre>{{ step.diagnostics.stdout }}</pre>
          <pre>{{ step.diagnostics.stderr }}</pre>
        </details>
      </article>
    </section>
    <section v-if="run.result?.kind === 'collection'">
      <p>
        {{ utc(run.result.receivedAt) }} ·
        {{ run.result.trusted ? t('software.yes') : t('software.no') }}
      </p>
      <p>
        {{ run.result.planDigest.join(',') }} · {{ run.result.outputReference.bytes }} bytes ·
        {{ run.result.outputReference.sha256 }}
      </p>
      <ul>
        <li v-for="(query, id) in run.result.queries" :key="id">
          {{ id }} · {{ query.status }} · {{ query.rowCount }} · {{ query.enumerationComplete }}
        </li>
      </ul>
      <details v-if="'native' in run.result">
        <summary>{{ t('software.readEvidence') }}</summary>
        <pre>{{ JSON.stringify(run.result.native, null, 2) }}</pre>
      </details>
    </section>
    <details v-if="run.result?.kind === 'script' && 'stdout' in run.result.diagnostics">
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
