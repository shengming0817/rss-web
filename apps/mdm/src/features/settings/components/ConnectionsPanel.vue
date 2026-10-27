<script setup lang="ts">
import '../settings.css'
import { VBtn, VCard, VCheckbox, VForm, VTextField, VTextarea } from 'vuetify/components'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsFacts } from '../useSettingsAction'
import { origin } from '../clients/value'
import {
  connectionsFilename,
  type ConnectionState,
  type connectionDevices,
} from '../clients/connections'
import { downloadPublic } from '../download'
import { auditTime } from '../../operations/format'
import OperationNotice from './OperationNotice.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.connections
const { canRead, canWrite } = usePermission(
  'registration_configuration_read',
  'registration_configuration_write',
)
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
} = useSettingsAction(() => 'connections')
const state = ref<ConnectionState>(),
  preferred = ref(''),
  candidates = ref(''),
  reviewed = ref(false)
const devices = ref<ReturnType<typeof connectionDevices>>()
const draft = computed(() => state.value?.draft?.configuration)
const published = computed(() => state.value?.published?.configuration)
const removed = computed(
  () => published.value?.origins.filter((v) => !draft.value?.origins.includes(v)) ?? [],
)
const added = computed(
  () => draft.value?.origins.filter((v) => !published.value?.origins.includes(v)) ?? [],
)
const editable = computed(() => canWrite.value && !locked.value && !!state.value)
function clear() {
  state.value = undefined
  devices.value = undefined
  preferred.value = ''
  candidates.value = ''
  reviewed.value = false
}
function apply(value: ConnectionState) {
  state.value = value
  reviewed.value = false
  if (!pending.value || pending.value.state === 'received') {
    preferred.value = value.draft?.configuration.preferredOrigin ?? ''
    candidates.value = value.draft?.configuration.origins.join('\n') ?? ''
  }
}
async function load() {
  state.value = undefined
  devices.value = undefined
  reviewed.value = false
  if (!canRead.value) return false
  await runtime.registrationChannels.refresh()
  return run(() => client.read(), apply)
}
async function compare() {
  if (await load()) markCompared()
}
async function save(replay = false) {
  if (!canWrite.value || !state.value) return
  try {
    const input = replay
      ? (JSON.parse(pending.value!.publicInput) as { preferredOrigin: string; origins: string })
      : {
          preferredOrigin: origin(preferred.value),
          origins: JSON.stringify(
            [...new Set(candidates.value.split(/\s+/).filter(Boolean).map(origin))].sort(),
          ),
        }
    const origins = JSON.parse(input.origins) as string[]
    if (!origins.length || origins.length > 8 || !origins.includes(input.preferredOrigin))
      throw new Error('Invalid origins')
    const revision = replay ? pending.value!.expectedRevision : (draft.value?.revision ?? 0)
    const ok = await submit(
      'save',
      revision,
      input,
      (id) => client.save(id, revision, input.preferredOrigin, origins),
      () => {},
      replay,
    )
    if (ok) await load()
  } catch {
    failure.value = 'invalidRequest'
  }
}
async function publish(replay = false) {
  if (!canWrite.value || !state.value || (!replay && (!reviewed.value || !draft.value))) return
  const revision = replay ? pending.value!.expectedRevision : draft.value!.revision
  const ok = await submit(
    'publish',
    revision,
    {},
    (id) => client.publish(id, revision),
    () => {},
    replay,
  )
  if (ok) await load()
}
async function lookup() {
  const original = pending.value
  if (!original || !canRead.value) return
  const ok = await query(
    original.id,
    async () => {
      const receipt = await client.operation(original.id)
      if (receipt) {
        const configuration =
          receipt.action === 'saved'
            ? receipt.draft.configuration
            : receipt.configuration.configuration
        const intent = JSON.parse(original.publicInput) as {
          preferredOrigin?: string
          origins?: string
        }
        if (
          configuration.serviceId !== state.value?.serviceId ||
          configuration.revision !==
            original.expectedRevision + (original.action === 'save' ? 1 : 0) ||
          receipt.action !== (original.action === 'save' ? 'saved' : 'published') ||
          (receipt.action === 'saved' &&
            (configuration.preferredOrigin !== intent.preferredOrigin ||
              JSON.stringify(configuration.origins) !== intent.origins))
        )
          throw new Error('Wrong original connection operation')
      }
      return receipt
    },
    () => {},
    (v) => v !== null,
  )
  if (ok && pending.value?.state === 'received') await load()
}
async function readDevices(more = false) {
  const revision = published.value?.revision
  if (!revision || !canRead.value) return
  const previous = more ? devices.value : undefined
  await run(
    () => client.devices(revision, previous?.next ?? undefined),
    (v) => {
      devices.value = { ...v, items: [...(previous?.items ?? []), ...v.items] }
    },
  )
}
async function download() {
  if (!canRead.value) return
  await run(
    () => client.download(),
    (file) =>
      downloadPublic(
        connectionsFilename,
        new TextDecoder('utf-8', { fatal: true }).decode(file.bytes),
      ),
  )
}
watch(
  canRead,
  (value) => {
    if (value) void load()
    else clear()
  },
  { immediate: true },
)
watch([preferred, candidates], () => {
  reviewed.value = false
})
watch(failure, (value) => {
  if (value === 'denied') clear()
})
useSettingsFacts(clear)
</script>
<template>
  <VCard class="console-panel" :aria-busy="busy" tag="section" variant="outlined"
    ><h2>{{ t('settings.connections.title') }}</h2>
    <p>{{ t('settings.connections.boundary') }}</p>
    <VBtn :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</VBtn>
    <p v-if="!canWrite">{{ t('settings.readOnly') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canWrite"
      :compared="compared"
      @query="lookup"
      @retry="pending?.action === 'save' ? save(true) : publish(true)"
      @compare="compare"
      @edit="resolveConflict"
    /><template v-if="state"
      ><p>
        {{ t('settings.connections.service') }} <code>{{ state.serviceId }}</code>
      </p>
      <dl v-if="runtime.registrationChannels.publicEndpoints.value" class="settings-facts">
        <dt>{{ t('settings.connections.console') }}</dt>
        <dd>{{ runtime.registrationChannels.publicEndpoints.value.console }}</dd>
        <dt>Agent</dt>
        <dd>{{ runtime.registrationChannels.publicEndpoints.value.agent.join(', ') }}</dd>
        <dt>{{ t('settings.connections.windowsEnrollment') }}</dt>
        <dd>{{ runtime.registrationChannels.publicEndpoints.value.windowsEnrollment ?? '—' }}</dd>
        <dt>{{ t('settings.connections.windowsManagement') }}</dt>
        <dd>
          {{
            runtime.registrationChannels.publicEndpoints.value.windowsManagement.join(', ') || '—'
          }}
        </dd>
        <dt>{{ t('settings.connections.apple') }}</dt>
        <dd>{{ runtime.registrationChannels.publicEndpoints.value.appleManagement ?? '—' }}</dd>
      </dl>
      <p v-else-if="runtime.registrationChannels.failure.value" role="alert">
        {{ t('settings.connections.endpointsFailed') }}
      </p>
      <p v-else>{{ t('settings.notObserved') }}</p>
      <VForm :novalidate="false" class="settings-editor" @submit.prevent="save()"
        ><fieldset :disabled="!editable">
          <legend>{{ t('settings.connections.desired') }} · {{ draft?.revision ?? '—' }}</legend>
          <label for="connection-preferred">{{ t('settings.connections.preferred') }}</label
          ><VTextField
            id="connection-preferred"
            v-model="preferred"
            type="url"
            required
            :disabled="!editable"
          /><label for="connection-origins">{{ t('settings.connections.origins') }}</label
          ><VTextarea
            id="connection-origins"
            v-model="candidates"
            required
            rows="4"
            maxlength="32768"
            :disabled="!editable"
          /><VBtn type="submit" :disabled="!editable">{{ t('settings.save') }}</VBtn>
        </fieldset></VForm
      >
      <p>{{ t('settings.connections.published') }} {{ published?.revision ?? '—' }}</p>
      <p>{{ t('settings.connections.savedHint') }}</p>
      <template v-if="draft"
        ><h3>{{ t('settings.connections.diff') }}</h3>
        <dl class="settings-facts">
          <dt>{{ t('settings.connections.preferred') }}</dt>
          <dd>{{ published?.preferredOrigin ?? '—' }} → {{ draft.preferredOrigin }}</dd>
          <dt>{{ t('settings.connections.added') }}</dt>
          <dd>{{ added.join(', ') || '—' }}</dd>
          <dt>{{ t('settings.connections.removed') }}</dt>
          <dd>{{ removed.join(', ') || '—' }}</dd>
        </dl>
        <p>{{ t('settings.connections.retirement') }}</p>
        <p>{{ t('settings.connections.blockers', state.retirementBlockers) }}</p>
        <h3>{{ t('settings.connections.deployment') }}</h3>
        <p>{{ t('settings.connections.deploymentHint') }}</p>
        <ul>
          <li v-for="entry in state.deployments" :key="entry.origin">
            {{ entry.origin }} · {{ t('settings.revision') }} {{ entry.configurationRevision }} ·
            {{ auditTime(entry.observedAt) }} · {{ entry.hostId }}
          </li>
        </ul>
        <p v-if="!state.deployments.length">{{ t('settings.notObserved') }}</p>
        <VCheckbox
          v-model="reviewed"
          :disabled="!editable"
          :label="t('settings.connections.review')"
        /><VBtn
          :disabled="!editable || !reviewed || draft.revision === published?.revision"
          @click="publish()"
          >{{ t('settings.connections.publish') }}</VBtn
        ></template
      >
      <h3>{{ t('settings.connections.convergence') }}</h3>
      <p>
        {{
          t('settings.connections.confirmed', {
            confirmed: state.convergence.confirmedDevices,
            active: state.convergence.activeDevices,
          })
        }}
      </p>
      <VBtn :disabled="busy || !published || !canRead" @click="readDevices()">{{
        t('settings.connections.unconfirmed')
      }}</VBtn>
      <ul>
        <li v-for="device in devices?.items" :key="device.registration">
          <VBtn
            :to="{
              name: 'device-management',
              params: { tenant: runtime.tenant, device: device.device },
            }"
            variant="text"
            >{{ device.device }}</VBtn
          >
          · {{ t('settings.connections.installed') }} {{ device.installedRevision ?? '—' }} ·
          {{ device.origin ?? '—' }} ·
          {{ device.receivedAt === null ? '—' : auditTime(device.receivedAt) }}
        </li>
      </ul>
      <VBtn v-if="devices?.next" :disabled="busy" @click="readDevices(true)">{{
        t('settings.connections.more')
      }}</VBtn
      ><VBtn :disabled="busy || !published || !canRead" @click="download">{{
        t('settings.connections.download')
      }}</VBtn>
      <p>{{ t('settings.connections.offline') }}</p></template
    ></VCard
  >
</template>
