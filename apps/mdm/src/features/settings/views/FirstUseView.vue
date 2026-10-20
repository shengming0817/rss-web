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
  await run(
    async () => {
      if (runtime.realm !== 'tenant') throw new Error('Business setup only')
      const principal = runtime.session.state.value.identity?.principalId
      const authorization = await runtime.operations.authorization.effective()
      if (authorization.principalId !== principal) throw new Error('Wrong setup actor')
      const value = await client.read()
      return {
        value,
        writable: authorization.grants.some(
          (g) => g.operation === 'registration_configuration_write' && g.scope.kind === 'tenant',
        ),
      }
    },
    (result) => {
      progress.value = result.value
      writable.value = result.writable
      if (!pending.value || pending.value.state === 'received')
        draft.value = structuredClone(result.value.saved.intent)
      else {
        const original = closed(JSON.parse(pending.value.publicInput), ['intent'])
        if (typeof original['intent'] !== 'string') throw new Error('Invalid original setup input')
        draft.value = decodeIntent(JSON.parse(original['intent']))
      }
    },
  )
}
async function remember(id: string) {
  originalOperation.value = id
  await router.replace({ query: { operation: id } })
}
async function forget() {
  originalOperation.value = undefined
  inputLost.value = false
  await router.replace({ query: {} })
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
  let intent: FirstUseIntent
  try {
    intent = decodeIntent(structuredClone(toRaw(draft.value)))
  } catch {
    failure.value = 'invalidRequest'
    return
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
      ><UiButton :busy="busy" @click="load">{{ t('settings.reload') }}</UiButton
      ><RouterLink :to="{ name: 'settings-overview', params: { tenant: runtime.tenant } }">{{
        t('settings.allEntries')
      }}</RouterLink></template
    >
    <p>{{ t('settings.guideAuthority') }}</p>
    <UiMessage v-if="finished" tone="info" :title="t('settings.guideFinished')">{{
      t('settings.guideDaily')
    }}</UiMessage>
    <UiMessage v-if="progress && !writable" tone="warning" :title="t('settings.guideReadonly')" />
    <UiMessage v-if="invalidLocator" tone="warning" :title="t('settings.guideInvalidLocator')" />
    <section v-if="progress" class="console-panel">
      <h2>{{ t('settings.selectChannels') }}</h2>
      <fieldset :disabled="!writable || finished || blocked || busy" class="settings-actions">
        <legend>{{ t('settings.guideSelection') }}</legend>
        <label v-for="channel in channels" :key="channel"
          ><input v-model="draft.channels" type="checkbox" :value="channel" />{{
            t('settings.firstUseNames.' + channel)
          }}</label
        >
        <label v-for="capability in capabilities" :key="capability"
          >{{ t('settings.firstUseNames.' + capability) }}
          <select
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
            <option value="skip">{{ t('settings.guideSkip') }}</option>
          </select>
          <input
            v-if="draft.capabilities[capability]?.kind === 'skip'"
            :value="skipReason(capability)"
            class="ui-input"
            :aria-label="
              t('settings.guideSkipReason') + ' · ' + t('settings.firstUseNames.' + capability)
            "
            :placeholder="t('settings.guideSkipReason')"
            @input="reason(capability, $event)"
          />
        </label>
      </fieldset>
      <UiButton
        v-if="!finished && writable"
        :disabled="blocked || busy || !draft.channels.length"
        @click="save()"
        >{{ t('settings.guideSave') }}</UiButton
      >
      <p v-if="dirty">{{ t('settings.guideUnsaved') }}</p>
    </section>
    <section v-if="progress" class="console-panel">
      <h2>{{ t('settings.guideFacts') }}</h2>
      <p v-if="!progress.steps.length">{{ t('settings.guideChooseFirst') }}</p>
      <article v-for="step in progress.steps" :key="step.id" :data-first-use-step="step.id">
        <h3>
          {{ t('settings.firstUseNames.' + step.id) }} ·
          {{ t('settings.firstUseStatus.' + step.status) }}
        </h3>
        <p v-if="step.reason">{{ t('settings.guideReason') }}: {{ step.reason }}</p>
        <RouterLink
          v-if="channels.includes(step.id as Channel)"
          :to="{ name: 'registration-quotas', params: { tenant: runtime.tenant } }"
          >{{ t('settings.guideChannelSettings') }}</RouterLink
        >
        <RouterLink
          v-if="step.id === 'agent_registration'"
          :to="{ name: 'agent-configurations', params: { tenant: runtime.tenant } }"
          >{{ t('settings.channelAgent') }}</RouterLink
        >
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
    </section>
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
      <p>
        {{ t('settings.operationId') }} <code>{{ originalOperation }}</code>
      </p>
      <p v-if="inputLost">{{ t('settings.guideInputLost') }}</p>
      <UiButton :busy="busy" @click="lookup">{{ t('settings.queryOperation') }}</UiButton>
    </section>
    <UiButton
      v-if="progress && !finished && writable"
      :disabled="blocked || busy || dirty || !progress.canComplete"
      @click="save(true)"
      >{{ t('settings.finish') }}</UiButton
    >
    <RouterLink v-if="finished" :to="{ name: 'workspace', params: { tenant: runtime.tenant } }">{{
      t('settings.guideWorkspace')
    }}</RouterLink>
  </PageFrame>
</template>

<style scoped>
.first-use-selection {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
}
.first-use-selection label {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
}
</style>
