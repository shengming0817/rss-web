<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { RiskAssessment } from '../clients/risks-model'
defineProps<{ assessment: RiskAssessment }>()
const { t } = useI18n()
const at = (value: number) =>
  value <= 253402300799 ? new Date(value * 1000).toISOString() : String(value)
</script>
<template>
  <dl>
    <dt>{{ t('security.assessment') }}</dt>
    <dd>{{ assessment.id }} / {{ assessment.version }}</dd>
    <dt>{{ t('security.riskStateLabel') }}</dt>
    <dd data-testid="risk-state">
      {{ t(`security.riskState.${assessment.state}`) }} ·
      {{ t(`security.riskReason.${assessment.reason}`) }}
    </dd>
    <dt>{{ t('security.provider') }}</dt>
    <dd>{{ assessment.provider }} / {{ assessment.riskRevision }}</dd>
    <dt>{{ t('security.evaluatedAt') }}</dt>
    <dd>{{ at(assessment.evaluatedAt) }}</dd>
    <dt>{{ t('security.softwareVersion') }}</dt>
    <dd>
      {{ assessment.software.id }} /
      {{ assessment.software.version ?? t('security.state.unknown') }}
    </dd>
    <dt>{{ t('security.patch') }}</dt>
    <dd>
      {{ t(`security.patchState.${assessment.patch.state}`) }} ·
      {{ assessment.patch.targetVersion ?? '—' }}
    </dd>
    <dt>{{ t('security.evidence') }}</dt>
    <dd v-if="assessment.evidence">
      {{ assessment.evidence.id }} · {{ at(assessment.evidence.observedAt) }} ·
      {{ assessment.evidence.source.source }} · {{ assessment.evidence.source.registrationId }} /
      {{ assessment.evidence.source.generation }}
    </dd>
    <dd v-else>{{ t('security.noEvidence') }}</dd>
  </dl>
</template>
