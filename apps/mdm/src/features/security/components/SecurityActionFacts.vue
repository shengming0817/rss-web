<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { SecurityAction } from '../clients/actions-model'
import ExecutionFacts from '../../policies/components/ExecutionFacts.vue'
defineProps<{ action: SecurityAction }>()
const { t } = useI18n(),
  runtime = useMdm()
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
  <nav class="device-actions" :aria-label="t('security.relatedRecords')">
    <RouterLink
      :to="{ name: 'policy-execution', params: { tenant: runtime.tenant, execution: action.id } }"
      >{{ t('policies.detail') }}</RouterLink
    >
    <RouterLink
      :to="{
        name: 'security-requests',
        params: { tenant: runtime.tenant },
        query: { id: action.request },
      }"
      >{{ t('security.requests') }}</RouterLink
    >
    <RouterLink
      :to="{
        name: 'security-risks',
        params: { tenant: runtime.tenant },
        query: { id: action.target.risk, device: action.target.device },
      }"
      >{{ t('security.risks') }}</RouterLink
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
