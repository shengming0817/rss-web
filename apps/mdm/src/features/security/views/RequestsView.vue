<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { requestStates, type SecurityRequest } from '../clients/requests-model'
import type { RequestFilter } from '../clients/requests'
import RequestFacts from '../components/RequestFacts.vue'
import SecurityFrame from '../components/SecurityFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.requests,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  selected = ref<Awaited<ReturnType<typeof client.read>>>(),
  device = ref(''),
  state = ref<SecurityRequest['state'] | ''>(''),
  applied = ref<RequestFilter>(),
  actionId = ref<string>()
let pending: (() => Promise<void>) | undefined
const at = (seconds: number) =>
  seconds <= 253402300799 ? new Date(seconds * 1000).toISOString() : String(seconds)
function load(cursor?: string) {
  if (busy.value) return
  const filter =
    cursor && applied.value
      ? { ...applied.value }
      : {
          ...(device.value ? { device: device.value } : {}),
          ...(state.value ? { state: state.value } : {}),
        }
  if (!cursor) page.value = undefined
  void run(
    () => client.list({ ...filter, ...(cursor ? { cursor } : {}) }),
    (v) => {
      page.value = v
      applied.value = filter
    },
  )
}
function open(id: string) {
  if (busy.value || (uncertain.value && selected.value?.request.id !== id)) return
  if (!uncertain.value) {
    selected.value = undefined
    actionId.value = undefined
  }
  void run(
    () => client.read(id),
    (v) => (selected.value = v),
  )
}
function decide(action: 'approve' | 'deny' | 'revoke') {
  if (busy.value || uncertain.value || !selected.value) return
  const id = selected.value.request.id,
    body = operation({}, selected.value.request.revision)
  pending = async () => {
    if (
      await runWrite(
        () => client.decide(id, action, body),
        (v) => {
          selected.value = v
          page.value = undefined
        },
      )
    )
      await run(
        () => client.read(id),
        (v) => (selected.value = v),
      )
  }
  void pending()
}
function routeChanged() {
  actionId.value = undefined
  page.value = undefined
  selected.value = undefined
  pending = undefined
  applied.value = undefined
  state.value = ''
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  if (typeof route.query['id'] === 'string') open(route.query['id'])
  else load()
}
function dispatch() {
  if (!selected.value || busy.value || uncertain.value) return
  const id = selected.value.request.id,
    body = operation({}, selected.value.request.revision)
  actionId.value = body.operationId
  pending = async () => {
    const done = await runWrite(
      () => runtime.security.actions.dispatch(id, body),
      (v) => (actionId.value = v.action.id),
    )
    if (!done && !uncertain.value) actionId.value = undefined
  }
  void pending()
}
watch(() => route.fullPath, routeChanged, { flush: 'sync' })
onMounted(routeChanged)
</script>
<template>
  <SecurityFrame :title="t('security.requests')" :busy="busy" :failure="failure">
    <p>{{ t('security.requestHint') }}</p>
    <form @submit.prevent="load()">
      <fieldset :disabled="busy">
        <label>{{ t('policies.device') }}<input v-model="device" /></label
        ><label
          >{{ t('security.requestState')
          }}<select v-model="state">
            <option value="">{{ t('devices.all') }}</option>
            <option v-for="value in requestStates" :key="value" :value="value">
              {{ t(`security.requestsState.${value}`) }}
            </option>
          </select></label
        ><button>{{ t('devices.reload') }}</button>
      </fieldset>
    </form>
    <p v-if="page">
      {{ t('security.snapshotAt') }} {{ at(page.asOf) }} · {{ t('operations.applied') }}
      {{ applied?.device ?? t('devices.all') }} ·
      {{ applied?.state ? t(`security.requestsState.${applied.state}`) : t('devices.all') }}
    </p>
    <p v-if="page && !page.items.length">{{ t('security.emptyRequests') }}</p>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">{{ item.id }}</button> ·
        {{ item.target.device }} · {{ t(`security.requestsState.${item.state}`) }} ·
        {{ item.requester }}
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <section v-if="selected" data-testid="security-request">
      <h2>{{ selected.request.id }}</h2>
      <RequestFacts :request="selected.request" :as-of="selected.asOf" />
      <template
        v-if="
          selected.request.target.kind === 'risk_remediation' ||
          selected.request.target.kind === 'material_operation'
        "
      >
        <p>{{ t('security.dispatchHint') }}</p>
        <button
          v-if="selected.request.state === 'approved' && !actionId"
          :disabled="busy || uncertain"
          data-testid="dispatch-security"
          @click="dispatch"
        >
          {{ t('security.dispatch') }}
        </button>
        <RouterLink
          :to="{
            name: 'security-actions',
            params: { tenant: runtime.tenant },
            query: { request: selected.request.id },
          }"
          >{{ t('security.actions') }}</RouterLink
        >
        <p v-if="actionId">
          {{ t('security.actionId') }}
          <RouterLink
            :to="{
              name: 'security-actions',
              params: { tenant: runtime.tenant },
              query: { id: actionId },
            }"
            >{{ actionId }}</RouterLink
          >
        </p>
      </template>
      <button :disabled="busy" data-testid="refresh-request" @click="open(selected.request.id)">
        {{ t('policies.refresh') }}
      </button>
      <template v-if="selected.request.state === 'pending'"
        ><button
          :disabled="busy || uncertain"
          data-testid="approve-request"
          @click="decide('approve')"
        >
          {{ t('security.approve') }}</button
        ><button :disabled="busy || uncertain" @click="decide('deny')">
          {{ t('security.deny') }}
        </button></template
      >
      <button
        v-if="['pending', 'approved'].includes(selected.request.state)"
        :disabled="busy || uncertain"
        @click="decide('revoke')"
      >
        {{ t('security.revoke') }}
      </button>
      <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
        {{ t('policies.replay') }}
      </button>
      <RouterLink
        :to="{
          name: 'operations-audit',
          params: { tenant: runtime.tenant },
          query: { device: selected.request.target.device },
        }"
        >{{ t('operations.audit') }}</RouterLink
      >
    </section>
  </SecurityFrame>
</template>
