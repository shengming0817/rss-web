<script setup lang="ts">
import { onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  selfServiceDefinition,
  requestPhases,
  type SelfServiceDefinition,
  type SelfServiceItem,
  type InstallationRequest,
  type RequestChange,
  type RequestPhase,
  type SelfServiceChange,
} from '../clients/self-service'
import { targets } from '../../policies/clients/model'
import type { ResourceRead } from '../../policies/clients/resources'
import type { SoftwareRun } from '../clients/runs'
import SoftwareFrame from '../components/SoftwareFrame.vue'
import NativeScheduleEditor from '../components/NativeScheduleEditor.vue'
import SoftwareRunFacts from '../components/SoftwareRunFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.software.selfService
const { run, runWrite, busy, uncertain, failure } = useOperation()
const items = ref<Awaited<ReturnType<typeof client.items>>>(),
  queue = ref<Awaited<ReturnType<typeof client.requests>>>()
const item = ref<SelfServiceItem>(),
  selected = ref<InstallationRequest>(),
  evidence = ref<SoftwareRun>(),
  resource = ref<ResourceRead>()
const phase = ref<RequestPhase>('pending'),
  note = ref('')
function fresh(): SelfServiceDefinition {
  return {
    title: '',
    description: '',
    enabled: true,
    resource: { kind: 'software', id: '', version: '1', variants: {} },
    scope: '',
    admissionOperation: '',
    schedule: {
      trigger: { kind: 'check_in', minimumSeconds: 60 },
      misfire: { kind: 'coalesce_one' },
      notBefore: 0,
      until: null,
      jitterSeconds: 0,
      window: null,
    },
    runLifetimeSeconds: 3600,
  }
}
const draft = ref(fresh())
let pending:
  | { kind: 'item'; id: string; body: Operation<SelfServiceChange> }
  | { kind: 'request'; id: string; body: Operation<RequestChange> }
  | undefined
