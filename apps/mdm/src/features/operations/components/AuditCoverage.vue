<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AuditPage } from '../clients/audit'
defineProps<{ coverage: AuditPage['coverage'] }>()
const { t } = useI18n()
</script>
<template>
  <section class="console-panel" data-testid="audit-coverage">
    <p>{{ t(coverage.complete ? 'operations.auditUi.caughtUp' : 'operations.auditUi.partial') }}</p>
    <dl class="settings-facts">
      <dt>{{ t('operations.auditUi.indexed') }}</dt>
      <dd>{{ coverage.indexedThrough ?? '—' }}</dd>
      <dt>{{ t('operations.auditUi.sourceHead') }}</dt>
      <dd>{{ coverage.sourceThrough ?? '—' }}</dd>
    </dl>
    <p class="ui-help">{{ t('operations.auditUi.coverageHint') }}</p>
  </section>
</template>
