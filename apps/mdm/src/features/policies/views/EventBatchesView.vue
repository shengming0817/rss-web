<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import { VTextField, VBtn } from 'vuetify/components'

import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import DeviceContext from '../../devices/components/DeviceContext.vue'
import MdmPage from '../../../ui/MdmPage.vue'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { comparison } from '@rss/api/mdm-query'
import { identifier, uuid } from '../../../services/decode'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { policyName } from '../clients/model'
import type { EventBatch, EventMember } from '../clients/events'
import { auditTime } from '../../operations/format'
import RetirementDetails from '../../devices/components/RetirementDetails.vue'
const memberQuery = useDirectoryQuery(
  ['id', 'policyId', 'versionId', 'state', 'revision', 'decision', 'operations'],
  1000,
)

const batchQuery = useDirectoryQuery(
  [
    'id',
    'operationId',
    'event',
    'createdAt',
    'deadline',
    'members',
    'admission',
    'request',
    'processingFailure',
  ],
  1000,
)

const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n(),
  client = runtime.policies.events
const device = computed(() => String(route.params['device'])),
  batch = computed(() => (typeof route.params['batch'] === 'string' ? route.params['batch'] : null))
const filter = ref(''),
  applied = ref(''),
  retirementId = ref<string>()
const op = useOperation([], () => [...deviceBinding(runtime), device.value, batch.value ?? ''])
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  detail = ref<EventBatch>(),
  members = ref<Awaited<ReturnType<typeof client.members>>>()
const router = useRouter(),
  selectedMember = ref<EventMember>()
function openBatch(id: string) {
  void router.push({
    name: 'policy-event-batch',
    params: { tenant: runtime.tenant, device: device.value, batch: id },
  })
}
function readMember(id: string) {
  if (!batch.value) return
  void op.run(
    () =>
      client.members(device.value, batch.value!, {
        filter: comparison('id', '==', uuid(id)),
        limit: 1,
      }),
    (page) => {
      selectedMember.value = page.items[0]
    },
  )
}
function load(cursor?: string) {
  if (op.busy.value) return
  page.value = undefined
  detail.value = undefined
  members.value = undefined
  retirementId.value = undefined
  try {
    identifier(device.value)
    if (batch.value) uuid(batch.value)
    if (filter.value) policyName(filter.value)
  } catch {
    op.failure.value = 'invalidRequest'
    return
  }
  const selectedEvent = batchQuery.continues(cursor) ? applied.value : filter.value
  if (batch.value) {
    const target = batch.value
    void op.run(
      async () => ({
        batch: await client.read(device.value, target),
        members: await memberQuery.read(undefined, (query) =>
          client.members(device.value, target, query),
        ),
      }),
      (v) => {
        detail.value = v.batch
        members.value = v.members
      },
    )
  } else
    void op.run(
      () =>
        batchQuery.read(cursor, (query) => client.list(device.value, query), {
          filter: selectedEvent ? comparison('event', '==', selectedEvent) : undefined,
        }),
      (v) => {
        page.value = v
        applied.value = selectedEvent
      },
    )
}
function loadMembers(after?: string) {
  if (!batch.value) return
  const target = batch.value
  void op.run(
    () => memberQuery.read(after, (query) => client.members(device.value, target, query)),
    (page) => {
      members.value = page
    },
  )
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
batchQuery.onClear(() => {
  page.value = undefined
})
memberQuery.onClear(() => {
  members.value = undefined
  selectedMember.value = undefined
})
</script>
<template>
  <MdmPage :title="t('policies.entry.batches')" :busy="op.busy.value" :failure="op.failure.value">
    <DirectoryControls
      v-if="batch"
      :query="memberQuery"
      :busy="op.busy.value"
      hint="id / policyId / versionId / state"
      @load="loadMembers"
    />
    <DirectoryResults
      :disabled="op.busy.value"
      v-if="batch && !memberQuery.complete.value"
      :items="members?.items ?? []"
      @open="
        (row) => {
          readMember(String(row.id))
        }
      "
    />

    <DirectoryControls
      v-if="!batch"
      :query="batchQuery"
      :busy="op.busy.value"
      hint="id / operationId / event / createdAt"
      @load="load"
    />
    <DirectoryResults
      :disabled="op.busy.value"
      v-if="!batch && !batchQuery.complete.value"
      :items="page?.items ?? []"
      @open="
        (row) => {
          openBatch(String(row.id))
        }
      "
    />

    <DeviceContext :device="device" />
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
      <label
        >{{ t('policies.entry.event')
        }}<VTextField
          v-model="filter"
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><VBtn type="submit" :disabled="op.busy.value">{{ t('devices.reload') }}</VBtn>
    </form>
    <VBtn v-else :disabled="op.busy.value" @click="load()">{{ t('devices.reload') }}</VBtn>
    <template v-if="page"
      ><p>{{ t('console.pageNotTotal') }}</p>
      <p v-if="!page.items.length">{{ t('policies.empty') }}</p>
      <ol>
        <li v-for="row in batchQuery.complete.value ? page.items : []" :key="row.id">
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
    </template>
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
      <MdmDisclosure>
        <template #title>{{ t('policies.ux.technical') }}</template>
        <p>{{ detail.id }} · {{ detail.operationId }}</p>
      </MdmDisclosure>
    </section>
    <p v-if="members && !members.items.length">{{ t('policies.empty') }}</p>
    <article
      v-for="member in selectedMember
        ? [selectedMember]
        : memberQuery.complete.value
          ? members?.items
          : []"
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
          ><VBtn type="button" @click="retirementId = operation.reference.id">{{
            t('policies.entry.retirement')
          }}</VBtn></template
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

    <RetirementDetails v-if="retirementId" :id="retirementId" />
  </MdmPage>
</template>
