<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOriginalOperation } from '../../../services/useOriginalOperation'
import { useSettingsSecrets } from '../../settings/useSettingsAction'
import {
  appleCredentialActions,
  type AppleAction,
  type CredentialInput,
  type Material,
} from '../clients/credentials'
import type { EndpointDetail } from '../../devices/clients/endpoint-model'
const props = defineProps<{ endpoint: EndpointDetail }>(),
  runtime = useMdm(),
  { t } = useI18n()
const client = runtime.security.credentials
const { run, submit, pending, locked, busy, failure, confirmOriginal } = useOriginalOperation(
  () => 'credentials/' + props.endpoint.id,
)
const rows = ref<Material[]>([]),
  more = ref(false),
  secret = ref(''),
  action = ref<AppleAction>('collect_filevault'),
  revision = ref(0),
  recipient = ref(''),
  password = ref(''),
  materialId = ref(''),
  materialVersion = ref(1),
  sourceOperation = ref(''),
  clearLock = ref(false),
  confirmation = ref(false),
  resultId = ref('')
const nativePending = computed(
  () => (pending.value?.input as { kind: string } | undefined)?.kind === 'native',
)
const needsPassword = computed(
  () =>
    action.value === 'rotate_filevault' ||
    (pending.value?.input as { kind: string; input?: CredentialInput } | undefined)?.input?.action
      .kind === 'rotate_filevault',
)
let disclosureEpoch = 0
function clear() {
  disclosureEpoch++
  secret.value = ''
  password.value = ''
}
useSettingsSecrets(clear)
watch(
  () => props.endpoint.id,
  () => {
    clear()
    rows.value = []
    more.value = false
    resultId.value = ''
  },
)
async function load(next = false) {
  clear()
  await run(
    () => client.list(props.endpoint.id, next ? rows.value.at(-1) : undefined),
    (value) => {
      rows.value = next ? [...rows.value, ...value] : value
      more.value = value.length === 100
    },
  )
  if (failure.value) {
    rows.value = []
    more.value = false
  }
}
async function reveal(entry: Material) {
  clear()
  const epoch = disclosureEpoch
  await run(
    () => client.reveal(props.endpoint.id, entry),
    (v) => {
      if (epoch === disclosureEpoch && document.visibilityState === 'visible')
        secret.value = v.secret
    },
  )
  if (failure.value === 'denied') rows.value = []
}
async function revoke(entry: Material, replay = false) {
  clear()
  if (!confirmation.value || (locked.value && !replay)) return
  confirmation.value = false
  const ok = await submit(
    { kind: 'revoke' as const, entry: structuredClone(toRaw(entry)) },
    (_id, original) => client.revoke(props.endpoint.id, original.entry),
    () => {},
    replay,
  )
  if (ok) await load()
}
function input(): CredentialInput {
  const registration = props.endpoint.channels.find(
    (c) => c.channel === 'mdm' && c.status === 'active',
  )
  if (!registration) throw new Error('No current MDM registration')
  const kind = action.value,
    version = { id: materialId.value, version: materialVersion.value }
  return {
    registration: registration.registrationId,
    generation: registration.generation,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    action:
      kind === 'configure_filevault'
        ? { kind }
        : kind === 'collect_filevault'
          ? { kind, expectedRevision: revision.value, recipient: recipient.value || null }
          : kind === 'rotate_filevault'
            ? { kind, expectedRevision: revision.value }
            : kind === 'reconcile_filevault'
              ? { kind, material: version, recipient: recipient.value || null }
              : kind === 'set_recovery_lock'
                ? {
                    kind,
                    expectedRevision: revision.value,
                    current: materialId.value ? version : null,
                    clear: clearLock.value,
                  }
                : kind === 'reconcile_recovery_lock'
                  ? { kind, material: version, operation: sourceOperation.value }
                  : { kind, material: version },
  }
}
async function execute(replay = false) {
  if (!confirmation.value) return
  confirmation.value = false
  const unlock = password.value
  clear()
  try {
    const original = replay
      ? (pending.value!.input as { kind: 'native'; input: CredentialInput }).input
      : input()
    await submit(
      { kind: 'native' as const, input: original },
      (id, stored) => {
        const body = stored.input
        resultId.value = id
        return client.create(props.endpoint.id, id, {
          ...body,
          action:
            body.action.kind === 'rotate_filevault'
              ? { ...body.action, unlockPassword: unlock }
              : body.action,
        })
      },
      (v) => {
        resultId.value = v.operationId
      },
      replay,
    )
  } catch {
    failure.value = 'invalidRequest'
  }
}
function restore() {
  const original = pending.value?.input as
    | { kind: 'revoke'; entry: Material }
    | { kind: 'native'; input: CredentialInput }
    | undefined
  if (original?.kind === 'revoke') void revoke(original.entry, true)
  else void execute(true)
}
async function query() {
  const id = pending.value?.id ?? resultId.value
  if (id)
    await run(
      () => runtime.policies.native.read(props.endpoint.id, id),
      (v) => {
        resultId.value = v.operationId
        confirmOriginal(id)
      },
    )
}
</script>
<template>
  <section class="console-panel" data-panel="recovery-credentials" :aria-busy="busy">
    <h2>{{ t('gap.credentials') }}</h2>
    <p>{{ t('gap.escrowHint') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <UiButton :disabled="busy" @click="load()">{{ t('gap.load') }}</UiButton>
    <article v-for="entry in rows" :key="entry.id + ':' + entry.version">
      <h3>{{ entry.binding.subject.kind }} · {{ entry.id }} / {{ entry.version }}</h3>
      <p>
        {{ entry.binding.registration }} / {{ entry.binding.generation }} · {{ entry.validity }} ·
        {{ t('gap.metadata') }}: {{ entry.escrowed }}
      </p>
      <dl v-if="entry.binding.subject.kind === 'bitlocker'">
        <dt>{{ t('gap.volume') }}</dt>
        <dd>{{ entry.binding.subject.volume }}</dd>
        <dt>{{ t('gap.protector') }}</dt>
        <dd>{{ entry.binding.subject.protector }}</dd>
      </dl>
      <UiButton
        :disabled="busy || !entry.escrowed || ['superseded', 'revoked'].includes(entry.validity)"
        @click="reveal(entry)"
        >{{ t('gap.reveal') }}</UiButton
      >
      <UiButton
        :disabled="locked || entry.validity === 'revoked' || !confirmation"
        @click="revoke(entry)"
        >{{ t('gap.revoke') }}</UiButton
      >
    </article>
    <UiButton v-if="more" :disabled="busy" @click="load(true)">{{ t('gap.next') }}</UiButton>
    <template v-if="secret"
      ><output aria-live="polite">{{ secret }}</output
      ><UiButton @click="clear">{{ t('gap.clear') }}</UiButton></template
    >
    <p>{{ t('gap.revokedHint') }}</p>
    <label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label>
    <form
      v-if="endpoint.primaryMdmRegistration?.source === 'mdm.apple'"
      @submit.prevent="execute()"
    >
      <fieldset :disabled="locked">
        <label
          >{{ t('gap.action')
          }}<select v-model="action" :aria-label="t('gap.action')">
            <option v-for="kind in appleCredentialActions" :key="kind" :value="kind">
              {{ t('gap.' + kind) }}
            </option>
          </select></label
        >
        <label
          >{{ t('gap.revision') }}<input v-model.number="revision" type="number" min="0" required
        /></label>
        <label>{{ t('gap.recipient') }}<input v-model="recipient" /></label>
        <label>{{ t('gap.material') }}<input v-model="materialId" /></label
        ><label
          >{{ t('gap.version') }}<input v-model.number="materialVersion" type="number" min="1"
        /></label>
        <label v-if="action === 'reconcile_recovery_lock'"
          >{{ t('gap.operation') }}<input v-model="sourceOperation" required
        /></label>
        <label v-if="action === 'set_recovery_lock'"
          ><input v-model="clearLock" type="checkbox" />{{ t('gap.clear') }}</label
        >
      </fieldset>
      <label v-if="needsPassword"
        >{{ t('gap.password') }}<input v-model="password" type="password" autocomplete="off"
      /></label>
      <UiButton type="submit" :disabled="locked || !confirmation">{{ t('gap.save') }}</UiButton>
    </form>
    <p v-if="pending" role="alert">{{ t('gap.unknown') }} {{ pending.id }}</p>
    <UiButton
      v-if="pending?.state === 'unknown'"
      :disabled="busy || !confirmation"
      @click="restore"
      >{{ t('gap.replayOriginal') }}</UiButton
    >
    <UiButton v-if="resultId || nativePending" :disabled="busy" @click="query">{{
      t('gap.queryOriginal')
    }}</UiButton>
    <RouterLink
      v-if="resultId"
      :to="{
        name: 'policy-execution',
        params: { tenant: runtime.tenant, execution: resultId },
        query: { device: endpoint.id },
      }"
      >{{ t('gap.result') }}</RouterLink
    >
    <RouterLink :to="{ name: 'policy-lifecycle', params: { tenant: runtime.tenant } }">{{
      t('gap.lifecycle')
    }}</RouterLink>
  </section>
</template>
