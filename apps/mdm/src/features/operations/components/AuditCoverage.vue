<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AuditPage } from '../clients/audit'
defineProps<{ coverage: AuditPage['coverage'] }>()
const { t } = useI18n()
</script>
<template>
  <div class="audit-coverage" data-testid="audit-coverage">
    <div class="console-inline-actions">
      <span>{{
        t(coverage.complete ? 'operations.auditUi.caughtUp' : 'operations.auditUi.partial')
      }}</span>
    </div>
    <p class="ui-help">{{ t('operations.auditUi.coverageHint') }}</p>
  </div>
</template>
<style scoped>
.audit-coverage {
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.audit-coverage p {
  margin: 6px 0 0;
}
</style>
