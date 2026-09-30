<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { SecurityRequest } from '../clients/requests-model'
defineProps<{ request: SecurityRequest; asOf: number }>()
const { t } = useI18n(),
  runtime = useMdm()
const at = (seconds: number) =>
  seconds <= 253402300799 ? new Date(seconds * 1000).toISOString() : String(seconds)
</script>
<template>
  <dl>
    <dt>{{ t('security.requestState') }}</dt>
    <dd data-testid="request-state">{{ t(`security.requestsState.${request.state}`) }}</dd>
    <dt>{{ t('devices.revision') }}</dt>
    <dd>{{ request.revision }}</dd>
    <dt>{{ t('security.asOf') }}</dt>
    <dd>{{ at(asOf) }}</dd>
    <dt>{{ t('security.requester') }}</dt>
    <dd>{{ request.requester }}</dd>
    <dt>{{ t('security.createdAt') }}</dt>
    <dd>{{ at(request.createdAt) }}</dd>
    <dt>{{ t('security.requestTarget') }}</dt>
    <dd v-if="request.target.kind === 'compliance_exception'">
      <RouterLink
        :to="{
          name: 'security-baselines',
          params: { tenant: runtime.tenant },
          query: { id: request.target.baseline },
        }"
        >{{ t('security.baseline') }} {{ request.target.baseline }} /
        {{ request.target.baselineRevision }}</RouterLink
      >
      ·
      <RouterLink
        :to="{
          name: 'security-rules',
          params: { tenant: runtime.tenant },
          query: { rule: request.target.rule },
        }"
        >{{ t('security.ruleRevision') }} {{ request.target.rule }} /
        {{ request.target.ruleVersion }}</RouterLink
      >
      ·
      <RouterLink
        :to="{
          name: 'security-compliance',
          params: { tenant: runtime.tenant },
          query: { device: request.target.device },
        }"
        >{{ request.target.device }}</RouterLink
      >
    </dd>
    <dd v-else-if="request.target.kind === 'risk_remediation'">
      <RouterLink
        :to="{
          name: 'security-risks',
          params: { tenant: runtime.tenant },
          query: { id: request.target.risk, device: request.target.device },
        }"
        >{{ request.target.risk }} · {{ request.target.device }}</RouterLink
      >
      · {{ t('security.assessment') }} {{ request.target.assessment }} /
      {{ request.target.assessmentVersion }}
    </dd>
    <dd v-else-if="request.target.kind === 'certificate_deploy'">
      <RouterLink
        :to="{
          name: 'security-certificates',
          params: { tenant: runtime.tenant },
          query: { id: request.target.certificate, device: request.target.device },
        }"
        >{{ t('security.certificates') }} {{ request.target.certificate }} /
        {{ request.target.certificateRevision }} · {{ request.target.device }}</RouterLink
      >
      · {{ request.target.fingerprint }}
    </dd>
    <dd v-else>
      <RouterLink
        :to="{
          name: 'security-materials',
          params: { tenant: runtime.tenant },
          query: {
            device: request.target.device,
            kind: request.target.material,
            ...(request.target.kind === 'material_access' ? { request: request.id } : {}),
          },
        }"
        >{{ request.target.device }} ·
        {{ t(`security.materialKinds.${request.target.material}`) }}</RouterLink
      >
      / {{ request.target.materialRevision }} · {{ request.target.volume ?? '—' }} ·
      {{ request.target.action }}
    </dd>
    <template v-if="request.consumption"
      ><dt>{{ t('security.consumption') }}</dt>
      <dd>{{ request.consumption.disclosure }} · {{ at(request.consumption.at) }}</dd></template
    >
    <dt>{{ t('security.justification') }}</dt>
    <dd>{{ request.reason }}</dd>
    <dt>{{ t('security.validFrom') }}</dt>
    <dd>{{ at(request.validFrom) }}</dd>
    <dt>{{ t('security.validUntil') }}</dt>
    <dd>{{ at(request.validUntil) }}</dd>
    <dt>{{ t('security.decision') }}</dt>
    <dd>
      {{
        request.decision
          ? `${request.decision.by} · ${at(request.decision.at)} · ${t(`security.requestsState.${request.decision.value}`)}`
          : '—'
      }}
    </dd>
    <dt>{{ t('security.revocation') }}</dt>
    <dd>
      {{ request.revocation ? `${request.revocation.by} · ${at(request.revocation.at)}` : '—' }}
    </dd>
    <dt>{{ t('operations.operation') }}</dt>
    <dd>{{ request.operation }}</dd>
  </dl>
</template>
