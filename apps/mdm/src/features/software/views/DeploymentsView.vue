<script setup lang="ts">
import { ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  softwarePolicyDefinition,
  intents,
  targets,
  type SoftwarePolicy,
  type SoftwarePolicyDefinition,
} from '../clients/assignment-model'
import type { AssignmentChange } from '../clients/assignments'
import type { RunCursor, SoftwareRun } from '../clients/runs'
import type { ResourceRead } from '../../policies/clients/resources'
import SoftwareFrame from '../components/SoftwareFrame.vue'
import NativeScheduleEditor from '../components/NativeScheduleEditor.vue'
import SoftwareRunFacts from '../components/SoftwareRunFacts.vue'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.software.assignments
const { run, runWrite, busy, failure, uncertain } = useOperation()
const current = ref<SoftwarePolicy>(),
  id = ref(''),
  enabled = ref(true)
function fresh(): SoftwarePolicyDefinition {
  const now = Math.floor(Date.now() / 1000)
  return {
    resource: { kind: 'software', id: '', version: '1', variants: {} },
    scope: '',
    behavior: {
      kind: 'software',
      intent: 'required_install',
      admissionOperation: '',
      schedule: {
        trigger: { kind: 'check_in', minimumSeconds: 3600 },
        misfire: { kind: 'coalesce_one' },
        notBefore: now,
        until: null,
        jitterSeconds: 0,
        window: null,
      },
      runLifetimeSeconds: 3600,
      rollout: { stages: [{ scope: '', opensAt: now, minimumVerifiedPercent: null }] },
    },
  }
}
const draft = ref(fresh()),
  resource = ref<ResourceRead>()
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  preview = ref<Awaited<ReturnType<typeof client.preview>>>()
const devices = ref<Awaited<ReturnType<typeof client.devices>>>(),
  rollout = ref<Awaited<ReturnType<typeof client.rollout>>>()
const history = ref<Awaited<ReturnType<typeof runtime.software.runs.list>>>(),
  detail = ref<SoftwareRun>()
