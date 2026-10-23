<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import type { LocalAccount } from './authorization-presentation'
const props = defineProps<{
    accounts: LocalAccount[]
    existing: string[]
    canBrowse: boolean
    loaded: boolean
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
    ? `${a.login ?? id}${!a.enabled || !a.memberActive ? ' · ' + t('operations.ruleUi.inactive') : ''}`
    : id
}
</script>
<template>
  <div class="settings-actions">
    <UiButton v-if="canBrowse" :disabled="busy" @click="$emit('load')">{{
      t('operations.ruleUi.readAccounts')
    }}</UiButton>
    <UiButton v-if="more" :disabled="busy" @click="$emit('more')">{{
      t('operations.ruleUi.moreAccounts')
    }}</UiButton>
  </div>
  <label for="authorization-principal">{{ t('operations.ruleUi.existingPrincipal') }}</label>
  <select id="authorization-principal" v-model="value">
    <option value="">{{ t('operations.ruleUi.selectPrincipal') }}</option>
    <option v-for="id in choices" :key="id" :value="id">{{ label(id) }}</option>
  </select>
  <p class="ui-help">
    {{ t(loaded ? 'operations.ruleUi.directoryRead' : 'operations.ruleUi.directoryBoundary') }}
  </p>
  <details>
    <summary>{{ t('operations.ruleUi.advancedPrincipal') }}</summary>
    <label for="authorization-principal-id">{{ t('operations.subjectId') }}</label
    ><input
      id="authorization-principal-id"
      v-model="value"
      data-testid="subject-id"
      maxlength="36"
    />
  </details>
</template>
