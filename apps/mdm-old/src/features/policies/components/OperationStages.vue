<script setup lang="ts">
import { VChip } from 'vuetify/components'

import { useI18n } from 'vue-i18n'
const props = defineProps<{
  kind: 'command' | 'action_run'
  dispatch: string
  receipt: string
  effect: string
}>()
const { t, te } = useI18n()
function label(stage: 'dispatch' | 'receipt' | 'effect', value: string) {
  const key =
    props.kind === 'action_run' && stage === 'dispatch'
      ? `software.run_${value}`
      : props.kind === 'action_run' && stage === 'effect'
        ? `software.effect_${value}`
        : props.kind === 'command' && stage === 'dispatch'
          ? `policies.state.${value}`
          : `policies.fact.${value}`
  return te(key) ? t(key) : value
}
</script>
<template>
  <dl class="operation-stages">
    <div>
      <dt><span>01</span>{{ t('policies.admission') }}</dt>
      <dd>
        <VChip>{{ t('policies.ux.accepted') }}</VChip>
      </dd>
    </div>
    <div>
      <dt><span>02</span>{{ t('policies.dispatch') }}</dt>
      <dd>{{ label('dispatch', dispatch) }}</dd>
    </div>
    <div>
      <dt><span>03</span>{{ t('policies.receipt') }}</dt>
      <dd>{{ label('receipt', receipt) }}</dd>
    </div>
    <div>
      <dt><span>04</span>{{ t('policies.effect') }}</dt>
      <dd>
        <VChip :color="['unknown', 'unverified'].includes(effect) ? 'warning' : undefined">{{
          label('effect', effect)
        }}</VChip>
      </dd>
    </div>
  </dl>
</template>