let pending: { id: string; body: Operation<AssignmentChange> } | undefined
watch(
  draft,
  () => {
    preview.value = undefined
  },
  { deep: true, flush: 'sync' },
)
function clearEvidence() {
  devices.value = undefined
  rollout.value = undefined
  history.value = undefined
  detail.value = undefined
}
function apply(p: SoftwarePolicy) {
  current.value = p
  id.value = p.id
  enabled.value = p.enabled
  draft.value = structuredClone(p.definition)
  resource.value = undefined
  clearEvidence()
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  id.value = ''
  draft.value = fresh()
  enabled.value = true
  resource.value = undefined
  pending = undefined
  clearEvidence()
}
function list(after?: string) {
  void run(
    () => client.list(after),
    (v) => {
      page.value = v
    },
  )
}
function read(value = uncertain.value ? pending?.id : id.value) {
  if (!value || (uncertain.value && value !== pending?.id)) return
  void run(() => client.read(value), apply)
}
function bindVersion() {
  const target = { ...draft.value.resource }
  void run(
    async () => {
      const [r, a] = await Promise.all([
        runtime.policies.resources.read(target.id),
        runtime.software.admission.version(target.id, target.version),
      ])
      const v = r.versions.find((v) => v.id === target.version)
      if (r.kind !== 'software' || v?.state !== 'active' || a.admission?.state !== 'approved')
        throw new Error('Unapproved software version')
      return { r, v, operation: a.admission.operation }
    },
    ({ r, v, operation }) => {
      resource.value = r
      draft.value.behavior.admissionOperation = operation
      draft.value.resource.variants = Object.fromEntries(
        targets.flatMap((target) => {
          const matches = v.variants.filter((v) => `${v.platform}_${v.architecture}` === target)
          return matches.length === 1 ? [[target, matches[0]!.key]] : []
        }),
      )
    },
  )
}
function resetBinding() {
  resource.value = undefined
  draft.value.behavior.admissionOperation = ''
  draft.value.resource.variants = {}
}
function variants(target: string) {
  return (
    resource.value?.versions
      .find((v) => v.id === draft.value.resource.version)
      ?.variants.filter((v) => `${v.platform}_${v.architecture}` === target) ?? []
  )
}
function selectVariant(target: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value) draft.value.resource.variants[target] = value
  else delete draft.value.resource.variants[target]
}
function replay() {
  const p = pending
  if (!p) return
  void runWrite(
    () => client.change(p.id, p.body),
    (v) => {
      apply(v)
      page.value = undefined
    },
  )
}
function change(input: AssignmentChange) {
  if (busy.value || uncertain.value) return
  pending = {
    id: current.value?.id ?? crypto.randomUUID(),
    body: operation(input, current.value?.revision ?? 0),
  }
  replay()
}
function save() {
  try {
    change({
      action: 'put',
      enabled: enabled.value,
      definition: softwarePolicyDefinition(toRaw(draft.value)),
    })
  } catch {
    failure.value = 'invalidRequest'
  }
}
function check(after?: string, scopeResult?: string) {
  try {
    const d = softwarePolicyDefinition(toRaw(draft.value))
    void run(
      () => client.preview(d, after, scopeResult),
      (v) => {
        preview.value = v
      },
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}
function loadDevices(after?: string) {
  if (current.value) {
    const id = current.value.id
    void run(
      () => client.devices(id, after),
      (v) => {
        devices.value = v
      },
    )
  }
}
function loadRollout() {
  if (current.value) {
    const id = current.value.id
    void run(
      () => client.rollout(id),
      (v) => {
        rollout.value = v
      },
    )
  }
}
function loadRuns(cursor?: RunCursor) {
  if (current.value) {
    const id = current.value.id
    void run(
      () => runtime.software.runs.list(id, cursor),
      (v) => {
        history.value = v
        detail.value = undefined
      },
    )
  }
}
function loadDetail(task: string) {
  if (current.value) {
    const id = current.value.id
    void run(
      () => runtime.software.runs.read(id, task),
      (v) => {
        detail.value = v
      },
    )
  }
}
function addStage() {
  const stages = draft.value.behavior.rollout.stages,
    last = stages.at(-1)!
  stages.push({ scope: '', opensAt: last.opensAt + 86400, minimumVerifiedPercent: 90 })
}
const utc = (at: number) =>
  new Date(at * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
watch(
  () => route.fullPath,
  () => {
    create()
    page.value = undefined
    if (typeof route.query['id'] === 'string') read(route.query['id'])
    else list()
  },
  { immediate: true },
)
</script>
<template>
  <SoftwareFrame :title="t('software.deployments')" :busy="busy" :failure="failure">
    <p>{{ t('software.deploymentHint') }}</p>
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button>
    <button :disabled="busy" @click="list()">{{ t('policies.reload') }}</button>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="p in page?.items" :key="p.id">
        <button :disabled="busy || uncertain" @click="read(p.id)">
          {{ p.definition.resource.id }} / {{ p.definition.resource.version }} · {{ p.id }} ·
          {{ p.enabled ? t('software.enabled') : t('software.paused') }}
        </button>
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="list(page.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form data-form="deployment" @submit.prevent="save">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ current ? current.id : t('policies.create') }}</legend>
        <label for="deployment-resource">{{ t('software.targetResource') }}</label
        ><input
          id="deployment-resource"
          v-model="draft.resource.id"
          required
          @input="resetBinding"
        />
        <label for="deployment-version">{{ t('software.resourceVersion') }}</label
        ><input
          id="deployment-version"
          v-model="draft.resource.version"
          required
          @input="resetBinding"
        />
        <button data-action="bind-version" type="button" @click="bindVersion">
          {{ t('software.bindVersion') }}
        </button>
        <p>
          {{ t('software.admissionOperation') }}: {{ draft.behavior.admissionOperation || '—' }}
        </p>
        <template v-if="resource">
          <template v-for="target in targets" :key="target"
            ><label :for="`variant-${target}`">{{ target }}</label
            ><select
              :id="`variant-${target}`"
              :value="draft.resource.variants[target] ?? ''"
              @change="selectVariant(target, $event)"
            >
              <option value="">{{ t('software.noVariant') }}</option>
              <option v-for="v in variants(target)" :key="v.key" :value="v.key">{{ v.key }}</option>
            </select></template
          >
        </template>
        <p v-else class="device-wrap">
          {{
            Object.entries(draft.resource.variants)
              .map(([target, key]) => `${target}: ${key}`)
              .join(' · ')
          }}
        </p>
        <label for="deployment-scope">{{ t('software.rootScope') }}</label
        ><input id="deployment-scope" v-model="draft.scope" required />
        <label for="deployment-intent">{{ t('software.intent') }}</label
        ><select id="deployment-intent" v-model="draft.behavior.intent">
          <option v-for="intent in intents" :key="intent" :value="intent">
            {{ t(`software.intent_${intent}`) }}
          </option>
        </select>
        <label><input v-model="enabled" type="checkbox" />{{ t('policies.enabled') }}</label>
        <NativeScheduleEditor v-model="draft.behavior.schedule" />
        <label for="deployment-lifetime">{{ t('software.runLifetime') }}</label
        ><input
          id="deployment-lifetime"
          v-model.number="draft.behavior.runLifetimeSeconds"
          type="number"
          min="60"
          max="604800"
          required
        />
        <fieldset>
          <legend>{{ t('software.stages') }}</legend>
          <p>{{ t('software.stageHint') }}</p>
          <fieldset v-for="(stage, index) in draft.behavior.rollout.stages" :key="index">
            <legend>{{ index + 1 }}</legend>
            <label :for="`stage-${index}-scope`">{{ t('policies.scopes') }}</label
            ><input
              :id="`stage-${index}-scope`"
              v-model="stage.scope"
              data-field="stage-scope"
              required
            />
            <label :for="`stage-${index}-at`">{{ t('software.opensAt') }}</label
            ><UtcTimeInput :id="`stage-${index}-at`" v-model="stage.opensAt" />
            <template v-if="index > 0"
              ><label :for="`stage-${index}-gate`">{{ t('software.minimumVerified') }}</label
              ><input
                :id="`stage-${index}-gate`"
                :value="stage.minimumVerifiedPercent ?? ''"
                type="number"
                min="0"
                max="100"
                @input="
                  stage.minimumVerifiedPercent =
                    ($event.target as HTMLInputElement).value === ''
                      ? null
                      : Number(($event.target as HTMLInputElement).value)
                "
              />
              <button type="button" @click="draft.behavior.rollout.stages.splice(index, 1)">
                {{ t('policies.remove') }}
              </button></template
            >
          </fieldset>
          <button
            type="button"
            :disabled="draft.behavior.rollout.stages.length >= 32"
            @click="addStage"
          >
            {{ t('software.addStage') }}
          </button>
        </fieldset>
        <button type="button" @click="check()">{{ t('software.preview') }}</button
        ><button type="submit">{{ t('policies.save') }}</button>
      </fieldset>
    </form>
    <section v-if="preview">
      <h2>{{ t('software.preview') }}</h2>
      <p>{{ t('software.previewHint') }}</p>
      <p>{{ preview.scopeResult }}</p>
      <p v-if="!preview.items.length">{{ t('policies.empty') }}</p>
      <ul>
        <li v-for="d in preview.items" :key="d.device">
          {{ d.device }} · {{ t(`software.eligibility_${d.eligibility.state}`) }} ·
          {{ d.taskAdmission ? t(`software.admission_${d.taskAdmission.state}`) : '—' }}
        </li>
      </ul>
      <button
        v-if="preview.nextCursor"
        :disabled="busy || uncertain"
        @click="check(preview.nextCursor, preview.scopeResult)"
      >
        {{ t('policies.next') }}
      </button>
    </section>
    <button v-if="current || uncertain" data-action="read-policy" :disabled="busy" @click="read()">
      {{ t('software.reconcile') }}
    </button>
    <p v-if="uncertain" role="status">{{ t('software.policyUnknown') }}</p>
    <button v-if="uncertain" :disabled="busy" @click="replay">{{ t('policies.replay') }}</button>
    <section v-if="current">
      <h2>{{ t('software.deploymentState') }}</h2>
      <p>
        {{ t('policies.revision') }} {{ current.revision }} · {{ t('software.policyVersion') }}
        {{ current.version }} · {{ current.enabled ? t('software.enabled') : t('software.paused') }}
      </p>
      <p>{{ t('software.pauseHint') }}</p>
      <button
        :disabled="busy || uncertain"
        data-action="toggle-policy"
        @click="change({ action: current.enabled ? 'disable' : 'enable' })"
      >
        {{ current.enabled ? t('software.pause') : t('software.resume') }}
      </button>
      <button :disabled="busy" @click="loadDevices()">{{ t('software.deviceAdmission') }}</button
      ><button :disabled="busy" @click="loadRollout">{{ t('software.rollout') }}</button
      ><button :disabled="busy" @click="loadRuns()">{{ t('software.runHistory') }}</button>
      <section v-if="devices">
        <h3>{{ t('software.deviceAdmission') }}</h3>
        <p v-if="!devices.items.length">{{ t('policies.empty') }}</p>
        <ul>
          <li v-for="d in devices.items" :key="d.device">
            {{ d.device }} · {{ t(`software.eligibility_${d.assignment}`) }} ·
            {{ d.taskAdmission ? t(`software.admission_${d.taskAdmission.state}`) : '—' }}
          </li>
        </ul>
        <button v-if="devices.nextCursor" :disabled="busy" @click="loadDevices(devices.nextCursor)">
          {{ t('policies.next') }}
        </button>
      </section>
      <section v-if="rollout">
        <h3>{{ t('software.rollout') }}</h3>
        <p>{{ utc(rollout.asOf) }} · {{ t('software.rolloutHint') }}</p>
        <p>{{ t('software.policyVersion') }}: {{ rollout.versionId }}</p>
        <article v-for="(stage, index) in rollout.stages" :key="stage.scope">
          <h4>
            {{ index + 1 }} · {{ stage.open ? t('software.stageOpen') : t('software.stageClosed') }}
          </h4>
          <p>
            {{ stage.scope }} · {{ utc(stage.opensAt) }} ·
            {{ stage.minimumVerifiedPercent === null ? '—' : `${stage.minimumVerifiedPercent}%` }}
          </p>
          <dl>
            <template
              v-for="field in [
                'totalTargets',
                'reported',
                'verifiedSuccess',
                'failed',
                'unknown',
                'waitingUser',
                'waitingReboot',
                'unsupportedCapability',
              ] as const"
              :key="field"
              ><dt>{{ t(`software.${field}`) }}</dt>
              <dd>{{ stage[field] }}</dd></template
            >
          </dl>
        </article>
      </section>
      <section v-if="history">
        <h3>{{ t('software.runHistory') }}</h3>
        <p v-if="!history.items.length">{{ t('policies.empty') }}</p>
        <article v-for="r in history.items" :key="r.taskId">
          <SoftwareRunFacts :run="r" /><button :disabled="busy" @click="loadDetail(r.taskId)">
            {{ t('software.readEvidence') }}</button
          ><RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: r.taskId },
            }"
            >{{ t('policies.executions') }}</RouterLink
          >
        </article>
        <button v-if="history.nextCursor" :disabled="busy" @click="loadRuns(history.nextCursor)">
          {{ t('policies.next') }}
        </button>
      </section>
      <SoftwareRunFacts v-if="detail" :run="detail" />
    </section>
  </SoftwareFrame>
</template>
