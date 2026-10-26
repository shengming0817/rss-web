<script setup lang="ts">
import {
  VBtn,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
} from 'vuetify/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { AuditFact } from '../clients/audit'
import { auditTime, auditOutcome } from '../format'
const props = defineProps<{ fact: AuditFact; device?: string | undefined }>(),
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
    <VBtn
      v-if="device"
      variant="text"
      :to="{ name: 'device-activities', params: { tenant: runtime.tenant, device } }"
      >{{ t('policies.entry.activities') }}</VBtn
    >
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
      <dd>{{ auditOutcome(fact.auditOutcome, t) }}</dd>
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
      <VBtn
        variant="text"
        :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device } }"
        >{{ t('devices.detail') }}</VBtn
      >
      <VBtn
        variant="text"
        :to="{
          name: 'device-history',
          params: { tenant: runtime.tenant, device, history: 'activity' },
          query: { ...(fact.operationId ? { operationId: fact.operationId } : {}) },
        }"
        >{{ t('operations.auditUi.timeline') }}</VBtn
      >
      <VBtn
        v-for="id in commands"
        :key="id"
        variant="text"
        :to="{
          name: 'policy-execution',
          params: { tenant: runtime.tenant, execution: id },
          query: { device },
        }"
        >{{ t('operations.auditUi.command') }} · {{ id }}</VBtn
      >
    </nav>
    <p class="ui-help">{{ t('operations.auditUi.operationHint') }}</p>
    <VExpansionPanels
      ><VExpansionPanel>
        <VExpansionPanelTitle>{{ t('policies.ux.technical') }}</VExpansionPanelTitle
        ><VExpansionPanelText>
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
        </VExpansionPanelText></VExpansionPanel
      ></VExpansionPanels
    >
  </div>
</template>
