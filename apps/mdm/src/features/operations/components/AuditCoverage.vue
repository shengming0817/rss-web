<script setup lang="ts">
import { VAlert } from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import type { AuditPage } from '../clients/audit'
defineProps<{ coverage: AuditPage['coverage'] }>()
const { t } = useI18n()
</script>
<template>
  <VAlert
    :type="coverage.complete ? 'info' : 'warning'"
    variant="tonal"
    data-testid="audit-coverage"
  >
    <p>{{ t(coverage.complete ? 'operations.auditUi.caughtUp' : 'operations.auditUi.partial') }}</p>
    <p>{{ t('operations.auditUi.coverageHint') }}</p>
  </VAlert>
</template>
