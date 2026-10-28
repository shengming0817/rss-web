<script setup lang="ts">
import {
  VBtn,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VSelect,
  VTextField,
} from 'vuetify/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LocalAccount } from './authorization-presentation'
const props = defineProps<{
    accounts: LocalAccount[]
    existing: string[]
    canBrowse: boolean
    loaded: boolean
    denied: boolean
    more: boolean
    busy: boolean
  }>(),
  value = defineModel<string>({ required: true }),
  { t } = useI18n()
defineEmits<{ load: []; more: [] }>()
const choices = computed(() => [
  ...new Set([
    ...props.accounts.map((a) => a.principalId),
    ...props.existing,
    ...(value.value ? [value.value] : []),
  ]),
])
function label(id: string) {
  const a = props.accounts.find((a) => a.principalId === id)
  return a
    ? `${a.displayName ?? a.email ?? a.login ?? id}${a.enabled === false || a.memberActive === false ? ' · ' + t('operations.ruleUi.inactive') : ''}`
    : id
}
</script>
<template>
  <div class="settings-actions">
    <VBtn v-if="canBrowse" :disabled="busy" @click="$emit('load')">{{
      t('operations.ruleUi.readAccounts')
    }}</VBtn>
    <VBtn v-if="more" :disabled="busy" @click="$emit('more')">{{
      t('operations.ruleUi.moreAccounts')
    }}</VBtn>
  </div>
  <VSelect
    id="authorization-principal"
    v-model="value"
    :items="[
      { title: t('operations.ruleUi.selectPrincipal'), value: '' },
      ...choices.map((id) => ({ title: label(id), value: id })),
    ]"
    :label="t('operations.ruleUi.existingPrincipal')"
  />
  <p v-if="denied" role="alert">{{ t('operations.ruleUi.directoryDenied') }}</p>
  <p class="device-help">
    {{ t(loaded ? 'operations.ruleUi.directoryRead' : 'operations.ruleUi.directoryBoundary') }}
  </p>
  <VExpansionPanels
    ><VExpansionPanel>
      <VExpansionPanelTitle>{{ t('operations.ruleUi.advancedPrincipal') }}</VExpansionPanelTitle
      ><VExpansionPanelText eager>
        <VTextField
          id="authorization-principal-id"
          v-model="value"
          data-testid="subject-id"
          maxlength="36"
          :label="t('operations.subjectId')"
        /> </VExpansionPanelText></VExpansionPanel
  ></VExpansionPanels>
</template>
