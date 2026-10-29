<script setup lang="ts">
import { VBtn, VDataTable } from 'vuetify/components'
import OperationDialog from '../components/OperationDialog.vue'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { type AuditPage, type AuditFact, type AuditQuery } from '../clients/audit'
import { auditDraft, auditFilter } from '../components/audit-filter'
import { auditTime, auditOutcome } from '../format'
import MdmPage from '../../../ui/MdmPage.vue'
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
  <MdmPage :title="t('operations.audit')" :busy="busy" :failure="failure">
    <p>{{ t('operations.auditHint') }}</p>
    <AuditFilters v-model="draft" :busy="busy" @submit="load()" />
    <p v-if="failure === 'conflict'" role="alert">{{ t('operations.auditUi.expired') }}</p>
    <template v-if="page">
      <p>
        {{ t('operations.applied') }} · {{ applied?.actor || t('devices.all') }} ·
        {{ applied?.action || t('devices.all') }} · {{ applied?.device || t('devices.all') }}
      </p>
      <AuditCoverage :coverage="page.coverage" />
      <VDataTable
        disable-sort
        hide-default-footer
        :items-per-page="-1"
        :aria-label="t('operations.audit')"
        :items="page.items"
        :item-value="(v) => `${v.source}/${v.eventId}`"
        :loading="busy"
        :loading-text="t('devices.loading')"
        :no-data-text="t('operations.emptyAudit')"
        :headers="[
          { key: 'recordedAt', title: t('operations.auditUi.recorded') },
          { key: 'actor', title: t('operations.actor') },
          { key: 'action', title: t('operations.action') },
          { key: 'target', title: t('operations.object') },
          { key: 'auditOutcome', title: t('operations.outcome') },
        ]"
      >
        <template #[`item.recordedAt`]="{ item: row }"
          ><VBtn variant="text" @click="selected = row">{{
            auditTime(row.recordedAt)
          }}</VBtn></template
        >
        <template #[`item.target`]="{ item: row }"
          >{{ row.target.type }} / {{ row.target.id }}</template
        >
        <template #[`item.auditOutcome`]="{ item: row }">{{
          auditOutcome(row.auditOutcome, t)
        }}</template>
      </VDataTable>
      <VBtn v-if="page.nextCursor" :disabled="busy" @click="load(page.nextCursor)">{{
        t('devices.next')
      }}</VBtn>
    </template>
    <OperationDialog
      :open="!!selected"
      placement="right"
      :title="t('operations.auditDetail')"
      :close-label="t('console.close')"
      @update:open="selected = undefined"
      ><AuditFacts v-if="selected" :fact="selected" :device="applied?.device"
    /></OperationDialog>
  </MdmPage>
</template>
