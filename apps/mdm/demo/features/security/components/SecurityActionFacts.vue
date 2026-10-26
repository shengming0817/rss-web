<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isSupportTarget } from '../clients/support-model'
import { useDemo } from '../../../context'
import type { SecurityAction } from '../clients/actions-model'
import ExecutionFacts from './ExecutionFacts.vue'
defineProps<{ action: SecurityAction }>()
const { t } = useI18n(),
  runtime = useDemo()
const at = (value: number | null) =>
  value === null
    ? '—'
    : value <= 253402300799
      ? new Date(value * 1000).toISOString()
      : String(value)
</script>
<template>
  <p>{{ t('security.actionHint') }}</p>
  <dl>
    <dt>{{ t('security.frozenSource') }}</dt>
    <dd>
      {{ action.source.source }} · {{ action.source.registrationId }} /
      {{ action.source.generation }}
    </dd>
    <dt>{{ t('security.createdAt') }}</dt>
    <dd>{{ at(action.createdAt) }}</dd>
    <dt>{{ t('security.validUntil') }}</dt>
    <dd>{{ at(action.deadline) }}</dd>
    <dt>{{ t('security.resultAt') }}</dt>
    <dd>{{ at(action.resultAt) }}</dd>
    <dt>{{ t('security.detectedAt') }}</dt>
    <dd>{{ at(action.detectedAt) }}</dd>
  </dl>
  <ExecutionFacts :execution="action.summary" />
  <nav class="console-inline-actions" :aria-label="t('security.relatedRecords')">
    <RouterLink
      :to="{
        name: 'security-requests',
        params: { tenant: runtime.tenant },
        query: { id: action.request },
      }"
      >{{ t('security.requests') }}</RouterLink
    >
    <RouterLink
      v-if="action.target.kind === 'risk_remediation'"
      :to="{
        name: 'security-risks',
        params: { tenant: runtime.tenant },
        query: { id: action.target.risk, device: action.target.device },
      }"
      >{{ t('security.risks') }}</RouterLink
    >
    <RouterLink
      v-else-if="isSupportTarget(action.target)"
      :to="{
        name: 'security-support',
        params: { tenant: runtime.tenant },
        query: { id: action.request, device: action.target.device },
      }"
      >{{ t(`security.supportKinds.${action.target.kind}`) }}</RouterLink
    >
    <RouterLink
      :to="{
        name: 'operations-audit',
        params: { tenant: runtime.tenant },
        query: { device: action.target.device },
      }"
      >{{ t('operations.audit') }}</RouterLink
    >
  </nav>
</template>
