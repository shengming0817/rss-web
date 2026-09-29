<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { BootstrapAttempt } from '../clients/bootstrap'
defineProps<{ attempt: BootstrapAttempt }>()
const { t } = useI18n()
</script>
<template>
  <dl>
    <dt>{{ t('software.sourceDirection') }}</dt>
    <dd>{{ t(`software.sourceAction_${attempt.kind}`) }}</dd>
    <dt>{{ t('software.attempt') }}</dt>
    <dd>{{ attempt.id }} · {{ t('policies.revision') }} {{ attempt.policyRevision }}</dd>
    <dt>{{ t('software.frozenSource') }}</dt>
    <dd>
      {{ attempt.source.source }} · {{ attempt.source.registrationId }} /
      {{ attempt.source.generation }}
    </dd>
    <dt>{{ t('policies.dispatch') }}</dt>
    <dd>{{ t(`software.bootstrapDelivery_${attempt.delivery}`) }}</dd>
    <dt>{{ t('software.sourceTask') }}</dt>
    <dd>{{ t(`software.bootstrapPhase_${attempt.phase}`) }}</dd>
    <dt>{{ t('software.installDetection') }}</dt>
    <dd>{{ t(`software.bootstrapInstall_${attempt.installation}`) }}</dd>
    <dt>{{ t('software.commandAckAt') }}</dt>
    <dd>
      {{
        attempt.acknowledgedAt === null
          ? '—'
          : new Date(attempt.acknowledgedAt * 1000).toISOString()
      }}
    </dd>
    <dt>{{ t('software.detectionAt') }}</dt>
    <dd>
      {{ attempt.detectedAt === null ? '—' : new Date(attempt.detectedAt * 1000).toISOString() }}
    </dd>
    <dt>{{ t('policies.until') }}</dt>
    <dd>{{ new Date(attempt.deadline * 1000).toISOString() }}</dd>
    <dt>{{ t('policies.nativeCode') }}</dt>
    <dd>{{ attempt.code ?? '—' }}</dd>
  </dl>
</template>
