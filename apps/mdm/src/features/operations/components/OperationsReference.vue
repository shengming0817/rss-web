<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { OperationsReference } from '../clients/model'
const props = defineProps<{ target: OperationsReference }>()
const { t } = useI18n(),
  runtime = useMdm()
const link = computed(() => ({
  name:
    props.target.kind === 'compliance_rule'
      ? 'security-rules'
      : props.target.kind === 'baseline'
        ? 'security-baselines'
        : 'security-requests',
  params: { tenant: runtime.tenant },
  query:
    props.target.kind === 'compliance_rule' ? { rule: props.target.id } : { id: props.target.id },
}))
</script>
<template>
  <span>
    <RouterLink :to="link">{{ t(`operations.target.${target.kind}`) }} {{ target.id }}</RouterLink>
    · {{ t('devices.revision') }} {{ target.revision ?? '—' }}
    <template v-if="target.device">
      ·
      <RouterLink
        :to="{
          name: 'security-compliance',
          params: { tenant: runtime.tenant },
          query: { device: target.device },
        }"
        >{{ target.device }}</RouterLink
      ></template
    >
  </span>
</template>
