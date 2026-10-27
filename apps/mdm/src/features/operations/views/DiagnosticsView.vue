<script setup lang="ts">
import { VBtn, VChip, VDataTable } from 'vuetify/components'
import OperationDialog from '../components/OperationDialog.vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
import ChannelFacts from '../../settings/components/ChannelFacts.vue'
import { auditTime } from '../format'
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
type Snapshot = Awaited<ReturnType<typeof runtime.settings.runtime.read>>
type Component = Snapshot['components'][number]
const snapshot = ref<Snapshot>(),
  selected = ref<Component>(),
  readAt = ref<number>()
const expected = [
  'inventory',
  'automation',
  'execution_recovery',
  'initialization',
  'telemetry',
] as const
const missing = computed(() =>
  expected.filter((name) => !snapshot.value?.components.some((c) => c.name === name)),
)
const notObserved = () => t('operations.diagnosticUi.notObserved')
const number = (value: number | null) => (value === null ? notObserved() : String(value))
const bool = (value: boolean | null) =>
  value === null ? notObserved() : t(value ? 'devices.yes' : 'devices.no')
const at = (value: number | null) => (value === null ? notObserved() : auditTime(value))
function load() {
  if (busy.value) return
  snapshot.value = undefined
  selected.value = undefined
  readAt.value = undefined
  void run(
    () => runtime.settings.runtime.read(),
    (value) => {
      snapshot.value = value
      readAt.value = Math.floor(Date.now() / 1000)
    },
  )
}
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    snapshot.value = undefined
    selected.value = undefined
    readAt.value = undefined
    load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <MdmPage :title="t('operations.diagnostics')" :busy="busy" :failure="failure">
    <template #actions
      ><VBtn :disabled="busy" @click="load">{{ t('devices.reload') }}</VBtn></template
    >
    <p>{{ t('operations.diagnosticUi.hint') }}</p>
    <template v-if="snapshot">
      <div class="console-inline-actions">
        <VChip>{{ t('operations.diagnosticUi.alive') }} · {{ bool(snapshot.alive) }}</VChip
        ><VChip>{{ t('operations.diagnosticUi.ready') }} · {{ bool(snapshot.ready) }}</VChip
        ><span v-if="readAt"
          >{{ t('operations.diagnosticUi.readAt') }} {{ auditTime(readAt) }}</span
        >
      </div>
      <ChannelFacts :channels="snapshot.channels" />
      <VDataTable
        disable-sort
        hide-default-footer
        :items-per-page="-1"
        :aria-label="t('operations.diagnostics')"
        :items="snapshot.components"
        :item-value="(v) => v.name"
        :loading="busy"
        :loading-text="t('devices.loading')"
        :no-data-text="t('operations.empty')"
        :headers="[
          { key: 'name', title: t('operations.diagnosticUi.component') },
          { key: 'readiness', title: t('operations.diagnosticUi.ready') },
          { key: 'health', title: t('operations.diagnosticUi.health') },
          { key: 'reasons', title: t('operations.diagnosticUi.reasons') },
        ]"
      >
        <template #[`item.name`]="{ item: row }"
          ><VBtn variant="text" @click="selected = row">{{
            t(`operations.diagnosticUi.componentName.${row.name}`)
          }}</VBtn></template
        >
        <template #[`item.readiness`]="{ item: row }">{{
          t(`operations.diagnosticUi.state.${row.readiness}`)
        }}</template>
        <template #[`item.health`]="{ item: row }"
          ><VChip
            :color="
              row.health === 'healthy'
                ? 'success'
                : row.health === 'degraded'
                  ? 'warning'
                  : 'secondary'
            "
            >{{ t(`operations.diagnosticUi.state.${row.health}`) }}</VChip
          ></template
        >
        <template #[`item.reasons`]="{ item: row }"
          ><span v-for="reason in row.reasons" :key="reason"
            >{{ t(`operations.diagnosticUi.reason.${reason}`) }} </span
          ><span v-if="!row.reasons.length">—</span></template
        >
      </VDataTable>
      <p v-if="missing.length" class="ui-help">
        {{ t('operations.diagnosticUi.omitted') }}:
        {{ missing.map((v) => t(`operations.diagnosticUi.componentName.${v}`)).join('、') }}
      </p>
    </template>
    <OperationDialog
      :open="!!selected"
      placement="right"
      :title="
        selected
          ? t(`operations.diagnosticUi.componentName.${selected.name}`)
          : t('operations.diagnostics')
      "
      :close-label="t('console.close')"
      @update:open="selected = undefined"
    >
      <div v-if="selected" data-testid="diagnostic-detail">
        <p>
          {{ t('operations.diagnosticUi.ready') }} ·
          {{ t(`operations.diagnosticUi.state.${selected.readiness}`) }} /
          {{ t('operations.diagnosticUi.health') }} ·
          {{ t(`operations.diagnosticUi.state.${selected.health}`) }}
        </p>
        <ul>
          <li v-for="reason in selected.reasons" :key="reason">
            {{ t(`operations.diagnosticUi.reason.${reason}`) }}
          </li>
        </ul>
        <dl class="settings-facts">
          <dt>{{ t('operations.diagnosticUi.task') }}</dt>
          <dd>
            {{
              selected.task === null
                ? notObserved()
                : t(`operations.diagnosticUi.state.${selected.task}`)
            }}
          </dd>
        </dl>

        <section v-if="selected.dependencies.length" class="console-panel">
          <h3>{{ t('operations.diagnosticUi.dependencies') }}</h3>
          <dl
            v-for="dependency in selected.dependencies"
            :key="dependency.name"
            class="settings-facts"
          >
            <dt>{{ t(`operations.diagnosticUi.dependency.${dependency.name}`) }}</dt>
            <dd>
              {{ t(`operations.diagnosticUi.state.${dependency.state}`)
              }}<span v-if="dependency.reason">
                · {{ t(`operations.diagnosticUi.reason.${dependency.reason}`) }}</span
              >
            </dd>
          </dl>
        </section>
        <section v-if="selected.queues.length" class="console-panel">
          <h3>{{ t('operations.diagnosticUi.queues') }}</h3>
          <dl v-for="queue in selected.queues" :key="queue.name" class="settings-facts">
            <dt>{{ t(`operations.diagnosticUi.queue.${queue.name}`) }}</dt>
            <dd>
              {{
                queue.count === null
                  ? notObserved()
                  : `${queue.truncated === true ? '≥ ' : ''}${queue.count}`
              }}<span v-if="queue.truncated === null">
                · {{ t('operations.diagnosticUi.truncationUnknown') }}</span
              >
            </dd>
          </dl>
        </section>
        <section v-if="selected.progress" class="console-panel">
          <h3>{{ t('operations.diagnosticUi.progress') }}</h3>
          <p>{{ t(`operations.diagnosticUi.state.${selected.progress.state}`) }}</p>
          <dl class="settings-facts">
            <dt>{{ t('operations.diagnosticUi.confirmedPosition') }}</dt>
            <dd>{{ number(selected.progress.confirmedPosition) }}</dd>
            <dt>{{ t('operations.diagnosticUi.sourceHead') }}</dt>
            <dd>{{ number(selected.progress.sourceHead) }}</dd>
            <dt>{{ t('operations.diagnosticUi.lagging') }}</dt>
            <dd>{{ bool(selected.progress.lagging) }}</dd>
            <dt>{{ t('operations.diagnosticUi.invocationAge') }}</dt>
            <dd>{{ number(selected.progress.invocationAgeMs) }}</dd>
            <dt>{{ t('operations.diagnosticUi.completedAge') }}</dt>
            <dd>{{ number(selected.progress.completedPassAgeMs) }}</dd>
            <dt>{{ t('operations.diagnosticUi.sourceAge') }}</dt>
            <dd>{{ number(selected.progress.sourceObservationAgeMs) }}</dd>
            <dt>{{ t('operations.diagnosticUi.applied') }}</dt>
            <dd>{{ number(selected.progress.applied) }}</dd>
          </dl>
          <p class="ui-help">{{ t('operations.diagnosticUi.progressHint') }}</p>
        </section>
        <section v-if="selected.bridge" class="console-panel">
          <h3>{{ t('operations.diagnosticUi.bridge') }}</h3>
          <p>{{ bool(selected.bridge.successful) }} · {{ at(selected.bridge.observedAt) }}</p>
          <p v-if="selected.bridge.reason">
            {{ t(`operations.diagnosticUi.reason.${selected.bridge.reason}`) }}
          </p>
        </section>
        <section v-if="selected.runner" class="console-panel">
          <h3>{{ t('operations.diagnosticUi.runner') }}</h3>
          <dl class="settings-facts">
            <dt>{{ t('settings.pendingAttempts') }}</dt>
            <dd>
              {{ selected.runner.truncated ? '≥ ' : '' }}{{ selected.runner.unresolvedAttempts }}
            </dd>
            <dt>{{ t('operations.diagnosticUi.scan') }}</dt>
            <dd v-if="selected.runner.scan">
              {{ bool(selected.runner.scan.successful) }} · {{ at(selected.runner.scan.observedAt)
              }}<span v-if="selected.runner.scan.reason">
                · {{ t(`operations.diagnosticUi.reason.${selected.runner.scan.reason}`) }}</span
              >
            </dd>
            <dd v-else>{{ notObserved() }}</dd>
          </dl>
          <p v-if="selected.runner.latestFailure">
            {{ t(`operations.diagnosticUi.stage.${selected.runner.latestFailure.stage}`) }} ·
            {{ t(`operations.diagnosticUi.reason.${selected.runner.latestFailure.reason}`) }} ·
            {{ at(selected.runner.latestFailure.observedAt) }}
          </p>
        </section>
        <section v-if="selected.dispatch" class="console-panel">
          <h3>{{ t('operations.diagnosticUi.dispatch') }}</h3>
          <dl class="settings-facts">
            <dt>{{ t('operations.diagnosticUi.consumed') }}</dt>
            <dd>{{ selected.dispatch.consumed }}</dd>
            <dt>{{ t('operations.diagnosticUi.watermark') }}</dt>
            <dd>{{ selected.dispatch.watermark }}</dd>
          </dl>
        </section>
      </div>
    </OperationDialog>
  </MdmPage>
</template>
