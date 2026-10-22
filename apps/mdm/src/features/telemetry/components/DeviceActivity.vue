<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage, UiDialog } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { type AuditPage, type AuditFact, type AuditQuery } from '../../operations/clients/audit'
import { auditDraft, auditFilter } from '../../operations/components/audit-filter'
import { auditTime } from '../../operations/format'
import AuditFilters from '../../operations/components/AuditFilters.vue'
import AuditCoverage from '../../operations/components/AuditCoverage.vue'
import AuditFacts from '../../operations/components/AuditFacts.vue'
const props = defineProps<{ device: string }>(),
  runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), props.device])
const result = ref<AuditPage>(),
  selected = ref<AuditFact>(),
  draft = ref(auditDraft()),
  applied = ref<AuditQuery>()
function load(cursor?: string) {
  if (busy.value) return
  let filter: AuditQuery
  result.value = undefined
  selected.value = undefined
  try {
    filter = cursor && applied.value ? { ...applied.value } : auditFilter(draft.value, true)
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  void run(
    () =>
      runtime.devices.directory.history(props.device, { ...filter, ...(cursor ? { cursor } : {}) }),
    (value) => {
      result.value = value
      applied.value = filter
    },
  )
}
watch(
  () => JSON.stringify([props.device, route.fullPath, ...deviceBinding(runtime)]),
  () => {
    result.value = undefined
    selected.value = undefined
    applied.value = undefined
    draft.value = auditDraft(route.query)
    load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <section class="telemetry-section" :aria-busy="busy">
    <header class="telemetry-heading">
      <div>
        <h2>{{ t('telemetry.activity') }}</h2>
        <p>{{ t('telemetry.activityHint') }}</p>
      </div>
      <UiButton :disabled="busy" @click="load()">{{ t('devices.reload') }}</UiButton>
    </header>
    <UiMessage v-if="failure" tone="danger" :title="t('devices.' + failure)" />
    <p v-if="failure === 'conflict'" role="alert">{{ t('operations.auditUi.expired') }}</p>
    <AuditFilters v-model="draft" :busy="busy" device-timeline @submit="load()" />
    <template v-if="result">
      <AuditCoverage :coverage="result.coverage" />
      <ol class="telemetry-activity">
        <li
          v-for="event in result.items"
          :key="`${event.source}/${event.position}/${event.eventId}`"
        >
          <time>{{ auditTime(event.recordedAt) }}</time>
          <div>
            <strong>{{ event.action }}</strong>
            <p>{{ event.auditOutcome }} · {{ event.phase }} · {{ event.effect }}</p>
            <UiButton variant="ghost" @click="selected = event">{{
              t('operations.auditDetail')
            }}</UiButton>
          </div>
        </li>
      </ol>
      <p v-if="!result.items.length" class="telemetry-empty">{{ t('telemetry.empty') }}</p>
      <UiButton v-if="result.nextCursor" :disabled="busy" @click="load(result.nextCursor)">{{
        t('devices.next')
      }}</UiButton>
      <RouterLink
        :to="{
          name: 'operations-audit',
          params: { tenant: runtime.tenant },
          query: { device, ...(applied?.operationId ? { operationId: applied.operationId } : {}) },
        }"
        >{{ t('operations.audit') }}</RouterLink
      >
    </template>
    <UiDialog
      :open="!!selected"
      placement="right"
      :title="t('operations.auditDetail')"
      :close-label="t('console.close')"
      @update:open="selected = undefined"
      ><AuditFacts v-if="selected" :fact="selected" :device="device"
    /></UiDialog>
  </section>
</template>
