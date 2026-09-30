<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ComplianceAssessment } from '../clients/compliance-model'
defineProps<{ assessment: ComplianceAssessment }>()
const { t } = useI18n()
const at = (seconds: number) =>
  seconds <= 253402300799 ? new Date(seconds * 1000).toISOString() : String(seconds)
</script>
<template>
  <dl>
    <dt>{{ t('security.conclusion') }}</dt>
    <dd>
      {{ t(`security.state.${assessment.status}`) }} ·
      {{ t(`security.reason.${assessment.reason}`) }}
    </dd>
    <dt>{{ t('security.ruleRevision') }}</dt>
    <dd>{{ assessment.ruleId }} / {{ assessment.ruleVersion }}</dd>
    <dt>{{ t('security.evaluatedAt') }}</dt>
    <dd>{{ at(assessment.evaluatedAt) }}</dd>
    <dt>{{ t('security.watermark') }}</dt>
    <dd>{{ assessment.factWatermark }} · {{ assessment.dictionaryVersion }}</dd>
    <dt>{{ t('security.condition') }}</dt>
    <dd>{{ t(`security.state.${assessment.condition}`) }}</dd>
    <dt>{{ t('security.platform') }}</dt>
    <dd>
      {{ t(`security.platforms.${assessment.applicability.platform}`) }} ·
      {{ t(`security.state.${assessment.applicability.platformDecision}`) }}
    </dd>
  </dl>
  <details>
    <summary>{{ t('security.evidence') }}</summary>
    <h3>{{ t('security.platformSources') }}</h3>
    <ul>
      <li
        v-for="source in assessment.applicability.sources"
        :key="`${source.source}:${source.registration}:${source.generation}`"
      >
        {{ source.source }} · {{ t('devices.registration') }} {{ source.registration }} /
        {{ source.generation }} · {{ t('security.epoch') }} {{ source.epoch }}
      </li>
    </ul>
    <h3>{{ t('security.groupInputs') }}</h3>
    <ul>
      <li v-for="(group, index) in assessment.groups" :key="group.id">
        {{ group.id }} · {{ t('devices.revision') }} {{ group.revision }} ·
        {{ t('devices.memberVersion') }} {{ group.memberVersion }} · {{ group.memberSet ?? '—' }} ·
        {{ t('security.watermark') }} {{ group.assetWatermark ?? '—' }} ·
        {{ t(`security.state.${assessment.applicability.groups[index]!.decision}`) }}
      </li>
    </ul>
    <h3>{{ t('security.explanations') }}</h3>
    <ul>
      <li v-for="(explanation, index) in assessment.explanations" :key="index">
        {{ explanation.path.length ? explanation.path.join('.') : t('security.rootCondition') }} ·
        {{ t(`security.state.${explanation.outcome}`) }}
      </li>
    </ul>
    <h3>{{ t('security.factReferences') }}</h3>
    <p>{{ t('security.evidenceHint') }}</p>
    <section v-for="field in assessment.evidence" :key="field.field">
      <h4>{{ field.field }}</h4>
      <dl v-for="source in field.sources" :key="source.source">
        <dt>{{ t('devices.source') }}</dt>
        <dd>{{ source.source }}</dd>
        <dt>{{ t('devices.snapshot') }}</dt>
        <dd>{{ source.snapshotId }}</dd>
        <dt>{{ t('security.epoch') }}</dt>
        <dd>{{ source.epoch ?? '—' }}</dd>
        <dt>{{ t('devices.registration') }}</dt>
        <dd>{{ source.registration ?? '—' }} / {{ source.registrationGeneration ?? '—' }}</dd>
        <dt>{{ t('devices.observed') }}</dt>
        <dd>{{ at(source.observedAt) }}</dd>
        <dt>{{ t('devices.received') }}</dt>
        <dd>{{ at(source.receivedAt) }}</dd>
        <dt>{{ t('devices.actor') }}</dt>
        <dd>{{ source.actor ?? '—' }}</dd>
      </dl>
      <p v-if="!field.sources.length">{{ t('security.noEvidence') }}</p>
    </section>
  </details>
</template>
