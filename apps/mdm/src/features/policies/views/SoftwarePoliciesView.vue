<script setup lang="ts">
import PolicyFieldset from '../components/PolicyFieldset.vue'
import {
  VBtn,
  VStepper,
  VTextField,
  VSelect,
  VRadio,
  VCheckbox,
  VChip,
  VProgressLinear,
} from 'vuetify/components'
import { controlEvent } from '../control-event'
import PolicyUtcDateTimeInput from '../components/PolicyUtcDateTimeInput.vue'

import type { PreviewInput } from '../../policies/clients/policies'

import { comparison as queryComparison, allOf } from '../../../services/directory-query'
import {} from '@rss/core/components'
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import PolicyIdentityEditor from '../../policies/components/PolicyIdentityEditor.vue'
import PolicyEntry from '../../policies/components/PolicyEntry.vue'
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
} from '../../software/clients/assignment-model'
import { intents, targets } from '../../policies/clients/model'
import type { PolicyChange, PolicyRead } from '../../policies/clients/model'
import type { PolicyRun } from '../../policies/clients/runs'
import type { ResourceRead } from '../../policies/clients/resources'
import SoftwareResourceSelect from '../../software/components/SoftwareResourceSelect.vue'
import CatalogLocator from '../../policies/components/CatalogLocator.vue'
import AssignmentFacts from '../../policies/components/AssignmentFacts.vue'
import { objectKey } from '../../devices/clients/objects'
import { deviceBinding } from '../../devices/useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
import PolicyDelete from '../../policies/components/PolicyDelete.vue'
import NativeScheduleEditor from '../../software/components/NativeScheduleEditor.vue'
import { rolloutStageState } from '../../software/clients/rollout'
import type { Publication } from '../../software/clients/publication'
import PolicyRunFacts from '../../policies/components/PolicyRunFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.policies.policies
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const capabilities = ref<Awaited<ReturnType<typeof client.capabilities>>>()
const capabilityRequest = useOperation([], () => deviceBinding(runtime))
async function loadCapabilities() {
  capabilities.value = undefined
  await capabilityRequest.run(
    () => client.capabilities(),
    (v) => {
      capabilities.value = v
    },
  )
}
onMounted(loadCapabilities)
function selectChannel(event: Event) {
  const channel = (event.target as HTMLSelectElement).value
  if (
    channel === 'mdm' &&
    (!capabilities.value?.mdmSoftwareDistributionEnabled ||
      draft.value.action.delivery.kind !== 'direct' ||
      draft.value.action.intent !== 'required_install' ||
      draft.value.selfService)
  )
    return
  if (channel === 'agent' || channel === 'mdm') draft.value.action.channel = channel
}

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
    customEvent: null,
    alias: null,
    scope: '',
    action: {
      delivery: { kind: 'direct' },
      resource: { kind: 'software', id: '', version: '1', variants: {} },

      kind: 'software',
      channel: 'agent',
      intent: 'required_install',
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
const rolloutMode = ref<'full' | 'staged'>('full')
const published = ref<Awaited<ReturnType<typeof runtime.software.publication.list>>>()
const nativeChoices = computed(
  () => published.value?.items.filter((v) => v.outcome === 'published' && !v.withdrawn) ?? [],
)
function loadPublications(after?: string) {
  const r = draft.value.action.resource
  void run(
    () =>
      runtime.software.publication.list({
        cursor: after,
        filter: allOf(
          queryComparison('resource', '==', r.id),
          queryComparison('version', '==', r.version),
        ),
      }),
    (v) => {
      published.value = v
    },
  )
}
function delivery(event: Event) {
  draft.value.action.delivery =
    (event.target as HTMLSelectElement).value === 'native'
      ? { kind: 'native', target: '' }
      : { kind: 'direct' }
  published.value = undefined
}
function choosePublication(value: Publication) {
  draft.value.action.delivery = { kind: 'native', target: value.target }
}
function changeRolloutMode(event: Event) {
  rolloutMode.value = (event.target as HTMLSelectElement).value as 'full' | 'staged'
  draft.value.action.rollout.stages = [
    {
      scope: rolloutMode.value === 'full' ? draft.value.scope : '',
      opensAt: draft.value.action.schedule?.notBefore ?? Math.floor(Date.now() / 1000),
      minimumVerifiedPercent: null,
    },
  ]
}
watch(
  () => [draft.value.scope, draft.value.action.schedule?.notBefore] as const,
  ([scope, opensAt]) => {
    if (rolloutMode.value === 'full')
      draft.value.action.rollout.stages = [
        {
          scope,
          opensAt: opensAt ?? draft.value.action.rollout.stages[0]!.opensAt,
          minimumVerifiedPercent: null,
        },
      ]
  },
  { flush: 'sync' },
)

const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  preview = ref<Awaited<ReturnType<typeof client.preview>>>()
const previewBasis = ref('')
const draftBasis = () => JSON.stringify({ definition: draft.value, enabled: enabled.value })
const previewReady = computed(() => !!preview.value && previewBasis.value === draftBasis())
watch(
  [draft, enabled],
  () => {
    preview.value = undefined
    previewBasis.value = ''
  },
  { deep: true, flush: 'sync' },
)
const devices = ref<Awaited<ReturnType<typeof client.assignments>>>(),
  rollout = ref<Awaited<ReturnType<typeof runtime.software.rollout.read>>>()
const history = ref<Awaited<ReturnType<typeof runtime.policies.runs.list>>>(),
  detail = ref<PolicyRun>()
let pending: { id: string; requester: string; body: Operation<PolicyChange> } | undefined
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
    rolloutMode.value = 'full'
    draft.value = fresh()
    published.value = undefined
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
function apply(value: PolicyRead) {
  const p = { ...value, definition: softwarePolicyDefinition(value.definition) }
  current.value = p
  if (p.state === 'archived') editing.value = false
  id.value = p.id
  enabled.value = p.enabled
  const stages = p.definition.action.rollout.stages,
    first = stages[0]!
  rolloutMode.value =
    stages.length === 1 &&
    first.scope === p.definition.scope &&
    first.minimumVerifiedPercent === null &&
    (p.definition.action.schedule?.notBefore === undefined ||
      first.opensAt === p.definition.action.schedule.notBefore)
      ? 'full'
      : 'staged'
  draft.value = structuredClone(p.definition)
  published.value = undefined
  resource.value = undefined
  clearEvidence()
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  id.value = ''
  rolloutMode.value = 'full'
  draft.value = fresh()
  published.value = undefined
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
  if (busy.value || uncertain.value || current.value?.state === 'archived') return
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
    () => client.list({ cursor: after, filter: queryComparison('action', '==', 'software') }),
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
        runtime.software.lifecycle.version(target.id, target.version),
      ])
      const v = r.versions.find((v) => v.id === target.version)
      if (r.kind !== 'software' || !v || v.state === 'archived' || a.lifecycle?.state !== 'enabled')
        throw new Error('Software version is not enabled')
      return { r, v }
    },
    ({ r, v }) => {
      resource.value = r
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
  published.value = undefined
  if (draft.value.action.delivery.kind === 'native') draft.value.action.delivery.target = ''
  resource.value = undefined
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
      if (v.state === 'archived' && page.value)
        page.value.items = page.value.items.filter((item) => item.id !== v.id)
      else page.value = undefined
    },
  )
}
function change(input: PolicyChange) {
  const action = input.action === 'put' ? input.definition.action : current.value?.definition.action
  const enabling = input.action === 'enable' || (input.action === 'put' && input.enabled)
  if (
    enabling &&
    action?.kind === 'software' &&
    action.channel === 'mdm' &&
    !capabilities.value?.mdmSoftwareDistributionEnabled
  ) {
    failure.value = 'mdm_software_disabled'
    return
  }

  if (
    busy.value ||
    uncertain.value ||
    current.value?.state === 'archived' ||
    (input.action === 'archive' && current.value?.state !== 'disabled')
  )
    return
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
  if (!previewReady.value) return
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
let previewInput: PreviewInput | undefined
watch(
  () => JSON.stringify([requester(), draft.value]),
  () => {
    previewInput = undefined
    preview.value = undefined
  },
  { flush: 'sync' },
)
async function check(cursor?: string) {
  if (busy.value || uncertain.value) return
  const previous = cursor ? preview.value : undefined
  preview.value = undefined
  try {
    const d = softwarePolicyDefinition(structuredClone(toRaw(draft.value)))
    if (
      cursor &&
      (!previous || !previewInput || JSON.stringify(d) !== JSON.stringify(previewInput.definition))
    ) {
      previewInput = undefined
      return
    }
    const input = cursor ? previewInput! : { definition: d }
    previewInput = input
    await run(
      async () => {
        const page = await client.preview(input, { cursor })
        if (previous && previous.scopeResult !== page.scopeResult)
          throw new Error('Wrong preview scope result')
        return page
      },
      (v) => {
        if (previewInput !== input) return
        preview.value = v
        previewBasis.value = draftBasis()
      },
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}

function loadDevices(after?: string) {
  devices.value = undefined
  if (current.value) {
    const id = current.value.id
    void run(
      () => client.assignments(id, { cursor: after }),
      (v) => {
        if (current.value?.id === id) devices.value = v
      },
    )
  }
}
function loadRollout() {
  if (current.value) {
    const id = current.value.id
    void run(
      () => runtime.software.rollout.read(id),
      (v) => {
        rollout.value = v
      },
    )
  }
}
function loadRuns(cursor?: string) {
  history.value = undefined
  detail.value = undefined
  if (current.value) {
    const id = current.value.id
    void run(
      () => runtime.policies.runs.list(id, { cursor }),
      (v) => {
        if (current.value?.id !== id) return
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
      () => runtime.policies.runs.read(id, task),
      (v) => {
        detail.value = v
      },
    )
  }
}
function addStage() {
  const stages = draft.value.action.rollout.stages,
    last = stages.at(-1)!
  stages.push({ scope: '', opensAt: last.opensAt + 86400, minimumVerifiedPercent: null })
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
    else if (
      typeof route.query['resource'] === 'string' &&
      typeof route.query['version'] === 'string'
    ) {
      beginCreate()
      draft.value.action.resource.id = route.query['resource']
      draft.value.action.resource.version = route.query['version']
    } else if (route.query['create'] === '1') beginCreate()
    else list()
  },
  { immediate: true },
)
</script>
<template>
  <MdmPage :title="t('policies.software')" :busy="busy" :failure="failure">
    <template #actions
      ><VBtn variant="flat" :disabled="busy || uncertain" @click="beginCreate">{{
        t('policies.create')
      }}</VBtn
      ><VBtn :disabled="busy" @click="list()">{{ t('policies.reload') }}</VBtn></template
    >
    <p class="console-page-description">{{ t('software.deploymentHint') }}</p>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <ul v-if="!editing" class="console-data-list">
      <li v-for="p in page?.items" :key="p.id">
        <VBtn :disabled="!!(busy || uncertain)" type="submit" @click="read(p.id)">
          {{ p.definition.action.kind === 'software' ? p.definition.action.resource.id : p.id }} /
          {{ p.definition.action.kind === 'software' ? p.definition.action.resource.version : '—' }}
          · {{ p.id }} ·
          {{ p.state === 'enabled' ? t('software.enabled') : t('software.paused') }}
        </VBtn>
      </li>
    </ul>
    <VBtn v-if="page?.nextCursor" :disabled="!!busy" type="submit" @click="list(page.nextCursor)">
      {{ t('policies.next') }}
    </VBtn>
    <section v-show="editing" class="console-panel console-wizard">
      <header class="console-page-header">
        <div>
          <h2>
            {{ current ? t('console.edit') : t('policies.create') }} ·
            {{ t('policies.software') }}
          </h2>
          <p class="console-page-description">{{ t('console.scopeBound') }}</p>
        </div>
        <VBtn :disabled="busy || uncertain" @click="cancelEdit">{{ t('console.cancel') }}</VBtn>
      </header>
      <VStepper
        :items="wizardLabels.map((label) => t(`console.${label}`))"
        :model-value="wizardStep + 1"
        :label="t('policies.software')"
      />
      <form
        ref="editorForm"
        data-form="deployment"
        @submit.prevent="wizardStep === 3 ? save() : nextStep()"
      >
        <PolicyFieldset :disabled="busy || uncertain" class="console-form-section">
          <PolicyFieldset
            v-show="wizardStep === 0"
            :disabled="wizardStep !== 0"
            data-wizard-step="0"
            class="console-form-section"
          >
            <legend>{{ t('console.content') }}</legend>
            <PolicyIdentityEditor v-model:alias="draft.alias" v-model:event="draft.customEvent" />
            <SoftwareResourceSelect
              v-model:resource="draft.action.resource.id"
              v-model:version="draft.action.resource.version"
              :disabled="busy || uncertain"
              @change="resetBinding"
            /><label for="deployment-resource">{{ t('software.targetResource') }}</label
            ><VTextField
              id="deployment-resource"
              v-model="draft.action.resource.id"
              required
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              @input="resetBinding()"
            />
            <label for="deployment-version">{{ t('software.resourceVersion') }}</label
            ><VTextField
              id="deployment-version"
              v-model="draft.action.resource.version"
              required
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              @input="resetBinding()"
            />
            <VBtn data-action="bind-version" type="button" @click="bindVersion">
              {{ t('software.bindVersion') }}
            </VBtn>
            <p></p>
            <template v-if="resource">
              <template v-for="target in targets" :key="target"
                ><label :for="`variant-${target}`">{{ target }}</label
                ><VSelect
                  :id="`variant-${target}`"
                  :model-value="draft.action.resource.variants[target] ?? ''"
                  :items="[
                    { title: String(t('software.noVariant')), value: '' },
                    ...variants(target).map((v) => ({ title: String(v.key), value: v.key })),
                  ]"
                  variant="outlined"
                  density="comfortable"
                  hide-details="auto"
                  @update:model-value="selectVariant(target, controlEvent($event))"
              /></template>
            </template>
            <p v-else class="console-wrap">
              {{
                Object.entries(draft.action.resource.variants)
                  .map(([target, key]) => `${target}: ${key}`)
                  .join(' · ')
              }}
            </p>
            <ResourceIdentity :binding="draft.action.resource" />
            <label for="deployment-channel">{{ t('gap.softwareChannel') }}</label>
            <VSelect
              id="deployment-channel"
              :model-value="draft.action.channel"
              :items="[
                { title: 'Agent', value: 'agent' },
                {
                  title: 'MDM',
                  value: 'mdm',
                  props: {
                    disabled:
                      !capabilities?.mdmSoftwareDistributionEnabled ||
                      draft.action.delivery.kind !== 'direct' ||
                      draft.action.intent !== 'required_install' ||
                      !!draft.selfService,
                  },
                },
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              @update:model-value="selectChannel(controlEvent($event))"
            />
            <p v-if="!capabilities">{{ t('gap.capabilityUnknown') }}</p>
            <p v-else-if="!capabilities.mdmSoftwareDistributionEnabled">
              {{ t('gap.mdmDisabled') }}
            </p>
            <p>{{ t('gap.mdmConstraints') }}</p>
            <VBtn type="button" @click="loadCapabilities">{{ t('gap.load') }}</VBtn>
            <label for="deployment-delivery">{{ t('software.delivery') }}</label>
            <VSelect
              id="deployment-delivery"
              :model-value="draft.action.delivery.kind"
              :items="[
                { title: String(t('software.deliveryDirect')), value: 'direct' },
                {
                  title: String(t('software.deliveryNative')),
                  value: 'native',
                  props: { disabled: draft.action.channel === 'mdm' },
                },
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              @update:model-value="delivery(controlEvent($event))"
            />
            <section v-if="draft.action.delivery.kind === 'native'" class="console-panel">
              <p>{{ t('software.nativePublicationHint') }}</p>
              <p v-if="draft.action.delivery.target">
                {{ t('software.binding') }}: {{ draft.action.delivery.target }}
              </p>
              <VBtn
                type="button"
                :disabled="!draft.action.resource.id || !draft.action.resource.version"
                @click="loadPublications()"
                >{{ t('software.publishedVersions') }}</VBtn
              >
              <p v-if="published && !nativeChoices.length">
                {{ t('software.noPublishedVersion') }}
              </p>
              <label v-for="item in nativeChoices" :key="item.id">
                <VRadio
                  name="native-publication"
                  :model-value="draft.action.delivery.target === item.target"
                  hide-details="auto"
                  @update:model-value="choosePublication(item)"
                />
                {{ item.target }} · {{ item.resource }} / {{ item.version }}
              </label>
              <VBtn
                v-if="published?.nextCursor"
                type="button"
                @click="loadPublications(published.nextCursor)"
                >{{ t('devices.next') }}</VBtn
              >
            </section>
            <label for="deployment-intent">{{ t('software.intent') }}</label
            ><VSelect
              id="deployment-intent"
              :model-value="draft.action.intent"
              :items="[
                ...intents.map((optionIntent) => ({
                  title: String(t(`software.intent_${optionIntent}`)),
                  value: optionIntent,
                  props: {
                    disabled: draft.action.channel === 'mdm' && optionIntent !== 'required_install',
                  },
                })),
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              @update:model-value="intent(controlEvent($event))"
            />
            <template v-if="draft.action.intent === 'available_install'">
              <SelfServiceEditor v-model="draft.selfService" />
              <VBtn
                v-if="draft.selfService"
                type="button"
                data-action="remove-self-service"
                @click="delete draft.selfService"
              >
                {{ t('policies.selfService.removeConfiguration') }}
              </VBtn>
            </template>
            <label
              ><VCheckbox v-model="enabled" hide-details="auto" />{{ t('software.enabled') }}</label
            >
          </PolicyFieldset>
          <PolicyFieldset
            v-show="wizardStep === 1"
            :disabled="wizardStep !== 1"
            data-wizard-step="1"
            class="console-form-section"
          >
            <legend>{{ t('console.targets') }}</legend>
            <label for="deployment-scope">{{ t('policies.selfService.deviceScope') }}</label
            ><VTextField
              id="deployment-scope"
              v-model="draft.scope"
              required
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            /><CatalogLocator
              v-model="draft.scope"
              collection="scopes"
              :disabled="busy || uncertain"
            />
          </PolicyFieldset>
          <PolicyFieldset
            v-show="wizardStep === 2"
            :disabled="wizardStep !== 2"
            data-wizard-step="2"
            class="console-form-section"
          >
            <legend>{{ t('console.schedule') }}</legend>
            <NativeScheduleEditor v-model="draft.action.schedule" />
            <label for="deployment-lifetime">{{ t('software.runLifetime') }}</label
            ><VTextField
              id="deployment-lifetime"
              v-model.number="draft.action.runLifetimeSeconds"
              type="number"
              min="60"
              max="604800"
              required
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />
            <label for="deployment-rollout-mode">{{ t('software.deploymentMode') }}</label>
            <VSelect
              id="deployment-rollout-mode"
              :model-value="rolloutMode"
              :items="[
                { title: String(t('software.fullDeployment')), value: 'full' },
                { title: String(t('software.stagedDeployment')), value: 'staged' },
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              @update:model-value="changeRolloutMode(controlEvent($event))"
            />
            <p v-if="rolloutMode === 'full'">{{ t('software.fullDeploymentHint') }}</p>
            <PolicyFieldset v-else>
              <legend>{{ t('software.stages') }}</legend>
              <p>{{ t('software.stageHint') }}</p>
              <PolicyFieldset v-for="(stage, index) in draft.action.rollout.stages" :key="index">
                <legend>{{ index + 1 }}</legend>
                <label :for="`stage-${index}-scope`">{{ t('policies.scopes') }}</label
                ><VTextField
                  :id="`stage-${index}-scope`"
                  v-model="stage.scope"
                  data-field="stage-scope"
                  required
                  variant="outlined"
                  density="comfortable"
                  hide-details="auto"
                /><CatalogLocator
                  v-model="stage.scope"
                  collection="scopes"
                  :disabled="busy || uncertain"
                />
                <label :for="`stage-${index}-at`">{{ t('software.opensAt') }}</label
                ><PolicyUtcDateTimeInput
                  :id="`stage-${index}-at`"
                  required
                  :invalid-label="t('policies.invalidDate')"
                  :model-value="stage.opensAt"
                  @update:model-value="stage.opensAt = $event ?? Number.NaN"
                />
                <template v-if="index > 0"
                  ><label :for="`stage-${index}-gate`">{{ t('software.minimumVerified') }}</label
                  ><VTextField
                    :id="`stage-${index}-gate`"
                    type="number"
                    min="0"
                    max="100"
                    :model-value="stage.minimumVerifiedPercent ?? ''"
                    variant="outlined"
                    density="comfortable"
                    hide-details="auto"
                    @input="
                      stage.minimumVerifiedPercent =
                        ($event.target as HTMLInputElement).value === ''
                          ? null
                          : Number(($event.target as HTMLInputElement).value)
                    "
                  />
                  <VBtn type="button" @click="draft.action.rollout.stages.splice(index, 1)">
                    {{ t('policies.remove') }}
                  </VBtn></template
                >
              </PolicyFieldset>
              <VBtn
                type="button"
                :disabled="!!(draft.action.rollout.stages.length >= 32)"
                @click="addStage"
              >
                {{ t('software.addStage') }}
              </VBtn>
            </PolicyFieldset>
          </PolicyFieldset>
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
              <dd>
                {{
                  rolloutMode === 'full'
                    ? t('software.fullDeployment')
                    : draft.action.rollout.stages.length
                }}
              </dd>
              <dt>{{ t('software.enabled') }}</dt>
              <dd>{{ enabled ? t('software.enabled') : t('software.paused') }}</dd>
            </dl>
            <details class="console-evidence">
              <summary>{{ t('console.advanced') }}</summary>
              <ResourceIdentity :binding="draft.action.resource" />
              <pre>{{ JSON.stringify(draft, null, 2) }}</pre>
            </details>
            <p role="status">
              {{ t(previewReady ? 'console.previewReady' : 'console.previewRequired') }}
            </p>
            <VBtn type="button" @click="check()">{{ t('software.preview') }}</VBtn>
          </section>
          <div class="console-form-actions">
            <VBtn v-if="wizardStep > 0" type="button" @click="wizardStep--">{{
              t('console.back')
            }}</VBtn
            ><VBtn v-if="wizardStep < 3" type="button" variant="flat" @click="nextStep">{{
              t('console.next')
            }}</VBtn
            ><VBtn v-else type="submit" variant="flat" :disabled="!previewReady">{{
              t('policies.save')
            }}</VBtn>
          </div>
        </PolicyFieldset>
      </form>
    </section>
    <PolicyEntry v-if="current" :policy="current" />
    <section v-if="preview" class="console-panel">
      <h2>{{ t('software.preview') }}</h2>
      <p>{{ t('software.previewHint') }}</p>
      <p>{{ preview.scopeResult }}</p>
      <p v-if="!preview.items.length">{{ t('policies.empty') }}</p>
      <ul>
        <li v-for="d in preview.items" :key="objectKey(d.object)">
          <AssignmentFacts :item="d" /> {{ t(`software.eligibility_${d.eligibility.state}`) }} ·
          {{ d.taskAdmission ? t(`software.admission_${d.taskAdmission.state}`) : '—' }}
        </li>
      </ul>
      <VBtn
        v-if="preview.nextCursor"
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="check(preview.nextCursor)"
      >
        {{ t('policies.next') }}
      </VBtn>
    </section>
    <VBtn
      v-if="current || uncertain"
      data-action="read-policy"
      :disabled="!!busy"
      type="submit"
      @click="read()"
    >
      {{ t('software.reconcile') }}
    </VBtn>
    <p v-if="uncertain" role="status">{{ t('software.policyUnknown') }}</p>
    <VBtn v-if="uncertain" :disabled="!!busy" type="submit" @click="replay">{{
      t('policies.replay')
    }}</VBtn>
    <section v-if="current && !editing" class="console-panel">
      <div class="console-page-header">
        <h2>{{ t('software.deploymentState') }}</h2>
        <VBtn
          v-if="current.state !== 'archived'"
          :disabled="busy || uncertain"
          @click="beginEdit"
          >{{ t('console.edit') }}</VBtn
        >
      </div>
      <VChip>{{
        current.state === 'archived'
          ? t('policies.state.archived')
          : current.enabled
            ? t('software.enabled')
            : t('software.paused')
      }}</VChip>
      <p>
        {{ t('policies.revision') }} {{ current.revision }} · {{ t('software.policyVersion') }}
        {{ current.version }} ·
        {{
          current.state === 'archived'
            ? t('policies.state.archived')
            : current.enabled
              ? t('software.enabled')
              : t('software.paused')
        }}
      </p>
      <p v-if="current.state === 'archived'" role="status">{{ t('policies.archivedHint') }}</p>
      <p v-else>{{ t('software.pauseHint') }}</p>
      <VBtn
        v-if="current.state !== 'archived'"
        :disabled="!!(busy || uncertain)"
        data-action="toggle-policy"
        type="submit"
        @click="change({ action: current.enabled ? 'disable' : 'enable' })"
      >
        {{ current.enabled ? t('software.pause') : t('software.resume') }}
      </VBtn>
      <PolicyDelete
        :policy="current"
        :disabled="busy || uncertain"
        @confirm="change({ action: 'archive' })"
      />
      <VBtn :disabled="!!busy" type="submit" @click="loadDevices()">{{
        t('software.deviceAdmission')
      }}</VBtn
      ><VBtn :disabled="!!busy" type="submit" @click="loadRollout">{{ t('software.rollout') }}</VBtn
      ><VBtn :disabled="!!busy" type="submit" @click="loadRuns()">{{
        t('software.runHistory')
      }}</VBtn>
      <section v-if="devices" class="console-panel">
        <h3>{{ t('software.deviceAdmission') }}</h3>
        <p v-if="!devices.items.length">{{ t('policies.empty') }}</p>
        <ul>
          <li v-for="d in devices.items" :key="objectKey(d.object)">
            <AssignmentFacts :item="d" /> {{ t(`software.eligibility_${d.qualification.state}`) }} ·
            {{ d.taskAdmission ? t(`software.admission_${d.taskAdmission.state}`) : '—' }}
            <ul v-if="d.operationIds.length">
              <li v-for="op in d.operationIds" :key="op">
                {{ t('policies.operation') }} · {{ op }}
              </li>
            </ul>
          </li>
        </ul>
        <VBtn
          v-if="devices.nextCursor"
          :disabled="!!busy"
          type="submit"
          @click="loadDevices(devices.nextCursor)"
        >
          {{ t('policies.next') }}
        </VBtn>
      </section>
      <section v-if="rollout" class="console-panel">
        <h3>{{ t('software.rollout') }}</h3>
        <p>{{ utc(rollout.asOf) }} · {{ t('software.rolloutHint') }}</p>
        <p>{{ t('software.policyVersion') }}: {{ rollout.versionId }}</p>
        <article v-for="(stage, index) in rollout.stages" :key="stage.scope" class="console-panel">
          <h4>{{ index + 1 }} · {{ t(`software.${rolloutStageState(rollout, index)}`) }}</h4>
          <p>
            {{ stage.scope }} · {{ utc(stage.opensAt) }} ·
            {{ stage.minimumVerifiedPercent === null ? '—' : `${stage.minimumVerifiedPercent}%` }}
          </p>
          <VProgressLinear
            v-if="stage.totalTargets > 0"
            :model-value="(stage.verifiedSuccess / stage.totalTargets) * 100"
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
          <PolicyRunFacts :run="r" /><VBtn
            :disabled="!!busy"
            type="submit"
            @click="loadDetail(r.taskId)"
          >
            {{ t('software.readEvidence') }}</VBtn
          ><RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: r.taskId },
              query: { policy: current.id },
            }"
            >{{ t('policies.executions') }}</RouterLink
          >
        </article>
        <VBtn
          v-if="history.nextCursor"
          :disabled="!!busy"
          type="submit"
          @click="loadRuns(history.nextCursor)"
        >
          {{ t('policies.next') }}
        </VBtn>
      </section>
      <PolicyRunFacts v-if="detail" :run="detail" />
    </section>
  </MdmPage>
</template>
