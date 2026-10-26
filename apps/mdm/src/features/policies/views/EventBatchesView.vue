<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { comparison } from '../../../services/directory-query'
import { identifier, uuid } from '../../../services/decode'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { policyName } from '../clients/model'
import type { EventBatch } from '../clients/events'
import { auditTime } from '../../operations/format'
import RetirementDetails from '../../devices/components/RetirementDetails.vue'
const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n(),
  client = runtime.policies.events
const device = computed(() => String(route.params['device'])),
  batch = computed(() => (typeof route.params['batch'] === 'string' ? route.params['batch'] : null))
const filter = ref(''),
  applied = ref(''),
  retirementId = ref<string>()
const op = useOperation([], () => [
  ...deviceBinding(runtime),
  device.value,
  batch.value ?? '',
  applied.value,
  filter.value,
])
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  detail = ref<EventBatch>(),
  members = ref<Awaited<ReturnType<typeof client.members>>>()
watch(
  filter,
  () => {
    page.value = undefined
  },
  { flush: 'sync' },
)
function load(cursor?: string) {
  if (op.busy.value) return
  page.value = undefined
  detail.value = undefined
  members.value = undefined
  retirementId.value = undefined
  try {
    identifier(device.value)
    if (batch.value) uuid(batch.value)
    if (!cursor) applied.value = filter.value ? policyName(filter.value) : ''
  } catch {
    op.failure.value = 'invalidRequest'
    return
  }
  if (batch.value) {
    const target = batch.value
    void op.run(
      async () => ({
        batch: await client.read(device.value, target),
        members: await client.members(device.value, target),
      }),
      (v) => {
        detail.value = v.batch
        members.value = v.members
      },
    )
  } else
    void op.run(
      () =>
        client.list(device.value, {
          filter: applied.value ? comparison('event', '==', applied.value) : undefined,
          cursor,
        }),
      (v) => (page.value = v),
    )
}
function more() {
  const cursor = members.value?.nextCursor,
    target = batch.value
  if (target && cursor) {
    members.value = undefined
    void op.run(
      () => client.members(device.value, target, { cursor }),
      (v) => (members.value = v),
    )
  }
}
watch(
  () => JSON.stringify([route.fullPath, ...deviceBinding(runtime)]),
  () => {
    page.value = undefined
    detail.value = undefined
    members.value = undefined
    applied.value = ''
    retirementId.value = undefined
    filter.value = typeof route.query['event'] === 'string' ? route.query['event'] : ''
    load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('policies.entry.batches')" :busy="op.busy.value" :failure="op.failure.value">
    <RouterLink
      :to="{
        name: 'device-activities',
        params: { tenant: runtime.tenant, device },
        query: batch ? { batch } : {},
      }"
      >{{ t('policies.entry.activities') }}</RouterLink
    >
    <p>{{ t('policies.entry.batchHint') }}</p>
    <form v-if="!batch" class="console-toolbar" @submit.prevent="load()">
      <label>{{ t('policies.entry.event') }}<input v-model="filter" class="ui-input" /></label
      ><UiButton type="submit" :disabled="op.busy.value">{{ t('devices.reload') }}</UiButton>
    </form>
    <UiButton v-else :disabled="op.busy.value" @click="load()">{{ t('devices.reload') }}</UiButton>
    <template v-if="page"
      ><p>{{ t('console.pageNotTotal') }}</p>
      <p v-if="!page.items.length">{{ t('policies.empty') }}</p>
      <ol>
        <li v-for="row in page.items" :key="row.id">
          <RouterLink
            :to="{
              name: 'policy-event-batch',
              params: { tenant: runtime.tenant, device, batch: row.id },
            }"
            >{{ row.event }} · {{ auditTime(row.createdAt) }} ·
            {{ t('policies.entry.memberCount', { count: row.members }) }}</RouterLink
          >
        </li>
      </ol>
      <UiButton v-if="page.nextCursor" :disabled="op.busy.value" @click="load(page.nextCursor)">{{
        t('devices.next')
      }}</UiButton></template
    >
    <section v-if="detail" class="console-panel" data-section="event-batch">
      <h2>{{ detail.event }}</h2>
      <p>
        {{ auditTime(detail.createdAt) }} · {{ t('policies.entry.deadline') }}
        {{ auditTime(detail.deadline) }}
      </p>
      <p>
        {{ t('policies.entry.memberCount', { count: detail.members }) }} ·
        {{ detail.request.source }}
      </p>
      <p v-for="(count, state) in detail.admission" :key="state">
        {{ t(`policies.entry.states.${state}`) }} · {{ count }}
      </p>
      <p v-if="detail.processingFailure" role="alert">{{ detail.processingFailure }}</p>
      <CopyDeepLink
        :target="{
          kind: 'batch',
          instance: runtime.serviceId,
          tenant: runtime.tenant,
          device,
          batch: detail.id,
        }"
      />
      <RouterLink
        :to="{
          name: 'policy-events',
          params: { tenant: runtime.tenant },
          query: { event: detail.event },
        }"
        >{{ t('policies.entry.currentMembers') }}</RouterLink
      >
      <RouterLink
        :to="{
          name: 'operations-audit',
          params: { tenant: runtime.tenant },
          query: { device, operationId: detail.operationId },
        }"
        >{{ t('operations.audit') }}</RouterLink
      >
      <details>
        <summary>{{ t('policies.ux.technical') }}</summary>
        <p>{{ detail.id }} · {{ detail.operationId }}</p>
      </details>
    </section>
    <p v-if="members && !members.items.length">{{ t('policies.empty') }}</p>
    <article
      v-for="member in members?.items"
      :key="member.id"
      class="console-panel"
      data-section="event-member"
    >
      <RouterLink
        :to="{
          name: 'policy-tools',
          params: { tenant: runtime.tenant },
          query: { policy: member.policyId },
        }"
        >{{ t('policies.policies') }} · {{ member.policyId }}</RouterLink
      >
      <p>{{ t(`policies.entry.states.${member.state}`) }} · {{ member.decision.reason }}</p>
      <p>{{ t('policies.version') }} · {{ member.versionId }}</p>
      <div
        v-for="operation in member.operations"
        :key="`${operation.reference.kind}/${operation.reference.id}`"
      >
        <template v-if="operation.reference.kind === 'retirement'"
          ><UiButton type="button" @click="retirementId = operation.reference.id">{{
            t('policies.entry.retirement')
          }}</UiButton></template
        >
        <template v-else
          ><RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: operation.reference.id },
              query: operation.reference.kind === 'run' ? { policy: member.policyId } : { device },
            }"
            >{{ t('policies.executions') }} · {{ operation.state }}</RouterLink
          ><CopyDeepLink
            v-if="operation.reference.kind === 'run'"
            :target="{
              kind: 'task',
              instance: runtime.serviceId,
              tenant: runtime.tenant,
              device,
              task: operation.reference.id,
            }"
        /></template>
      </div>
    </article>
    <UiButton v-if="members?.nextCursor" :disabled="op.busy.value" @click="more">{{
      t('devices.next')
    }}</UiButton>
    <RetirementDetails v-if="retirementId" :id="retirementId" />
  </PageFrame>
</template>
