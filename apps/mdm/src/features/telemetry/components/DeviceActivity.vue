<script setup lang="ts">
import { VDialog, VCard, VCardActions, VBtn } from 'vuetify/components'
import { useDialogFocus } from '../../../ui/dialog-focus'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { type AuditPage, type AuditFact, type AuditQuery } from '../../operations/clients/audit'
import { auditDraft, auditFilter } from '../../operations/components/audit-filter'
import { auditTime, auditOutcome } from '../../operations/format'
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
const restoreDialogFocus = useDialogFocus(computed(() => !!selected.value))
</script>
<template>
  <section class="telemetry-section" :aria-busy="busy">
    <header class="telemetry-heading">
      <div>
        <h2>{{ t('telemetry.activity') }}</h2>
        <p>{{ t('telemetry.activityHint') }}</p>
      </div>
      <v-btn :disabled="busy" @click="load()">{{ t('devices.reload') }}</v-btn>
    </header>
    <UiMessage v-if="failure" tone="danger" :title="t('devices.' + failure)" />
    <p v-if="failure === 'conflict'" role="alert">{{ t('operations.auditUi.expired') }}</p>
    <AuditFilters v-model="draft" :busy="busy" device-timeline @submit="load()" />
    <template v-if="result">
      <AuditCoverage :coverage="result.coverage" />
      <ol class="telemetry-activity">
        <li v-for="event in result.items" :key="`${event.source}/${event.eventId}`">
          <time>{{ auditTime(event.recordedAt) }}</time>
          <div>
            <strong>{{ event.action }}</strong>
            <p>
              {{ auditOutcome(event.auditOutcome, t) }} · {{ event.phase }} · {{ event.effect }}
            </p>
            <v-btn variant="text" @click="selected = event">{{
              t('operations.auditDetail')
            }}</v-btn>
          </div>
        </li>
      </ol>
      <p v-if="!result.items.length" class="telemetry-empty">{{ t('telemetry.empty') }}</p>
      <v-btn v-if="result.nextCursor" :disabled="busy" @click="load(result.nextCursor)">{{
        t('devices.next')
      }}</v-btn>
      <RouterLink
        :to="{
          name: 'operations-audit',
          params: { tenant: runtime.tenant },
          query: { device, ...(applied?.operationId ? { operationId: applied.operationId } : {}) },
        }"
        >{{ t('operations.audit') }}</RouterLink
      >
    </template>
    <v-dialog
      :model-value="!!selected"
      :aria-label="t('operations.auditDetail')"
      :data-state="!!selected ? 'open' : 'closed'"
      @update:model-value="selected = undefined"
      @after-leave="restoreDialogFocus"
      ><v-card :title="t('operations.auditDetail')"
        ><div class="device-dialog-body">
          <AuditFacts v-if="selected" :fact="selected" :device="device" />
        </div>
        <v-card-actions
          ><v-btn variant="text" @click="selected = undefined">{{
            t('console.close')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
  </section>
</template>
