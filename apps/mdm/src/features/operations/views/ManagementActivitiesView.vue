<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton, UiDialog } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
import ActivityFacts from '../components/ActivityFacts.vue'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { identifier, uuid } from '../../../services/decode'
import type { ActivityQuery } from '../clients/activities'
import { auditTime } from '../format'
const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n(),
  client = runtime.operations.activities
const device = computed(() => String(route.params['device']))
const applied = ref<ActivityQuery>({}),
  kind = ref(''),
  source = ref(''),
  status = ref('')
const op = useOperation([], () => [
  ...deviceBinding(runtime),
  device.value,
  JSON.stringify(applied.value),
  kind.value,
  source.value,
  status.value,
])
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  detail = ref<Awaited<ReturnType<typeof client.read>>>(),
  related = ref<Awaited<ReturnType<typeof client.list>>>()
watch(
  [kind, source, status],
  () => {
    page.value = undefined
    closeDetails()
  },
  { flush: 'sync' },
)
function load(cursor?: string) {
  if (op.busy.value) return
  const filter: ActivityQuery = cursor
    ? applied.value
    : {
        ...(kind.value ? { kind: kind.value } : {}),
        ...(source.value ? { source: source.value } : {}),
        ...(status.value ? { status: status.value } : {}),
      }
  try {
    identifier(device.value)
    if (!cursor)
      for (const key of ['policy', 'request', 'batch', 'task', 'operation'] as const)
        if (typeof route.query[key] === 'string') filter[key] = uuid(route.query[key])
  } catch {
    op.failure.value = 'invalidRequest'
    return
  }
  applied.value = filter
  page.value = undefined
  detail.value = undefined
  related.value = undefined
  void op.run(
    () => client.list(device.value, { ...filter, ...(cursor ? { cursor } : {}) }),
    (value) => (page.value = value),
  )
}
function inspect(id: string) {
  detail.value = undefined
  related.value = undefined
  void op.run(
    () => client.read(device.value, id),
    (value) => (detail.value = value),
  )
}
function closeDetails() {
  detail.value = undefined
  related.value = undefined
}
function moreRelated() {
  const selected = detail.value,
    cursor = related.value?.nextCursor ?? selected?.relatedCursor
  if (!selected || !cursor) return
  void op.run(
    () => client.list(device.value, { related: selected.activity.id, cursor }),
    (value) => (related.value = value),
  )
}
watch(
  () => JSON.stringify([route.fullPath, ...deviceBinding(runtime)]),
  () => {
    page.value = undefined
    detail.value = undefined
    related.value = undefined
    applied.value = {}
    kind.value = ''
    source.value = ''
    status.value = ''
    load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <PageFrame
    :title="t('policies.entry.activities')"
    :busy="op.busy.value"
    :failure="op.failure.value"
  >
    <RouterLink
      :to="{
        name: 'device-history',
        params: { tenant: runtime.tenant, device, history: 'activity' },
      }"
      >{{ t('devices.history') }}</RouterLink
    >
    <RouterLink
      :to="{ name: 'policy-event-batches', params: { tenant: runtime.tenant, device } }"
      >{{ t('policies.entry.batches') }}</RouterLink
    >
    <form class="console-toolbar" @submit.prevent="load()">
      <label
        >{{ t('policies.entry.kind')
        }}<select v-model="kind">
          <option value="">{{ t('gap.allStates') }}</option>
          <option
            v-for="value in ['policy', 'assignment', 'batch', 'execution', 'configuration']"
            :key="value"
          >
            {{ value }}
          </option>
        </select></label
      >
      <label>{{ t('policies.entry.source') }}<input v-model="source" /></label
      ><label>{{ t('gap.state') }}<input v-model="status" /></label>
      <UiButton type="submit" :disabled="op.busy.value">{{ t('devices.reload') }}</UiButton>
    </form>
    <p>{{ t('policies.entry.activitiesHint') }}</p>
    <template v-if="page">
      <p>{{ t('policies.entry.asOf') }} · {{ auditTime(page.asOf) }}</p>
      <p v-if="page.retainedFrom !== null">
        {{ t('policies.entry.retainedFrom') }} · {{ auditTime(page.retainedFrom) }}
      </p>
      <p v-for="coverage in page.coverage" :key="coverage.source">
        {{ coverage.source }} ·
        {{ t(coverage.complete ? 'policies.entry.covered' : 'policies.entry.partial') }}
        <span v-for="reason in coverage.reasons" :key="reason">{{ reason }} </span>
      </p>
      <p v-if="!page.items.length">{{ t('policies.empty') }}</p>
      <div v-for="fact in page.items" :key="fact.id">
        <ActivityFacts :fact="fact" :device="device" /><UiButton
          :disabled="op.busy.value"
          @click="inspect(fact.id)"
          >{{ t('policies.entry.related') }}</UiButton
        >
      </div>
      <UiButton v-if="page.nextCursor" :disabled="op.busy.value" @click="load(page.nextCursor)">{{
        t('devices.next')
      }}</UiButton>
    </template>
    <UiDialog
      :open="!!detail"
      placement="right"
      :title="t('policies.entry.related')"
      :close-label="t('console.close')"
      @update:open="closeDetails"
    >
      <template v-if="detail"
        ><ActivityFacts :fact="detail.activity" :device="device" />
        <p v-for="reason in detail.missing" :key="reason">{{ reason }}</p>
        <ActivityFacts
          v-for="fact in related?.items ?? detail.related"
          :key="fact.id"
          :fact="fact"
          :device="device"
        /><UiButton
          v-if="related ? related.nextCursor : detail.relatedCursor"
          :disabled="op.busy.value"
          @click="moreRelated"
          >{{ t('devices.next') }}</UiButton
        ></template
      >
    </UiDialog>
  </PageFrame>
</template>
