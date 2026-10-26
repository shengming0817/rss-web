<script setup lang="ts">
import { VBtn } from 'vuetify/components'

import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { PolicyRead } from '../clients/model'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'
const props = defineProps<{ policy: PolicyRead }>()
const runtime = useMdm(),
  { t } = useI18n()
const binding = () => [...deviceBinding(runtime), props.policy.id, String(props.policy.revision)]
const op = useOperation([], binding)
const resolved = ref<Awaited<ReturnType<typeof runtime.policies.policies.resolve>>>()
watch(
  () => JSON.stringify(binding()),
  () => {
    resolved.value = undefined
  },
  { flush: 'sync' },
)
function inspect() {
  resolved.value = undefined
  void op.run(
    async () => {
      const result = await runtime.policies.policies.resolve({ kind: 'id', id: props.policy.id })
      if (
        result.capability.instance !== runtime.serviceId ||
        result.capability.tenant !== runtime.tenant
      )
        throw new Error('Wrong capability scope')
      return result
    },
    (value) => {
      resolved.value = value
    },
  )
}
</script>
<template>
  <section v-if="policy.state !== 'archived'" class="console-panel" data-section="policy-entry">
    <h3>{{ t('policies.entry.title') }}</h3>
    <p>
      {{
        policy.definition.selfService?.presentation.displayName ??
        policy.definition.alias ??
        policy.id
      }}
    </p>
    <CopyDeepLink
      :target="{
        kind: 'policy',
        instance: runtime.serviceId,
        tenant: runtime.tenant,
        id: policy.id,
      }"
    />
    <VBtn type="button" :disabled="op.busy.value" @click="inspect">{{
      t('policies.entry.inspect')
    }}</VBtn>
    <p v-if="op.failure.value" role="alert">{{ t(`devices.${op.failure.value}`) }}</p>
    <template v-if="resolved">
      <dl>
        <dt>{{ t('policies.entry.toolName') }}</dt>
        <dd>{{ resolved.capability.toolName }}</dd>
      </dl>
      <CopyDeepLink
        :target="{
          kind: 'policy',
          instance: runtime.serviceId,
          tenant: runtime.tenant,
          toolName: resolved.capability.toolName,
        }"
      />
      <CopyDeepLink
        v-if="resolved.capability.alias"
        :target="{
          kind: 'policy',
          instance: runtime.serviceId,
          tenant: runtime.tenant,
          alias: resolved.capability.alias,
        }"
      />
      <p>{{ t('policies.entry.readOnlyResolution') }}</p>
    </template>
    <RouterLink
      v-if="policy.definition.customEvent"
      :to="{
        name: 'policy-events',
        params: { tenant: runtime.tenant },
        query: { event: policy.definition.customEvent },
      }"
      >{{ t('policies.entry.members') }} · {{ policy.definition.customEvent }}</RouterLink
    >
    <RouterLink
      :to="{
        name: 'operations-audit',
        params: { tenant: runtime.tenant },
        query: { targetType: 'policy', targetId: policy.id },
      }"
      >{{ t('operations.audit') }}</RouterLink
    >
  </section>
</template>
