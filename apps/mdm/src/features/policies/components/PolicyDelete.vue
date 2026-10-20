<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PolicyRead } from '../clients/model'
const props = defineProps<{ policy: PolicyRead; disabled: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()
const confirming = ref(false)
watch(
  () => [props.policy.id, props.policy.revision, props.policy.state, props.disabled],
  () => {
    confirming.value = false
  },
  { flush: 'sync' },
)
function confirm() {
  if (!confirming.value || props.disabled || props.policy.state !== 'disabled') return
  confirming.value = false
  emit('confirm')
}
</script>
<template>
  <template v-if="policy.state !== 'archived'">
    <p v-if="policy.state === 'enabled'">{{ t('policies.disableBeforeDelete') }}</p>
    <UiButton
      type="button"
      data-action="delete-policy"
      :disabled="disabled || policy.state !== 'disabled'"
      @click="confirming = true"
      >{{ t('policies.deletePolicy') }}</UiButton
    >
    <UiDialog
      :open="confirming"
      :title="t('policies.deletePolicy')"
      :description="t('policies.deletePolicyHint')"
      :close-label="t('console.close')"
      kind="alertdialog"
      @update:open="confirming = $event"
    >
      <p>
        {{ policy.definition.selfService?.displayName ?? policy.id }} · {{ policy.id }} ·
        {{ t('policies.revision') }} {{ policy.revision }}
      </p>
      <p v-if="policy.definition.action.kind === 'configuration'">
        {{
          t(
            policy.definition.action.exit === 'remove'
              ? 'policies.configurationRemove'
              : 'policies.configurationRetain',
          )
        }}
      </p>
      <template #footer
        ><UiButton :disabled="disabled" @click="confirm">{{
          t('identity.confirm')
        }}</UiButton></template
      >
    </UiDialog>
  </template>
</template>
