<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import {
  diagnosticKinds,
  isSupportTarget,
  supportKinds,
  type SupportTarget,
} from '../clients/support-model'
import SecurityFrame from '../components/SecurityFrame.vue'
import RequestFacts from '../components/RequestFacts.vue'
import SupportFacts from '../components/SupportFacts.vue'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.support,
  { run, runWrite, busy, failure, uncertain } = useOperation(),
  context = ref<Awaited<ReturnType<typeof client.context>>>(),
  current = ref<Awaited<ReturnType<typeof read>>>(),
  device = ref(''),
  kind = ref<SupportTarget['kind']>('elevation'),
  account = ref(''),
  program = ref(''),
  mode = ref<'view' | 'control'>('view'),
  artifacts = ref<(typeof diagnosticKinds)[number][]>(['system_events']),
  retention = ref(86400),
  reason = ref(''),
  from = ref(0),
  until = ref(0),
  accepted = ref<string>(),
  actionId = ref<string>()
let pending: (() => Promise<void>) | undefined
const allowed = computed(() => {
  const c = context.value?.context.capabilities
  return (
    !!c &&
    (kind.value === 'elevation'
      ? c.elevation
      : kind.value === 'diagnostics'
        ? c.diagnostics
        : c.remoteModes.includes(mode.value))
  )
})
const canDispatch = computed(
  () =>
    current.value?.request.request.state === 'approved' &&
    !current.value.support.support.action &&
    (current.value.support.support.details.kind !== 'remote_support' ||
      current.value.support.support.details.consent.state === 'granted'),
)
async function read(id: string) {
  const [request, support] = await Promise.all([
    runtime.security.requests.read(id),
    client.read(id),
  ])
  if (
    !isSupportTarget(request.request.target) ||
    JSON.stringify(request.request.target) !== JSON.stringify(support.support.target) ||
    request.request.requester !== support.support.requester
  )
    throw new Error('Wrong support request binding')
  return { request, support }
}
function load() {
  if (busy.value || uncertain.value || !device.value) return
  context.value = undefined
  current.value = undefined
  reason.value = ''
  accepted.value = undefined
  actionId.value = undefined
  const id = device.value
  void run(
    () => client.context(id),
    (v) => {
      context.value = v
      account.value = v.context.accounts[0]?.id ?? ''
      program.value = v.context.programs[0]?.id ?? ''
      from.value = v.asOf
      until.value = v.asOf + 1800
    },
  )
}
function open(id: string) {
  if (busy.value || (uncertain.value && current.value?.request.request.id !== id)) return
  if (!uncertain.value) {
    current.value = undefined
    reason.value = ''
  }
  void run(
    () => read(id),
    (v) => {
      current.value = v
      device.value = v.request.request.target.device
    },
  )
}
function create() {
  if (!context.value || busy.value || uncertain.value || !allowed.value) return
  const c = context.value.context,
    base = { device: c.device, contextRevision: c.revision },
    p = c.programs.find((p) => p.id === program.value)
  if (kind.value === 'elevation' && !p) return
  const target: SupportTarget =
      kind.value === 'elevation'
        ? { ...base, kind: kind.value, account: account.value, program: { ...p! } }
        : kind.value === 'diagnostics'
          ? {
              ...base,
              kind: kind.value,
              artifacts: [...artifacts.value],
              retentionSeconds: retention.value,
            }
          : { ...base, kind: kind.value, mode: mode.value },
    body = operation({
      target,
      reason: reason.value,
      validFrom: from.value,
      validUntil: until.value,
    })
  accepted.value = body.operationId
  pending = async () => {
    if (
      await runWrite(
        () => runtime.security.requests.create(body),
        () => {
          reason.value = ''
        },
      )
    )
      await run(
        () => read(body.operationId),
        (v) => {
          current.value = v
          context.value = undefined
        },
      )
    else if (!uncertain.value) accepted.value = undefined
  }
  void pending()
}
function dispatch() {
  if (!current.value || busy.value || uncertain.value || !canDispatch.value) return
  const id = current.value.request.request.id,
    body = operation({}, current.value.request.request.revision)
  actionId.value = body.operationId
  pending = async () => {
    if (
      await runWrite(
        () => runtime.security.actions.dispatch(id, body),
        (v) => {
          actionId.value = v.action.id
        },
      )
    )
      await run(
        () => read(id),
        (v) => {
          current.value = v
        },
      )
    else if (!uncertain.value) actionId.value = undefined
  }
  void pending()
}
function changed() {
  context.value = undefined
  current.value = undefined
  reason.value = ''
  accepted.value = undefined
  actionId.value = undefined
  pending = undefined
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  if (typeof route.query['id'] === 'string') open(route.query['id'])
  else load()
}
watch(() => route.fullPath, changed, { flush: 'sync' })
onMounted(changed)
</script>
<template>
  <SecurityFrame :title="t('security.support')" :busy="busy" :failure="failure">
    <p>{{ t('security.supportHint') }}</p>
    <form @submit.prevent="load()">
      <label
        >{{ t('policies.device')
        }}<input v-model="device" :readonly="busy || uncertain" required /></label
      ><button :disabled="busy || uncertain">{{ t('devices.open') }}</button>
    </form>
    <form v-if="context" data-testid="support-form" @submit.prevent="create">
      <fieldset :disabled="busy || uncertain">
        <legend>
          {{ context.context.device }} · {{ context.context.platform }} /
          {{ context.context.revision }}
        </legend>
        <p>
          {{ t('security.frozenSource') }}:
          {{
            context.context.source
              ? `${context.context.source.source} · ${context.context.source.registrationId} / ${context.context.source.generation}`
              : t('security.state.unknown')
          }}
        </p>
        <label
          >{{ t('security.supportKind')
          }}<select v-model="kind">
            <option v-for="k in supportKinds" :key="k" :value="k">
              {{ t(`security.supportKinds.${k}`) }}
            </option>
          </select></label
        >
        <template v-if="kind === 'elevation'"
          ><label
            >{{ t('security.supportAccount')
            }}<select v-model="account">
              <option v-for="a in context.context.accounts" :key="a.id" :value="a.id">
                {{ a.name }} · {{ a.id }}
              </option>
            </select></label
          >
          <label
            >{{ t('security.supportProgram')
            }}<select v-model="program">
              <option v-for="p in context.context.programs" :key="p.id" :value="p.id">
                {{ p.name }} · {{ p.path }} · {{ p.publisher }} · {{ p.sha256 }}
              </option>
            </select></label
          ></template
        >
        <template v-else-if="kind === 'diagnostics'"
          ><label v-for="a in diagnosticKinds" :key="a"
            ><input v-model="artifacts" type="checkbox" :value="a" />{{
              t(`security.diagnosticKinds.${a}`)
            }}</label
          >
          <label
            >{{ t('security.retentionSeconds')
            }}<input
              v-model.number="retention"
              type="number"
              min="1"
              max="604800"
              required /></label
        ></template>
        <label v-else
          >{{ t('security.remoteMode')
          }}<select v-model="mode">
            <option value="view">{{ t('security.remoteModes.view') }}</option>
            <option value="control">{{ t('security.remoteModes.control') }}</option>
          </select></label
        >
        <p v-if="!allowed" role="status">{{ t('security.supportUnavailable') }}</p>
        <label
          >{{ t('security.justification') }}<textarea v-model="reason" maxlength="512" required />
        </label>
        <label for="support-from">{{ t('security.validFrom') }}</label
        ><UtcTimeInput id="support-from" v-model="from" :max="until - 1" />
        <label for="support-until">{{ t('security.validUntil') }}</label
        ><UtcTimeInput id="support-until" v-model="until" :min="from + 1" :max="from + 3600" />
        <button :disabled="!allowed">{{ t('security.submitRequest') }}</button>
      </fieldset>
    </form>
    <section v-if="current" data-testid="support-detail">
      <h2>{{ current.request.request.target.device }} · {{ current.request.request.id }}</h2>
      <RequestFacts :request="current.request.request" :as-of="current.request.asOf" /><SupportFacts
        :support="current.support.support"
        :as-of="current.support.asOf"
      />
      <button
        :disabled="busy"
        data-testid="refresh-support"
        @click="open(current.request.request.id)"
      >
        {{ t('policies.refresh') }}
      </button>
      <button
        :disabled="busy || uncertain || !canDispatch"
        data-testid="dispatch-support"
        @click="dispatch"
      >
        {{ t('security.dispatch') }}
      </button>
      <RouterLink
        :to="{
          name: 'security-requests',
          params: { tenant: runtime.tenant },
          query: { id: current.request.request.id },
        }"
        >{{ t('security.supportDecisions') }}</RouterLink
      >
      <RouterLink
        v-if="current.support.support.action || actionId"
        :to="{
          name: 'security-actions',
          params: { tenant: runtime.tenant },
          query: { id: current.support.support.action ?? actionId },
        }"
        >{{ t('security.actions') }}</RouterLink
      >
    </section>
    <p v-if="accepted">
      {{ t('security.requestId') }}
      <RouterLink
        :to="{
          name: 'security-requests',
          params: { tenant: runtime.tenant },
          query: { id: accepted },
        }"
        >{{ accepted }}</RouterLink
      >
    </p>
    <nav v-if="device" class="device-actions" :aria-label="t('security.relatedRecords')">
      <RouterLink
        v-for="name in ['security-requests', 'operations-audit']"
        :key="name"
        :to="{ name, params: { tenant: runtime.tenant }, query: { device } }"
        >{{ t(name.replace('-', '.')) }}</RouterLink
      >
      <RouterLink :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device } }">{{
        t('policies.device')
      }}</RouterLink>
    </nav>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button>
  </SecurityFrame>
</template>
