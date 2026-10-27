<script setup lang="ts">
import {
  VBtn,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
} from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { ManagementActivity } from '../clients/activities'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'
import { auditTime } from '../format'
defineProps<{ fact: ManagementActivity; device: string }>()
const runtime = useMdm(),
  { t, te } = useI18n()
function label(value: string | null) {
  if (value === null) return t('policies.entry.notObserved')
  const key = `policies.entry.states.${value}`
  return te(key) ? t(key) : value
}
const dimensions = [
  'delivery',
  'execution',
  'effect',
  'reporting',
  'decision',
  'auditOutcome',
] as const
</script>
<template>
  <article class="console-panel" data-section="management-activity">
    <p>
      <time>{{ auditTime(fact.recordedAt) }}</time> · {{ label(fact.origin) }} ·
      {{ label(fact.kind) }} · {{ label(fact.phase) }}
    </p>
    <dl>
      <dt>{{ t('operations.auditUi.recorded') }}</dt>
      <dd>{{ auditTime(fact.recordedAt) }}</dd>
      <dt>{{ t('telemetry.observedAt') }}</dt>
      <dd>{{ auditTime(fact.observedAt) }}</dd>
      <dt>{{ t('policies.entry.source') }}</dt>
      <dd>{{ fact.source }}</dd>
      <template v-for="dimension in dimensions" :key="dimension"
        ><dt>{{ t(`policies.entry.${dimension}`) }}</dt>
        <dd>{{ label(fact[dimension]) }}</dd></template
      >
    </dl>
    <VBtn
      v-if="fact.links.policy"
      variant="text"
      :to="{
        name: 'policy-tools',
        params: { tenant: runtime.tenant },
        query: { policy: fact.links.policy },
      }"
      >{{ t('policies.policies') }}</VBtn
    >
    <VBtn
      v-if="fact.links.batch"
      variant="text"
      :to="{
        name: 'policy-event-batch',
        params: { tenant: runtime.tenant, device, batch: fact.links.batch },
      }"
      >{{ t('policies.entry.batch') }}</VBtn
    >
    <VBtn
      v-if="fact.links.task && fact.links.policy"
      variant="text"
      :to="{
        name: 'policy-execution',
        params: { tenant: runtime.tenant, execution: fact.links.task },
        query: { policy: fact.links.policy },
      }"
      >{{ t('policies.executions') }}</VBtn
    >
    <VBtn
      v-if="fact.links.operation"
      variant="text"
      :to="{
        name: 'policy-execution',
        params: { tenant: runtime.tenant, execution: fact.links.operation },
        query: { device },
      }"
      >{{ t('policies.executions') }}</VBtn
    >
    <VBtn
      v-if="fact.links.request"
      variant="text"
      :to="{
        name: 'operations-audit',
        params: { tenant: runtime.tenant },
        query: { device, operationId: fact.links.request },
      }"
      >{{ t('operations.audit') }}</VBtn
    >
    <CopyDeepLink
      v-if="fact.links.task"
      :target="{
        kind: 'task',
        instance: runtime.serviceId,
        tenant: runtime.tenant,
        device,
        task: fact.links.task,
      }"
    />
    <template v-if="fact.links.task && fact.links.attempt && fact.links.version"
      ><p v-for="step in fact.links.steps" :key="step">
        {{ step
        }}<CopyDeepLink
          :target="{
            kind: 'step',
            instance: runtime.serviceId,
            tenant: runtime.tenant,
            device,
            task: fact.links.task,
            attempt: fact.links.attempt,
            version: fact.links.version,
            step,
          }"
        /></p
    ></template>
    <VExpansionPanels
      ><VExpansionPanel>
        <VExpansionPanelTitle>{{ t('policies.ux.technical') }}</VExpansionPanelTitle
        ><VExpansionPanelText>
          <p>{{ fact.id }}</p>
          <p v-if="fact.target">{{ fact.target.registration }} · {{ fact.target.generation }}</p>
          <dl>
            <template
              v-for="key in [
                'policy',
                'version',
                'batch',
                'member',
                'request',
                'operation',
                'retirement',
                'task',
                'attempt',
              ] as const"
              :key="key"
              ><template v-if="fact.links[key]"
                ><dt>{{ key }}</dt>
                <dd>{{ fact.links[key] }}</dd></template
              ></template
            >
          </dl>
        </VExpansionPanelText></VExpansionPanel
      ></VExpansionPanels
    >
  </article>
</template>
