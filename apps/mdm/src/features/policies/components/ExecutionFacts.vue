<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ExecutionSummary } from '../clients/executions'
defineProps<{ execution: ExecutionSummary }>()
const { t } = useI18n()
const facts = ['admission', 'dispatch', 'receipt', 'execution', 'effect', 'compliance'] as const
</script>
<template>
  <dl>
    <template v-for="field in facts" :key="field"
      ><dt>{{ t(`policies.${field}`) }}</dt>
      <dd>{{ t(`policies.fact.${execution[field]}`) }}</dd></template
    >
    <dt>{{ t('policies.waiting') }}</dt>
    <dd>{{ execution.waitingReason ? t(`policies.fact.${execution.waitingReason}`) : '—' }}</dd>
    <dt>{{ t('policies.attempt') }}</dt>
    <dd>{{ execution.attempt ?? '—' }}</dd>
    <dt>{{ t('policies.nativeCode') }}</dt>
    <dd>{{ execution.nativeCode ?? '—' }}</dd>
    <template v-if="execution.origin.kind === 'policy'"
      ><dt>{{ t('policies.revision') }}</dt>
      <dd>{{ execution.origin.revision }}</dd>
      <dt>{{ t('policies.cancel') }}</dt>
      <dd>{{ t(`policies.state.${execution.origin.cancellation}`) }}</dd></template
    >
  </dl>
</template>
