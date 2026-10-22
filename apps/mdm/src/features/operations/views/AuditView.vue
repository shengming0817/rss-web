<script setup lang="ts">
import { UiButton, UiTable, UiDialog } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { type AuditPage, type AuditFact, type AuditQuery } from '../clients/audit'
import { auditDraft, auditFilter } from '../components/audit-filter'
import { auditTime, auditOutcome } from '../format'
import PageFrame from '../../../components/PageFrame.vue'
import AuditFilters from '../components/AuditFilters.vue'
import AuditCoverage from '../components/AuditCoverage.vue'
import AuditFacts from '../components/AuditFacts.vue'
const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const draft = ref(auditDraft()),
  page = ref<AuditPage>(),
  selected = ref<AuditFact>(),
  applied = ref<AuditQuery>()
function load(cursor?: string) {
  if (busy.value) return
  let filter: AuditQuery
  page.value = undefined
  selected.value = undefined
  try {
    filter = cursor && applied.value ? { ...applied.value } : auditFilter(draft.value)
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  void run(
    () => runtime.operations.audit.list({ ...filter, ...(cursor ? { cursor } : {}) }),
    (v) => {
      page.value = v
      applied.value = filter
    },
  )
}
watch(
  () => JSON.stringify([route.fullPath, ...deviceBinding(runtime)]),
  () => {
    page.value = undefined
    selected.value = undefined
    applied.value = undefined
    draft.value = auditDraft(route.query)
    load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('operations.audit')" :busy="busy" :failure="failure">
    <p>{{ t('operations.auditHint') }}</p>
    <AuditFilters v-model="draft" :busy="busy" @submit="load()" />
    <p v-if="failure === 'conflict'" role="alert">{{ t('operations.auditUi.expired') }}</p>
    <template v-if="page">
      <p>
        {{ t('operations.applied') }} · {{ applied?.actor || t('devices.all') }} ·
        {{ applied?.action || t('devices.all') }} · {{ applied?.device || t('devices.all') }}
      </p>
      <AuditCoverage :coverage="page.coverage" />
      <UiTable
        :label="t('operations.audit')"
        :rows="page.items"
        :row-key="(v) => `${v.source}/${v.position}/${v.eventId}`"
        :busy="busy"
        :busy-label="t('devices.loading')"
        :empty-label="t('operations.emptyAudit')"
        :columns="[
          { key: 'recordedAt', label: t('operations.auditUi.recorded') },
          { key: 'actor', label: t('operations.actor') },
          { key: 'action', label: t('operations.action') },
          { key: 'target', label: t('operations.object') },
          { key: 'auditOutcome', label: t('operations.outcome') },
        ]"
      >
        <template #cell-recordedAt="{ row }"
          ><UiButton variant="ghost" @click="selected = row">{{
            auditTime(row.recordedAt)
          }}</UiButton></template
        >
        <template #cell-target="{ row }">{{ row.target.type }} / {{ row.target.id }}</template>
        <template #cell-auditOutcome="{ row }">{{ auditOutcome(row.auditOutcome, t) }}</template>
      </UiTable>
      <UiButton v-if="page.nextCursor" :disabled="busy" @click="load(page.nextCursor)">{{
        t('devices.next')
      }}</UiButton>
    </template>
    <UiDialog
      :open="!!selected"
      placement="right"
      :title="t('operations.auditDetail')"
      :close-label="t('console.close')"
      @update:open="selected = undefined"
      ><AuditFacts v-if="selected" :fact="selected" :device="applied?.device"
    /></UiDialog>
  </PageFrame>
</template>
