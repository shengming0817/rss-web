<script setup lang="ts">
import {
  VBtn,
  VCheckbox,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VForm,
  VSelect,
  VTextField,
} from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import type { AuditDraft } from './audit-filter'
defineProps<{ busy: boolean; deviceTimeline?: boolean }>()
defineEmits<{ submit: [] }>()
function dateInput(value: number) {
  const date = new Date(value * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 19) : ''
}
function parseDate(value: string | null) {
  return value ? Date.parse(value + 'Z') / 1000 : Number.NaN
}
const draft = defineModel<AuditDraft>({ required: true }),
  { t } = useI18n()
</script>
<template>
  <VForm
    :disabled="busy"
    class="audit-query"
    data-testid="audit-filter"
    @submit.prevent="$emit('submit')"
  >
    <fieldset :disabled="busy">
      <legend>{{ t('operations.auditUi.filters') }}</legend>
      <div class="audit-filter-grid">
        <div class="audit-field">
          <VTextField
            id="audit-actor"
            v-model="draft.actor"
            maxlength="256"
            :label="t('operations.actor')"
          />
        </div>
        <div class="audit-field">
          <VTextField
            id="audit-action"
            v-model="draft.action"
            maxlength="256"
            :label="t('operations.action')"
          />
        </div>
        <div class="audit-field">
          <VSelect
            id="audit-outcome"
            v-model="draft.outcome"
            :items="[
              { title: t('devices.all'), value: '' },
              ...['succeeded', 'denied', 'failed', 'unknown'].map((value) => ({
                title: t(`operations.auditUi.${value}`),
                value: value,
              })),
            ]"
            :label="t('operations.outcome')"
          />
        </div>
        <div class="audit-field">
          <VTextField
            v-if="!deviceTimeline"
            id="audit-device"
            v-model="draft.device"
            maxlength="256"
            :label="t('policies.device')"
          />
        </div>
      </div>
      <VExpansionPanels
        ><VExpansionPanel>
          <VExpansionPanelTitle>{{ t('policies.ux.technical') }}</VExpansionPanelTitle
          ><VExpansionPanelText>
            <VTextField
              id="audit-target-id"
              v-model="draft.targetId"
              maxlength="256"
              :label="t('operations.auditUi.targetId')"
            />
            <VTextField
              id="audit-target-type"
              v-model="draft.targetType"
              maxlength="256"
              :label="t('operations.auditUi.targetType')"
            />
            <VTextField
              id="audit-operation"
              v-model="draft.operationId"
              maxlength="36"
              :label="t('operations.operation')"
            /> </VExpansionPanelText></VExpansionPanel
      ></VExpansionPanels>
      <VCheckbox v-model="draft.bounded" :label="t('operations.auditUi.bounded')" />
      <template v-if="draft.bounded">
        <VTextField
          id="audit-from"
          :model-value="dateInput(draft.from)"
          :label="t('security.from')"
          type="datetime-local"
          step="1"
          required
          @update:model-value="draft.from = parseDate($event)"
        />
        <VTextField
          id="audit-until"
          :model-value="dateInput(draft.until)"
          :label="t('security.until')"
          type="datetime-local"
          step="1"
          required
          @update:model-value="draft.until = parseDate($event)"
        />
      </template>
      <VBtn type="submit">{{ t('operations.auditUi.query') }}</VBtn>
    </fieldset>
  </VForm>
</template>

<style scoped>
.audit-filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: var(--space-4, 16px);
}
.audit-field {
  display: grid;
  gap: 6px;
  align-content: start;
}
.audit-query button[type='submit'] {
  justify-self: start;
}
</style>
