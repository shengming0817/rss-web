<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { AuditFact } from '../clients/audit'
import { auditTime } from '../format'
const props = defineProps<{ fact: AuditFact; device?: string }>(),
  runtime = useMdm(),
  { t } = useI18n()
const device = computed(
  () =>
    props.fact.deviceId ??
    props.device ??
    (props.fact.target.type === 'device' ? props.fact.target.id : undefined),
)
// Only the backend's explicit native operation links for change requests carry this namespace.
const commands = computed(() =>
  props.fact.supported && ['command_cancel', 'command_reauthorize'].includes(props.fact.action)
    ? props.fact.relatedOperationIds
    : [],
)
</script>
<template>
  <div data-testid="audit-detail">
    <p>{{ t('operations.auditScope') }}</p>
    <dl class="settings-facts">
      <dt>{{ t('operations.auditUi.recorded') }}</dt>
      <dd>{{ auditTime(fact.recordedAt) }}</dd>
      <dt>{{ t('telemetry.observedAt') }}</dt>
      <dd>{{ auditTime(fact.observedAt) }}</dd>
      <dt>{{ t('operations.actor') }}</dt>
      <dd>{{ fact.actorKind }} / {{ fact.actor }}</dd>
      <dt>{{ t('operations.action') }}</dt>
      <dd>{{ fact.action }}</dd>
      <dt>{{ t('operations.object') }}</dt>
      <dd>{{ fact.target.type }} / {{ fact.target.id }}</dd>
      <dt>{{ t('operations.outcome') }}</dt>
      <dd>{{ fact.auditOutcome }}</dd>
      <dt>{{ t('telemetry.phase') }}</dt>
      <dd>{{ fact.phase }}</dd>
      <dt>{{ t('operations.auditUi.writeOutcome') }}</dt>
      <dd>{{ fact.requestWriteOutcome ?? '—' }}</dd>
      <dt>{{ t('operations.auditUi.execution') }}</dt>
      <dd>{{ fact.executionState ?? '—' }}</dd>
      <dt>{{ t('operations.effect') }}</dt>
      <dd>{{ fact.effect }}</dd>
      <dt>{{ t('operations.operation') }}</dt>
      <dd class="console-locator">{{ fact.operationId ?? '—' }}</dd>
      <dt>{{ t('operations.auditUi.related') }}</dt>
      <dd>
        <p v-for="id in fact.relatedOperationIds" :key="id">{{ id }}</p>
        <span v-if="!fact.relatedOperationIds.length">—</span>
      </dd>
      <dt>{{ t('operations.auditUi.supported') }}</dt>
      <dd>{{ t(fact.supported ? 'devices.yes' : 'devices.no') }}</dd>
    </dl>
    <nav v-if="device" class="console-inline-actions">
      <RouterLink :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device } }">{{
        t('devices.detail')
      }}</RouterLink>
      <RouterLink
        :to="{
          name: 'device-history',
          params: { tenant: runtime.tenant, device, history: 'activity' },
          query: { ...(fact.operationId ? { operationId: fact.operationId } : {}) },
        }"
        >{{ t('operations.auditUi.timeline') }}</RouterLink
      >
      <RouterLink
        v-for="id in commands"
        :key="id"
        :to="{
          name: 'policy-execution',
          params: { tenant: runtime.tenant, execution: id },
          query: { device },
        }"
        >{{ t('operations.auditUi.command') }} · {{ id }}</RouterLink
      >
    </nav>
    <p class="ui-help">{{ t('operations.auditUi.operationHint') }}</p>
    <details>
      <summary>{{ t('policies.ux.technical') }}</summary>
      <dl class="settings-facts">
        <dt>{{ t('operations.auditUi.source') }}</dt>
        <dd>{{ fact.source }}</dd>
        <dt>{{ t('operations.auditUi.event') }}</dt>
        <dd>{{ fact.eventId }} · {{ fact.position }}</dd>
        <dt>{{ t('operations.auditUi.request') }}</dt>
        <dd>{{ fact.requestId ?? '—' }}</dd>
        <dt>{{ t('telemetry.registration') }}</dt>
        <dd>{{ fact.registrationId ?? '—' }}</dd>
        <dt>{{ t('operations.auditUi.registrationRequest') }}</dt>
        <dd>{{ fact.registrationRequestId ?? '—' }}</dd>
        <dt>{{ t('operations.auditUi.instance') }}</dt>
        <dd>{{ fact.instanceId ?? '—' }}</dd>
      </dl>
    </details>
  </div>
</template>
