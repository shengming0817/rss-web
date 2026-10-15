<script setup lang="ts">
import {
  UiButton,
  UiStepIndicator,
  UiBadge,
  UiProgress,
  UiUtcDateTimeInput,
} from '@rss/core/components'
import { onBeforeUnmount, ref, toRaw, watch } from 'vue'
import SelfServiceEditor from '../../policies/components/SelfServiceEditor.vue'
import ResourceIdentity from '../../policies/components/ResourceIdentity.vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import {
  softwarePolicyDefinition,
  type SoftwarePolicy,
  type SoftwarePolicyDefinition,
} from '../clients/assignment-model'
import { intents, targets } from '../../policies/clients/model'
import type { AssignmentChange } from '../clients/assignments'
import type { RunCursor, SoftwareRun } from '../clients/runs'
import type { ResourceRead } from '../../policies/clients/resources'
import SoftwareResourceSelect from '../components/SoftwareResourceSelect.vue'
import CatalogLocator from '../../policies/components/CatalogLocator.vue'
import PageFrame from '../../../components/PageFrame.vue'
import NativeScheduleEditor from '../components/NativeScheduleEditor.vue'
import SoftwareRunFacts from '../components/SoftwareRunFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.software.assignments
const { run, runWrite, busy, failure, uncertain } = useOperation()
const editing = ref(false),
  wizardStep = ref(0),
  editorForm = ref<HTMLFormElement>()
const wizardLabels = ['content', 'targets', 'schedule', 'review'] as const
const current = ref<SoftwarePolicy>(),
  id = ref(''),
  enabled = ref(true)
