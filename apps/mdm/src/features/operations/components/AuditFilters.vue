<script setup lang="ts">
import { UiButton, UiUtcDateTimeInput } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import type { AuditDraft } from './audit-filter'
defineProps<{ busy: boolean; deviceTimeline?: boolean }>()
defineEmits<{ submit: [] }>()
const draft = defineModel<AuditDraft>({ required: true }),
  { t } = useI18n()
</script>
<template>
  <form class="audit-query" data-testid="audit-filter" @submit.prevent="$emit('submit')">
    <fieldset :disabled="busy">
      <legend>{{ t('operations.auditUi.filters') }}</legend>
      <div class="audit-filter-grid">
        <div class="audit-field">
          <label for="audit-actor">{{ t('operations.actor') }}</label
          ><input id="audit-actor" v-model="draft.actor" class="ui-input" maxlength="256" />
        </div>
        <div class="audit-field">
          <label for="audit-action">{{ t('operations.action') }}</label
          ><input id="audit-action" v-model="draft.action" class="ui-input" maxlength="256" />
        </div>
        <div class="audit-field">
          <label for="audit-outcome">{{ t('operations.outcome') }}</label
          ><select id="audit-outcome" v-model="draft.outcome" class="ui-input">
            <option value="">{{ t('devices.all') }}</option>
            <option
              v-for="value in ['succeeded', 'denied', 'failed', 'unknown']"
              :key="value"
              :value="value"
            >
              {{ t(`operations.auditUi.${value}`) }}
            </option>
          </select>
        </div>
        <div class="audit-field">
          <label v-if="!deviceTimeline" for="audit-device">{{ t('policies.device') }}</label
          ><input
            v-if="!deviceTimeline"
            id="audit-device"
            v-model="draft.device"
            class="ui-input"
            maxlength="256"
          />
        </div>
      </div>
      <details>
        <summary>{{ t('policies.ux.technical') }}</summary>
        <label for="audit-target-id">{{ t('operations.auditUi.targetId') }}</label
        ><input id="audit-target-id" v-model="draft.targetId" class="ui-input" maxlength="256" />
        <label for="audit-target-type">{{ t('operations.auditUi.targetType') }}</label
        ><input
          id="audit-target-type"
          v-model="draft.targetType"
          class="ui-input"
          maxlength="256"
        />
        <label for="audit-operation">{{ t('operations.operation') }}</label
        ><input id="audit-operation" v-model="draft.operationId" class="ui-input" maxlength="36" />
      </details>
      <label
        ><input v-model="draft.bounded" type="checkbox" />{{
          t('operations.auditUi.bounded')
        }}</label
      >
      <template v-if="draft.bounded">
        <label for="audit-from">{{ t('security.from') }}</label
        ><UiUtcDateTimeInput
          id="audit-from"
          :model-value="draft.from"
          required
          :invalid-label="t('policies.invalidDate')"
          @update:model-value="draft.from = $event ?? Number.NaN"
        />
        <label for="audit-until">{{ t('security.until') }}</label
        ><UiUtcDateTimeInput
          id="audit-until"
          :model-value="draft.until"
          required
          :invalid-label="t('policies.invalidDate')"
          @update:model-value="draft.until = $event ?? Number.NaN"
        />
      </template>
      <UiButton type="submit">{{ t('operations.auditUi.query') }}</UiButton>
    </fieldset>
  </form>
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