function setItem(v: SelfServiceItem) {
  item.value = v
  draft.value = structuredClone(v.definition)
  resource.value = undefined
  if (pending?.kind === 'item' && pending.body.operationId === v.operation) uncertain.value = false
}
function setRequest(v: InstallationRequest) {
  if (
    selected.value?.id !== v.id ||
    (pending?.kind === 'request' && pending.body.operationId === v.operation)
  )
    note.value = ''
  selected.value = v
  evidence.value = undefined
  if (pending?.kind === 'request' && pending.body.operationId === v.operation)
    uncertain.value = false
}
function create() {
  if (busy.value || uncertain.value) return
  item.value = undefined
  draft.value = fresh()
  resource.value = undefined
  pending = undefined
}
function loadItems(cursor?: string) {
  void run(
    () => client.items(cursor),
    (v) => {
      items.value = v
    },
  )
}
function readItem(id = uncertain.value && pending?.kind === 'item' ? pending.id : item.value?.id) {
  if (!id || (uncertain.value && (pending?.kind !== 'item' || pending.id !== id))) return
  void run(() => client.item(id), setItem)
}
function loadRequests(cursor?: string) {
  void run(
    () => client.requests(phase.value, cursor),
    (v) => {
      queue.value = v
    },
  )
}
function readRequest(
  id = uncertain.value && pending?.kind === 'request' ? pending.id : selected.value?.id,
) {
  if (!id || (uncertain.value && (pending?.kind !== 'request' || pending.id !== id))) return
  void run(() => client.request(id), setRequest)
}
function resetBinding() {
  draft.value.admissionOperation = ''
  draft.value.resource.variants = {}
  resource.value = undefined
}
function bindVersion() {
  const { id, version } = draft.value.resource
  void run(
    async () => {
      const [r, a] = await Promise.all([
        runtime.policies.resources.read(id),
        runtime.software.admission.version(id, version),
      ])
      const v = r.versions.find((v) => v.id === version)
      if (r.kind !== 'software' || v?.state !== 'active' || a.admission?.state !== 'approved')
        throw new Error('Unapproved software version')
      return { r, v, operation: a.admission.operation }
    },
    ({ r, v, operation }) => {
      resource.value = r
      draft.value.admissionOperation = operation
      draft.value.resource.variants = Object.fromEntries(
        targets.flatMap((target) => {
          const vs = v.variants.filter((v) => `${v.platform}_${v.architecture}` === target)
          return vs.length === 1 ? [[target, vs[0]!.key]] : []
        }),
      )
    },
  )
}
function variants(target: string) {
  return (
    resource.value?.versions
      .find((v) => v.id === draft.value.resource.version)
      ?.variants.filter((v) => `${v.platform}_${v.architecture}` === target) ?? []
  )
}
function selectVariant(target: string, event: Event) {
  const key = (event.target as HTMLSelectElement).value
  if (key) draft.value.resource.variants[target] = key
  else delete draft.value.resource.variants[target]
}
function replay() {
  const p = pending
  if (!p) return
  if (p.kind === 'item')
    void runWrite(
      () => client.changeItem(p.id, p.body),
      (v) => {
        setItem(v)
        items.value = undefined
      },
    )
  else
    void runWrite(
      () => client.decide(p.id, p.body),
      (v) => {
        setRequest(v)
        queue.value = undefined
      },
    )
}
function save() {
  if (busy.value || uncertain.value) return
  try {
    pending = {
      kind: 'item',
      id: item.value?.id ?? crypto.randomUUID(),
      body: operation(
        { action: 'put', definition: selfServiceDefinition(toRaw(draft.value)) },
        item.value?.revision ?? 0,
      ),
    }
    replay()
  } catch {
    failure.value = 'invalidRequest'
  }
}
function decide(action: RequestChange['action']) {
  if (busy.value || uncertain.value || !selected.value || !note.value.trim()) return
  pending = {
    kind: 'request',
    id: selected.value.id,
    body: operation({ action, note: note.value.trim() }, selected.value.revision),
  }
  replay()
}
function loadEvidence() {
  const r = selected.value
  if (r?.policy && r.execution) {
    const policy = r.policy.id,
      task = r.execution
    void run(
      () => runtime.software.runs.read(policy, task),
      (v) => {
        evidence.value = v
      },
    )
  }
}
function routeRequest() {
  if (typeof route.query['request'] === 'string') readRequest(route.query['request'])
}
watch(
  () => route.fullPath,
  () => {
    selected.value = undefined
    pending = undefined
    routeRequest()
  },
  { flush: 'sync' },
)
onMounted(async () => {
  await run(
    () => client.items(),
    (v) => (items.value = v),
  )
  await run(
    () => client.requests(phase.value),
    (v) => (queue.value = v),
  )
  routeRequest()
})
</script>
<template>
  <SoftwareFrame :title="t('software.selfService')" :busy="busy" :failure="failure">
    <p>{{ t('software.selfServiceHint') }}</p>
    <h2>{{ t('software.offeredItems') }}</h2>
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button
    ><button :disabled="busy" @click="loadItems()">{{ t('policies.reload') }}</button>
    <p v-if="items && !items.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="v in items?.items" :key="v.id">
        <button :disabled="busy || uncertain" @click="readItem(v.id)">
          {{ v.definition.title }} · {{ v.id }}
        </button>
      </li>
    </ul>
    <button v-if="items?.nextCursor" :disabled="busy" @click="loadItems(items.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form @submit.prevent="save">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ item ? item.id : t('policies.create') }}</legend>
        <label for="self-title">{{ t('software.catalogTitle') }}</label
        ><input id="self-title" v-model="draft.title" required />
        <label for="self-description">{{ t('software.description') }}</label
        ><input id="self-description" v-model="draft.description" />
        <label for="self-resource">{{ t('software.targetResource') }}</label
        ><input id="self-resource" v-model="draft.resource.id" required @input="resetBinding" />
        <label for="self-version">{{ t('software.resourceVersion') }}</label
        ><input id="self-version" v-model="draft.resource.version" required @input="resetBinding" />
        <button type="button" @click="bindVersion">{{ t('software.bindVersion') }}</button>
        <p>{{ t('software.admissionOperation') }}: {{ draft.admissionOperation || '—' }}</p>
        <template v-if="resource"
          ><template v-for="target in targets" :key="target"
            ><label :for="`self-variant-${target}`">{{ target }}</label
            ><select
              :id="`self-variant-${target}`"
              :value="draft.resource.variants[target] ?? ''"
              @change="selectVariant(target, $event)"
            >
              <option value="">{{ t('software.noVariant') }}</option>
              <option v-for="v in variants(target)" :key="v.key" :value="v.key">{{ v.key }}</option>
            </select></template
          ></template
        >
        <p v-else>
          {{
            Object.entries(draft.resource.variants)
              .map(([target, key]) => `${target}: ${key}`)
              .join(' · ')
          }}
        </p>
        <label for="self-scope">{{ t('software.rootScope') }}</label
        ><input id="self-scope" v-model="draft.scope" required />
        <label
          ><input v-model="draft.enabled" type="checkbox" />{{ t('software.offerEnabled') }}</label
        >
        <p>{{ t('software.offerHint') }}</p>
        <NativeScheduleEditor v-model="draft.schedule" />
        <label for="self-lifetime">{{ t('software.runLifetime') }}</label
        ><input
          id="self-lifetime"
          v-model.number="draft.runLifetimeSeconds"
          type="number"
          min="60"
          max="604800"
          required
        />
        <button type="submit">{{ t('policies.save') }}</button>
      </fieldset>
    </form>
    <button
      v-if="item || pending?.kind === 'item'"
      :disabled="busy || (uncertain && pending?.kind !== 'item')"
      @click="readItem()"
    >
      {{ t('software.reconcile') }}
    </button>
    <h2>{{ t('software.installationRequests') }}</h2>
    <form @submit.prevent="loadRequests()">
      <label for="request-phase">{{ t('policies.status') }}</label
      ><select id="request-phase" v-model="phase" :disabled="busy">
        <option v-for="p in requestPhases" :key="p" :value="p">
          {{ t(`software.request_${p}`) }}
        </option></select
      ><button :disabled="busy">{{ t('policies.reload') }}</button>
    </form>
    <p v-if="queue && !queue.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="r in queue?.items" :key="r.id">
        <button data-action="open-request" :disabled="busy || uncertain" @click="readRequest(r.id)">
          {{ r.item.title }} · {{ r.requester }} / {{ r.device }} ·
          {{ t(`software.request_${r.phase}`) }}
        </button>
      </li>
    </ul>
    <button v-if="queue?.nextCursor" :disabled="busy" @click="loadRequests(queue.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <section v-if="selected">
      <h3>{{ selected.item.title }} · {{ selected.id }}</h3>
      <p>
        {{ selected.item.resource.id }} / {{ selected.item.resource.version }} ·
        {{ selected.requester }} / {{ selected.device }}
      </p>
      <p>
        {{ t(`software.request_${selected.phase}`) }} · {{ t('policies.revision') }}
        {{ selected.revision }}
      </p>
      <p>{{ t('software.approvalEffectHint') }}</p>
      <ul>
        <li v-for="(decision, index) in selected.decisions" :key="index">
          {{ t(`software.decision_${decision.action}`) }} · {{ decision.actor }} ·
          {{ decision.note }}
        </li>
      </ul>
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('software.requestDecision') }}</legend>
        <label for="request-note">{{ t('software.decisionNote') }}</label
        ><input id="request-note" v-model="note" maxlength="256" />
        <template v-if="selected.phase === 'pending'"
          ><button
            data-action="approve-request"
            :disabled="!note.trim()"
            @click="decide('approve')"
          >
            {{ t('software.decision_approve') }}</button
          ><button :disabled="!note.trim()" @click="decide('deny')">
            {{ t('software.decision_deny') }}
          </button></template
        >
        <button
          v-if="['pending', 'approved'].includes(selected.phase)"
          :disabled="!note.trim()"
          @click="decide('cancel')"
        >
          {{ t('software.decision_cancel') }}
        </button>
      </fieldset>
      <button data-action="read-request" :disabled="busy" @click="readRequest()">
        {{ t('software.reconcile') }}
      </button>
      <RouterLink
        v-if="selected.policy"
        :to="{
          name: 'software-deployments',
          params: { tenant: runtime.tenant },
          query: { id: selected.policy.id },
        }"
        >{{ t('software.requestPolicy') }}</RouterLink
      >
      <template v-if="selected.execution"
        ><button :disabled="busy" @click="loadEvidence">{{ t('software.readEvidence') }}</button
        ><RouterLink
          :to="{
            name: 'policy-execution',
            params: { tenant: runtime.tenant, execution: selected.execution },
          }"
          >{{ t('policies.executions') }}</RouterLink
        ></template
      >
      <SoftwareRunFacts v-if="evidence" :run="evidence" />
    </section>
    <button v-if="uncertain" :disabled="busy" @click="replay">{{ t('policies.replay') }}</button>
  </SoftwareFrame>
</template>