function fresh(): SoftwarePolicyDefinition {
  const now = Math.floor(Date.now() / 1000)
  return {
    scope: '',
    action: {
      delivery: { kind: 'direct' },
      resource: { kind: 'software', id: '', version: '1', variants: {} },

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
let pending: { id: string; requester: string; body: Operation<AssignmentChange> } | undefined
function requester() {
  const s = runtime.session.state.value
  return s.status === 'authenticated' && s.tenant === runtime.tenant && s.identity && s.session
    ? [s.tenant, s.identity.principalId, s.session.id].join('/')
    : null
}
watch(
  requester,
  () => {
    pending = undefined
    current.value = undefined
    resource.value = undefined
    draft.value = fresh()
    page.value = undefined
    clearEvidence()
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  pending = undefined
})
function intent(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!intents.includes(value as (typeof intents)[number])) return
  if (value !== 'available_install' && draft.value.selfService) {
    failure.value = 'removeBeforeSwitch'
    return
  }
  draft.value.action.intent = value as (typeof intents)[number]
}
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
function beginCreate() {
  if (busy.value || uncertain.value) return
  create()
  editing.value = true
  wizardStep.value = 0
}
function beginEdit() {
  if (busy.value || uncertain.value) return
  editing.value = true
  wizardStep.value = 0
}
function nextStep() {
  const section = editorForm.value?.querySelector(`[data-wizard-step="${wizardStep.value}"]`)
  for (const input of section?.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input,select,textarea') ?? [])
    if (!input.reportValidity()) return
  wizardStep.value = Math.min(3, wizardStep.value + 1)
}
function cancelEdit() {
  if (busy.value || uncertain.value) return
  if (current.value) apply(current.value)
  else create()
  editing.value = false
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
  const target = { ...draft.value.action.resource }
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
      draft.value.action.admissionOperation = operation
      draft.value.action.resource.variants = Object.fromEntries(
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
  draft.value.action.admissionOperation = ''
  draft.value.action.resource.variants = {}
}
function variants(target: string) {
  return (
    resource.value?.versions
      .find((v) => v.id === draft.value.action.resource.version)
      ?.variants.filter((v) => `${v.platform}_${v.architecture}` === target) ?? []
  )
}
function selectVariant(target: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value) draft.value.action.resource.variants[target] = value
  else delete draft.value.action.resource.variants[target]
}
function replay() {
  const p = pending
  if (!p || p.requester !== requester()) return
  void runWrite(
    () => client.change(p.id, p.body),
    (v) => {
      if (p.requester !== requester()) throw new Error('Policy requester changed')
      pending = undefined
      apply(v)
      editing.value = false
      page.value = undefined
    },
  )
}
function change(input: AssignmentChange) {
  if (busy.value || uncertain.value) return
  const actor = requester()
  if (!actor) return
  pending = {
    requester: actor,
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
  const stages = draft.value.action.rollout.stages,
    last = stages.at(-1)!
  stages.push({ scope: '', opensAt: last.opensAt + 86400, minimumVerifiedPercent: 90 })
}
const utc = (at: number) =>
  new Date(at * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
watch(
  () => route.fullPath,
  () => {
    editing.value = false
    wizardStep.value = 0
    create()
    page.value = undefined
    if (typeof route.query['id'] === 'string') read(route.query['id'])
    else list()
  },
  { immediate: true },
)
</script>
<template>
  <PageFrame :title="t('software.deployments')" :busy="busy" :failure="failure">
    <template #actions
      ><UiButton variant="primary" :disabled="busy || uncertain" @click="beginCreate">{{
        t('policies.create')
      }}</UiButton
      ><UiButton :disabled="busy" @click="list()">{{ t('policies.reload') }}</UiButton></template
    >
    <p class="console-page-description">{{ t('software.deploymentHint') }}</p>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <ul v-if="!editing" class="console-data-list">
      <li v-for="p in page?.items" :key="p.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="read(p.id)">
          {{ p.definition.action.resource.id }} / {{ p.definition.action.resource.version }} ·
          {{ p.id }} ·
          {{ p.enabled ? t('software.enabled') : t('software.paused') }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="list(page.nextCursor)"
    >
      {{ t('policies.next') }}
    </UiButton>
    <section v-show="editing" class="console-panel console-wizard">
      <header class="console-page-header">
        <div>
          <h2>
            {{ current ? t('console.edit') : t('policies.create') }} ·
            {{ t('software.deployments') }}
          </h2>
          <p class="console-page-description">{{ t('console.scopeBound') }}</p>
        </div>
        <UiButton :disabled="busy || uncertain" @click="cancelEdit">{{
          t('console.cancel')
        }}</UiButton>
      </header>
      <UiStepIndicator
        :steps="wizardLabels.map((label) => t(`console.${label}`))"
        :current="wizardStep"
        :label="t('software.deployments')"
      />
      <form
        ref="editorForm"
        data-form="deployment"
        @submit.prevent="wizardStep === 3 ? save() : nextStep()"
      >
        <fieldset :disabled="busy || uncertain" class="console-form-section">
          <fieldset
            v-show="wizardStep === 0"
            :disabled="wizardStep !== 0"
            data-wizard-step="0"
            class="console-form-section"
          >
            <legend>{{ t('console.content') }}</legend>
            <SoftwareResourceSelect
              v-model:resource="draft.action.resource.id"
              v-model:version="draft.action.resource.version"
              :disabled="busy || uncertain"
            /><label for="deployment-resource">{{ t('software.targetResource') }}</label
            ><input
              id="deployment-resource"
              v-model="draft.action.resource.id"
              class="ui-input"
              required
              @input="resetBinding"
            />
            <label for="deployment-version">{{ t('software.resourceVersion') }}</label
            ><input
              id="deployment-version"
              v-model="draft.action.resource.version"
              class="ui-input"
              required
              @input="resetBinding"
            />
            <UiButton data-action="bind-version" type="button" @click="bindVersion">
              {{ t('software.bindVersion') }}
            </UiButton>
            <p>
              {{ t('software.admissionOperation') }}: {{ draft.action.admissionOperation || '—' }}
            </p>
            <template v-if="resource">
              <template v-for="target in targets" :key="target"
                ><label :for="`variant-${target}`">{{ target }}</label
                ><select
                  :id="`variant-${target}`"
                  class="ui-input"
                  :value="draft.action.resource.variants[target] ?? ''"
                  @change="selectVariant(target, $event)"
                >
                  <option value="">{{ t('software.noVariant') }}</option>
                  <option v-for="v in variants(target)" :key="v.key" :value="v.key">
                    {{ v.key }}
                  </option>
                </select></template
              >
            </template>
            <p v-else class="console-wrap">
              {{
                Object.entries(draft.action.resource.variants)
                  .map(([target, key]) => `${target}: ${key}`)
                  .join(' · ')
              }}
            </p>
            <ResourceIdentity :binding="draft.action.resource" />
            <label for="deployment-intent">{{ t('software.intent') }}</label
            ><select
              id="deployment-intent"
              class="ui-input"
              :value="draft.action.intent"
              @change="intent"
            >
              <option v-for="optionIntent in intents" :key="optionIntent" :value="optionIntent">
                {{ t(`software.intent_${optionIntent}`) }}
              </option>
            </select>
            <template v-if="draft.action.intent === 'available_install'">
              <SelfServiceEditor v-model="draft.selfService" software />
              <UiButton
                v-if="draft.selfService"
                type="button"
                data-action="remove-self-service"
                @click="delete draft.selfService"
              >
                {{ t('policies.selfService.removeConfiguration') }}
              </UiButton>
            </template>
            <label><input v-model="enabled" type="checkbox" />{{ t('policies.enabled') }}</label>
          </fieldset>
          <fieldset
            v-show="wizardStep === 1"
            :disabled="wizardStep !== 1"
            data-wizard-step="1"
            class="console-form-section"
          >
            <legend>{{ t('console.targets') }}</legend>
            <label for="deployment-scope">{{ t('policies.selfService.deviceScope') }}</label
            ><input
              id="deployment-scope"
              v-model="draft.scope"
              class="ui-input"
              required
            /><CatalogLocator
              v-model="draft.scope"
              collection="scopes"
              :disabled="busy || uncertain"
            />
          </fieldset>
          <fieldset
            v-show="wizardStep === 2"
            :disabled="wizardStep !== 2"
            data-wizard-step="2"
            class="console-form-section"
          >
            <legend>{{ t('console.schedule') }}</legend>
            <NativeScheduleEditor v-model="draft.action.schedule" />
            <label for="deployment-lifetime">{{ t('software.runLifetime') }}</label
            ><input
              id="deployment-lifetime"
              v-model.number="draft.action.runLifetimeSeconds"
              class="ui-input"
              type="number"
              min="60"
              max="604800"
              required
            />
            <fieldset>
              <legend>{{ t('software.stages') }}</legend>
              <p>{{ t('software.stageHint') }}</p>
              <fieldset v-for="(stage, index) in draft.action.rollout.stages" :key="index">
                <legend>{{ index + 1 }}</legend>
                <label :for="`stage-${index}-scope`">{{ t('policies.scopes') }}</label
                ><input
                  :id="`stage-${index}-scope`"
                  v-model="stage.scope"
                  class="ui-input"
                  data-field="stage-scope"
                  required
                />
                <label :for="`stage-${index}-at`">{{ t('software.opensAt') }}</label
                ><UiUtcDateTimeInput
                  :id="`stage-${index}-at`"
                  required
                  :invalid-label="t('policies.invalidDate')"
                  :model-value="stage.opensAt"
                  @update:model-value="stage.opensAt = $event ?? Number.NaN"
                />
                <template v-if="index > 0"
                  ><label :for="`stage-${index}-gate`">{{ t('software.minimumVerified') }}</label
                  ><input
                    :id="`stage-${index}-gate`"
                    class="ui-input"
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
                  <UiButton type="button" @click="draft.action.rollout.stages.splice(index, 1)">
                    {{ t('policies.remove') }}
                  </UiButton></template
                >
              </fieldset>
              <UiButton
                type="button"
                :disabled="!!(draft.action.rollout.stages.length >= 32)"
                @click="addStage"
              >
                {{ t('software.addStage') }}
              </UiButton>
            </fieldset>
          </fieldset>
          <section v-show="wizardStep === 3" class="console-panel" data-wizard-step="3">
            <h3>{{ t('console.review') }}</h3>
            <dl>
              <dt>{{ t('software.targetResource') }}</dt>
              <dd>{{ draft.action.resource.id }} / {{ draft.action.resource.version }}</dd>
              <dt>{{ t('policies.scopes') }}</dt>
              <dd>{{ draft.scope }}</dd>
              <dt>{{ t('software.intent') }}</dt>
              <dd>{{ t(`software.intent_${draft.action.intent}`) }}</dd>
              <dt>{{ t('software.stages') }}</dt>
              <dd>{{ draft.action.rollout.stages.length }}</dd>
              <dt>{{ t('policies.enabled') }}</dt>
              <dd>{{ enabled ? t('software.enabled') : t('software.paused') }}</dd>
            </dl>
            <details class="console-evidence">
              <summary>{{ t('console.advanced') }}</summary>
              <ResourceIdentity :binding="draft.action.resource" />
              <pre>{{ JSON.stringify(draft, null, 2) }}</pre>
            </details>
            <UiButton type="button" @click="check()">{{ t('software.preview') }}</UiButton>
          </section>
          <div class="console-form-actions">
            <UiButton v-if="wizardStep > 0" type="button" @click="wizardStep--">{{
              t('console.back')
            }}</UiButton
            ><UiButton v-if="wizardStep < 3" type="button" variant="primary" @click="nextStep">{{
              t('console.next')
            }}</UiButton
            ><UiButton v-else type="submit" variant="primary">{{ t('policies.save') }}</UiButton>
          </div>
        </fieldset>
      </form>
    </section>
    <section v-if="preview" class="console-panel">
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
      <UiButton
        v-if="preview.nextCursor"
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="check(preview.nextCursor, preview.scopeResult)"
      >
        {{ t('policies.next') }}
      </UiButton>
    </section>
    <UiButton
      v-if="current || uncertain"
      data-action="read-policy"
      :disabled="!!busy"
      type="submit"
      @click="read()"
    >
      {{ t('software.reconcile') }}
    </UiButton>
    <p v-if="uncertain" role="status">{{ t('software.policyUnknown') }}</p>
    <UiButton v-if="uncertain" :disabled="!!busy" type="submit" @click="replay">{{
      t('policies.replay')
    }}</UiButton>
    <section v-if="current && !editing" class="console-panel">
      <div class="console-page-header">
        <h2>{{ t('software.deploymentState') }}</h2>
        <UiButton :disabled="busy || uncertain" @click="beginEdit">{{
          t('console.edit')
        }}</UiButton>
      </div>
      <UiBadge>{{ current.enabled ? t('software.enabled') : t('software.paused') }}</UiBadge>
      <p>
        {{ t('policies.revision') }} {{ current.revision }} · {{ t('software.policyVersion') }}
        {{ current.version }} · {{ current.enabled ? t('software.enabled') : t('software.paused') }}
      </p>
      <p>{{ t('software.pauseHint') }}</p>
      <UiButton
        :disabled="!!(busy || uncertain)"
        data-action="toggle-policy"
        type="submit"
        @click="change({ action: current.enabled ? 'disable' : 'enable' })"
      >
        {{ current.enabled ? t('software.pause') : t('software.resume') }}
      </UiButton>
      <UiButton :disabled="!!busy" type="submit" @click="loadDevices()">{{
        t('software.deviceAdmission')
      }}</UiButton
      ><UiButton :disabled="!!busy" type="submit" @click="loadRollout">{{
        t('software.rollout')
      }}</UiButton
      ><UiButton :disabled="!!busy" type="submit" @click="loadRuns()">{{
        t('software.runHistory')
      }}</UiButton>
      <section v-if="devices" class="console-panel">
        <h3>{{ t('software.deviceAdmission') }}</h3>
        <p v-if="!devices.items.length">{{ t('policies.empty') }}</p>
        <ul>
          <li v-for="d in devices.items" :key="d.device">
            {{ d.device }} · {{ t(`software.eligibility_${d.assignment}`) }} ·
            {{ d.taskAdmission ? t(`software.admission_${d.taskAdmission.state}`) : '—' }}
            <ul v-if="d.operationIds.length">
              <li v-for="op in d.operationIds" :key="op">
                {{ t('policies.operation') }} · {{ op }}
              </li>
            </ul>
            <ul v-if="d.diagnoses.length">
              <li v-for="diagnosis in d.diagnoses" :key="diagnosis">{{ diagnosis }}</li>
            </ul>
          </li>
        </ul>
        <UiButton
          v-if="devices.nextCursor"
          :disabled="!!busy"
          type="submit"
          @click="loadDevices(devices.nextCursor)"
        >
          {{ t('policies.next') }}
        </UiButton>
      </section>
      <section v-if="rollout" class="console-panel">
        <h3>{{ t('software.rollout') }}</h3>
        <p>{{ utc(rollout.asOf) }} · {{ t('software.rolloutHint') }}</p>
        <p>{{ t('software.policyVersion') }}: {{ rollout.versionId }}</p>
        <article v-for="(stage, index) in rollout.stages" :key="stage.scope" class="console-panel">
          <h4>
            {{ index + 1 }} · {{ stage.open ? t('software.stageOpen') : t('software.stageClosed') }}
          </h4>
          <p>
            {{ stage.scope }} · {{ utc(stage.opensAt) }} ·
            {{ stage.minimumVerifiedPercent === null ? '—' : `${stage.minimumVerifiedPercent}%` }}
          </p>
          <UiProgress
            v-if="stage.totalTargets > 0"
            :value="(stage.verifiedSuccess / stage.totalTargets) * 100"
            :label="t('software.verifiedSuccess')"
          />
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
      <section v-if="history" class="console-panel">
        <h3>{{ t('software.runHistory') }}</h3>
        <p v-if="!history.items.length">{{ t('policies.empty') }}</p>
        <article v-for="r in history.items" :key="r.taskId" class="console-panel">
          <SoftwareRunFacts :run="r" /><UiButton
            :disabled="!!busy"
            type="submit"
            @click="loadDetail(r.taskId)"
          >
            {{ t('software.readEvidence') }}</UiButton
          ><RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: r.taskId },
            }"
            >{{ t('policies.executions') }}</RouterLink
          >
        </article>
        <UiButton
          v-if="history.nextCursor"
          :disabled="!!busy"
          type="submit"
          @click="loadRuns(history.nextCursor)"
        >
          {{ t('policies.next') }}
        </UiButton>
      </section>
      <SoftwareRunFacts v-if="detail" :run="detail" />
    </section>
  </PageFrame>
</template>
