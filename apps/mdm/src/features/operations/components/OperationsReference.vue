<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { OperationsReference } from '../clients/model'
const props = defineProps<{ target: OperationsReference }>()
const { t } = useI18n(),
  runtime = useMdm()
const link = computed(() => {
  if (['connector', 'settings', 'job'].includes(props.target.kind)) return null
  const target = props.target
  if (target.kind === 'workflow') return null
  const params: { tenant: string; device?: string; execution?: string } = { tenant: runtime.tenant }
  const names = {
    alert_rule: 'operations-alertRules',
    identity_principal: 'accounts',
    authorization_rule: 'operations-authorization',
    user_group: 'operations-organization',
    delegation: 'operations-organization',
    report: 'operations-reports',
    connector: 'settings-integrations',
    settings: 'settings-overview',
    job: 'settings-operations',
    device: 'device-detail',
    policy: 'policy-policies',
    compliance_rule: 'security-rules',
    baseline: 'security-baselines',
    certificate: 'security-certificates',
    risk: 'security-risks',
    security_action: 'security-actions',
    security_request: 'security-requests',
  } as const
  if (target.kind === 'device') params.device = target.id
  return {
    name: names[target.kind],
    params,
    query:
      target.kind === 'settings'
        ? { section: 'configuration' }
        : target.kind === 'compliance_rule'
          ? { rule: target.id }
          : target.kind === 'delegation'
            ? { id: target.id, kind: 'delegation' }
            : { id: target.id, ...(target.device ? { device: target.device } : {}) },
  }
})
</script>
<template>
  <span>
    <RouterLink v-if="link" :to="link"
      >{{ t(`operations.target.${target.kind}`) }} {{ target.id }}</RouterLink
    ><span v-else>{{ t(`operations.target.${target.kind}`) }} {{ target.id }}</span> ·
    {{ t('devices.revision') }} {{ target.revision ?? '—' }}
    <template v-if="target.device">
      ·
      <RouterLink
        :to="{
          name: 'device-detail',
          params: { tenant: runtime.tenant, device: target.device },
        }"
        >{{ target.device }}</RouterLink
      ></template
    >
  </span>
</template>
