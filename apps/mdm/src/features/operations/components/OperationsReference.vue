<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { OperationsReference } from '../clients/model'
const props = defineProps<{ target: OperationsReference }>()
const { t } = useI18n(),
  runtime = useMdm()
const link = computed(() => {
  const target = props.target,
    params: { tenant: string; device?: string; execution?: string } = { tenant: runtime.tenant }
  const names = {
    alert_rule: 'operations-alertRules',
    identity_principal: 'accounts',
    authorization_rule: 'operations-authorization',
    user_group: 'operations-organization',
    delegation: 'operations-organization',
    report: 'operations-reports',
    connector: 'operations-integrations',
    settings: 'operations-settings',
    job: 'operations-settings',
    device: 'device-detail',
    policy: 'policy-policies',
    workflow: 'policy-workflows',
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
    <RouterLink :to="link">{{ t(`operations.target.${target.kind}`) }} {{ target.id }}</RouterLink>
    · {{ t('devices.revision') }} {{ target.revision ?? '—' }}
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
