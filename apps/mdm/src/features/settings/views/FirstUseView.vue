<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
import { useMdm } from '../../../context'
import { closed, uuid } from '../../../services/decode'
import { useSettingsAction, useSettingsFacts } from '../useSettingsAction'
import {
  channels,
  capabilities,
  decodeIntent,
  type FirstUseIntent,
  type FirstUseProgress,
  type Capability,
  type Channel,
} from '../clients/firstUse'
import { entries } from '../entries'
import { settingsDestination } from '../destinations'
import MaterialPanel from '../components/MaterialPanel.vue'
import OperationNotice from '../components/OperationNotice.vue'
const runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  { t, locale } = useI18n()
const client = runtime.settings.firstUse
const {
  run,
  busy,
  failure,
  pending,
  locked,
  submit,
  query,
  compared,
  markCompared,
  resolveConflict,
} = useSettingsAction(() => 'first-use')
const progress = ref<FirstUseProgress>(),
  writable = ref(false)
const draft = ref<FirstUseIntent>({ channels: [], capabilities: {}, completionRequested: false })
const originalOperation = ref<string>(),
  inputLost = ref(false),
  invalidLocator = ref(false)
const currentStep = ref('channels')
const packageReady = ref(false),
  packageKnown = ref(false)
const steps = computed(() => [
  { id: 'channels', label: 'chooseChannels' },
  { id: 'storage', label: 'storageStep' },
  { id: 'trust', label: 'trustStep' },
  ...draft.value.channels.map((id) => ({ id, label: 'firstUseNames.' + id })),
  { id: 'options', label: 'optionsStep' },
  { id: 'review', label: 'reviewStep' },
])
const s3Ready = computed(
  () => progress.value?.steps.some((s) => s.id === 's3' && s.status === 'ready') === true,
)
const canFinish = computed(
  () =>
    !!progress.value?.canComplete &&
    s3Ready.value &&
    (!draft.value.channels.includes('agent') || packageReady.value) &&
    !dirty.value &&
    !blocked.value,
)
const channelMaterials = computed(() =>
  currentStep.value === 'agent'
    ? ['packages', 'task']
    : currentStep.value === 'windows_mdm'
      ? ['wns']
      : ['pki', 'apns', 'profile'],
)
const finished = computed(() => progress.value?.saved.intent.completionRequested === true)
const blocked = computed(
  () => locked.value || (!!originalOperation.value && !pending.value) || invalidLocator.value,
)
const capabilityChannel: Partial<Record<Capability, Channel>> = {
  agent_package: 'agent',
  task_signing: 'agent',
  windows_push: 'windows_mdm',
  apple_ade: 'macos_mdm',
  apple_account: 'macos_mdm',
}
const dirty = computed(
  () =>
    progress.value && JSON.stringify(draft.value) !== JSON.stringify(progress.value.saved.intent),
)
watch(
  () => draft.value.channels.join(','),
  () => {
    for (const [name, channel] of Object.entries(capabilityChannel)) {
      const key = name as Capability
      if (
        !draft.value.channels.includes(channel) &&
        draft.value.capabilities[key]?.kind === 'configure'
      )
        delete draft.value.capabilities[key]
    }
  },
)
function selectStep(id: string) {
  currentStep.value = id
  void router.replace({ query: { ...route.query, step: id } })
}
function decide(capability: Capability, event: Event) {
  const kind = (event.target as HTMLSelectElement).value
  if (kind === 'configure') draft.value.capabilities[capability] = { kind }
  else if (kind === 'skip') draft.value.capabilities[capability] = { kind, reason: '' }
  else delete draft.value.capabilities[capability]
}
function reason(capability: Capability, event: Event) {
  const decision = draft.value.capabilities[capability]
  if (decision?.kind === 'skip') decision.reason = (event.target as HTMLInputElement).value
}
function skipReason(capability: Capability) {
  const decision = draft.value.capabilities[capability]
  return decision?.kind === 'skip' ? decision.reason : ''
}
async function load() {
  progress.value = undefined
  writable.value = false
  packageReady.value = false
  await run(
    async () => {
      if (runtime.realm !== 'tenant') throw new Error('Business setup only')
      const principal = runtime.session.state.value.identity?.principalId
      const authorization = await runtime.operations.authorization.effective()
      if (authorization.principalId !== principal) throw new Error('Wrong setup actor')
      const value = await client.read()
      return {
        value,
        packages:
          value.saved.intent.channels.includes('agent') || value.saved.revision === 0
            ? await runtime.settings.packages.read().catch(() => null)
            : [],
        writable: authorization.grants.some(
          (g) => g.operation === 'registration_configuration_write' && g.scope.kind === 'tenant',
        ),
      }
    },
    (result) => {
      progress.value = result.value
      writable.value = result.writable
      packageKnown.value = result.packages !== null
      packageReady.value = result.packages?.some((p) => p.channel === 'production') ?? false
      if (!pending.value || pending.value.state === 'received') {
        draft.value = structuredClone(result.value.saved.intent)
        if (!finished.value) {
          if (result.value.saved.revision === 0 && !draft.value.channels.length)
            draft.value.channels = ['agent']
          draft.value.capabilities.s3 = { kind: 'configure' }
          if (draft.value.channels.includes('agent'))
            draft.value.capabilities.agent_package = { kind: 'configure' }
        }
      } else {
        const original = closed(JSON.parse(pending.value.publicInput), ['intent'])
        if (typeof original['intent'] !== 'string') throw new Error('Invalid original setup input')
        draft.value = decodeIntent(JSON.parse(original['intent']))
      }
    },
  )
}
async function remember(id: string) {
  originalOperation.value = id
  await router.replace({ query: { ...route.query, operation: id } })
}
async function forget() {
  originalOperation.value = undefined
  inputLost.value = false
  await router.replace({ query: { ...route.query, operation: undefined } })
}
async function save(complete = false, replay = false) {
  if (
    !progress.value ||
    !writable.value ||
    finished.value ||
    invalidLocator.value ||
    (inputLost.value && !pending.value)
  )
    return
  if (!replay && blocked.value) return
  if (!replay && complete && !canFinish.value) return
  let intent: FirstUseIntent
  try {
    intent = decodeIntent(structuredClone(toRaw(draft.value)))
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  if (!replay && !finished.value) {
    intent.capabilities.s3 = { kind: 'configure' }
    if (intent.channels.includes('agent')) intent.capabilities.agent_package = { kind: 'configure' }
  }
  intent.completionRequested = complete
  const revision = replay ? pending.value!.expectedRevision : progress.value.saved.revision
  const id = replay ? pending.value!.id : crypto.randomUUID()
  await remember(id)
  let confirmed = false
  const ok = await submit(
    complete ? 'complete' : 'save',
    revision,
    { intent: JSON.stringify(intent) },
    (operation) => client.update(operation, revision, intent),
    (receipt) => {
      confirmed = receipt.saved.intent.completionRequested
    },
    replay,
    id,
  )
  if (ok) {
    await forget()
    if (confirmed) await router.replace({ name: 'workspace', params: { tenant: runtime.tenant } })
    else await load()
  } else if (!pending.value) {
    await forget()
    if (failure.value === 'firstUseNotReady') await load()
  }
}
async function lookup() {
  const id = originalOperation.value ?? pending.value?.id
  if (!id) return
  const ok = await query(
    id,
    () => client.operation(id),
    () => {},
  )
  if (ok) {
    await forget()
    await load()
  } else if (!pending.value) inputLost.value = true
}
async function compare() {
  await load()
  if (progress.value) markCompared()
}
async function editAgain() {
  resolveConflict()
  await forget()
}
onMounted(async () => {
  const locator = route.query['operation']
  if (locator !== undefined) {
    try {
      originalOperation.value = uuid(locator)
    } catch {
      invalidLocator.value = true
    }
  } else if (pending.value && pending.value.state !== 'received') {
    originalOperation.value = pending.value.id
  }
  await load()
  currentStep.value =
    typeof route.query['step'] === 'string' && steps.value.some((s) => s.id === route.query['step'])
      ? route.query['step']
      : 'channels'
  if (originalOperation.value) await lookup()
})
useSettingsFacts(() => {
  progress.value = undefined
  writable.value = false
  draft.value = { channels: [], capabilities: {}, completionRequested: false }
})
</script>
<template>
  <PageFrame :title="t('settings.guide')" :busy="busy" :failure="failure">
    <template #actions
      ><UiButton :disabled="busy" @click="load">{{ t('settings.reload') }}</UiButton
      ><RouterLink :to="{ name: 'settings-overview', params: { tenant: runtime.tenant } }">{{
        t('settings.allEntries')
      }}</RouterLink></template
    >
    <UiMessage v-if="finished" tone="info" :title="t('settings.guideFinished')">{{
      t('settings.guideDaily')
    }}</UiMessage>
    <UiMessage v-if="progress && !writable" tone="warning" :title="t('settings.guideReadonly')" />
    <UiMessage v-if="invalidLocator" tone="warning" :title="t('settings.guideInvalidLocator')" />
    <div v-if="progress" class="first-use-layout">
      <nav class="first-use-steps" :aria-label="t('settings.guide')">
        <UiButton
          v-for="(step, index) in steps"
          :key="step.id"
          :aria-current="currentStep === step.id ? 'step' : undefined"
          @click="selectStep(step.id)"
          >{{ index + 1 }}. {{ t('settings.' + step.label) }}</UiButton
        >
      </nav>
      <section class="console-panel">
        <template v-if="currentStep === 'channels'"
          ><h2>{{ t('settings.chooseChannels') }}</h2>
          <fieldset :disabled="!writable || finished || blocked || busy">
            <legend>{{ t('settings.guideSelection') }}</legend>
            <label v-for="channel in channels" :key="channel"
              ><input v-model="draft.channels" type="checkbox" :value="channel" />{{
                t('settings.firstUseNames.' + channel)
              }}</label
            >
          </fieldset>
          <UiButton
            v-if="!finished && writable"
            :disabled="blocked || busy || !draft.channels.length"
            @click="save()"
            >{{ t('settings.guideSave') }}</UiButton
          ></template
        >
        <template v-else-if="currentStep === 'storage'"
          ><h2>{{ t('settings.storageStep') }}</h2>
          <p>{{ t('settings.storageRequired') }}</p>
          <MaterialPanel material="storage"
        /></template>
        <template v-else-if="currentStep === 'trust'"
          ><h2>{{ t('settings.trustStep') }}</h2>
          <p>{{ t('settings.caOperationsBoundary') }}</p>
          <MaterialPanel material="pki"
        /></template>
        <template v-else-if="channels.includes(currentStep as Channel)"
          ><h2>{{ t('settings.firstUseNames.' + currentStep) }}</h2>
          <p v-if="currentStep === 'windows_mdm'">{{ t('settings.windowsIdentityBoundary') }}</p>
          <section v-for="(material, index) in channelMaterials" :key="material">
            <h3>{{ index + 1 }}. {{ t('settings.materialNames.' + material) }}</h3>
            <MaterialPanel :material="material" />
          </section>
          <nav class="console-inline-actions">
            <RouterLink :to="{ name: 'device-enroll', params: { tenant: runtime.tenant } }">{{
              t('settings.manualEnrollment')
            }}</RouterLink
            ><RouterLink
              v-if="currentStep === 'agent'"
              :to="{ name: 'agent-configurations', params: { tenant: runtime.tenant } }"
              >{{ t('settings.channelAgent') }}</RouterLink
            ><RouterLink
              v-if="currentStep === 'macos_mdm'"
              :to="settingsDestination('ade', runtime.tenant)"
              >{{ t('settings.adeEnrollment') }}</RouterLink
            ><RouterLink
              v-if="currentStep === 'macos_mdm'"
              :to="settingsDestination('appleAccount', runtime.tenant)"
              >{{ t('settings.managedAppleEnrollment') }}</RouterLink
            >
          </nav>
        </template>
        <template v-else-if="currentStep === 'options'"
          ><h2>{{ t('settings.optionsStep') }}</h2>
          <fieldset :disabled="!writable || finished || blocked || busy">
            <label
              v-for="capability in capabilities.filter((c) =>
                [
                  'oidc',
                  'smtp',
                  'webhook',
                  'recovery_credentials',
                  'task_signing',
                  'windows_push',
                  'apple_ade',
                  'apple_account',
                ].includes(c),
              )"
              :key="capability"
              >{{ t('settings.firstUseNames.' + capability)
              }}<select
                :value="draft.capabilities[capability]?.kind ?? ''"
                :data-capability="capability"
                class="ui-input"
                @change="decide(capability, $event)"
              >
                <option value="">{{ t('settings.guideNotSelected') }}</option>
                <option
                  value="configure"
                  :disabled="
                    !!capabilityChannel[capability] &&
                    !draft.channels.includes(capabilityChannel[capability]!)
                  "
                >
                  {{ t('settings.guideConfigure') }}
                </option>
                <option value="skip">{{ t('settings.guideSkip') }}</option></select
              ><input
                v-if="draft.capabilities[capability]?.kind === 'skip'"
                :value="skipReason(capability)"
                :placeholder="t('settings.guideSkipReason')"
                :aria-label="
                  t('settings.guideSkipReason') + ' · ' + t('settings.firstUseNames.' + capability)
                "
                class="ui-input"
                @input="reason(capability, $event)"
            /></label>
          </fieldset>
          <UiButton v-if="!finished && writable" :disabled="blocked || busy" @click="save()">{{
            t('settings.guideSave')
          }}</UiButton></template
        >
        <template v-else-if="currentStep === 'review'"
          ><h2>{{ t('settings.reviewStep') }}</h2>
          <p v-if="!s3Ready">{{ t('settings.storageRequired') }}</p>
          <p v-if="draft.channels.includes('agent') && !packageKnown">
            {{ t('settings.packageReadUnknown') }}
          </p>
          <p v-else-if="draft.channels.includes('agent') && !packageReady">
            {{ t('settings.productionPackageRequired') }}
          </p>
          <article v-for="step in progress.steps" :key="step.id" :data-first-use-step="step.id">
            <h3>
              {{ t('settings.firstUseNames.' + step.id) }} ·
              {{ t('settings.firstUseStatus.' + step.status) }}
            </h3>
            <p v-if="step.reason">{{ step.reason }}</p>
            <div v-for="item in step.evidence" :key="item.id" :data-setting="item.id">
              <strong>{{ locale === 'zh-CN' ? entries[item.id].zh : entries[item.id].en }}</strong>
              <p>
                {{ t('settings.savedVersion') }} {{ item.revision ?? '—' }} ·
                {{ t('settings.requestedVersion') }} {{ item.desiredRevision ?? '—' }} ·
                {{ t('settings.runtimeVersion') }} {{ item.appliedRevision ?? '—' }}
              </p>
              <RouterLink :to="settingsDestination(entries[item.id].target, runtime.tenant)">{{
                t('settings.open')
              }}</RouterLink>
            </div>
          </article>
          <UiButton
            v-if="!finished && writable"
            :disabled="blocked || busy || !draft.channels.length"
            @click="save()"
            >{{ t('settings.guideSave') }}</UiButton
          ><UiButton
            v-if="!finished && writable"
            :disabled="busy || !canFinish"
            @click="save(true)"
            >{{ t('settings.finish') }}</UiButton
          >
        </template>
        <p v-if="dirty && !finished">{{ t('settings.guideUnsaved') }}</p>
      </section>
    </div>
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="writable && !inputLost"
      :compared="compared"
      @query="lookup"
      @compare="compare"
      @edit="editAgain"
      @retry="save(pending?.action === 'complete', true)"
    />
    <section v-if="originalOperation && !pending" class="console-panel">
      <p>{{ t('settings.guideInputLost') }}</p>
      <UiButton :busy="busy" @click="lookup">{{ t('settings.queryOperation') }}</UiButton>
    </section>
    <RouterLink v-if="finished" :to="{ name: 'workspace', params: { tenant: runtime.tenant } }">{{
      t('settings.guideWorkspace')
    }}</RouterLink>
  </PageFrame>
</template>
