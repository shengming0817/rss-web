<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCheckbox,
  VCol,
  VRow,
  VSelect,
  VTable,
  VTextField,
} from 'vuetify/components'
import { computed, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'

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
type CredentialDraft = Omit<CredentialInput, 'action'> & {
  action:
    | Exclude<CredentialInput['action'], { kind: 'rotate_filevault' }>
    | Omit<Extract<CredentialInput['action'], { kind: 'rotate_filevault' }>, 'unlockPassword'>
}
const props = defineProps<{ endpoint: EndpointDetail }>(),
  runtime = useMdm(),
  { t } = useI18n()

const credentialQuery = useDirectoryQuery(
  [
    'id',
    'version',
    'current',
    'validity',
    'escrowed',
    'operation',
    'createdAt',
    'invalidatedAt',
    'binding',
  ],
  100,
)

const client = runtime.security.credentials
const { run, submit, pending, locked, busy, failure, confirmOriginal, resolvedConflict } =
  useOriginalOperation(() => 'credentials/' + props.endpoint.id)
const currentEndpoint = ref<EndpointDetail>(),
  rows = ref<Material[]>([]),
  nextCursor = ref<string | null>(null),
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
    (pending.value?.input as { kind: string; input?: CredentialDraft } | undefined)?.input?.action
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
  () => props.endpoint,
  () => {
    clear()
    currentEndpoint.value = undefined
    rows.value = []
    nextCursor.value = null
    resultId.value = ''
  },
)
const projectedRows = ref<object[]>([])
async function readProjected(row: Record<string, unknown>) {
  if (typeof row['id'] !== 'string' || typeof row['version'] !== 'number') return
  await run(
    () => client.read(props.endpoint.id, row['id'] as string, row['version'] as number),
    (value) => {
      rows.value = [value]
    },
  )
}
async function load(after?: string) {
  clear()
  await run(
    () => credentialQuery.read(after, (query) => client.list(props.endpoint.id, query)),
    (page) => {
      projectedRows.value = page.items
      rows.value = credentialQuery.complete.value ? page.items : []
      nextCursor.value = page.nextCursor
    },
  )
  if (failure.value) {
    rows.value = []
    nextCursor.value = null
  }
}
async function compare() {
  clear()
  rows.value = []
  nextCursor.value = null
  const ok = await run(
    async () => ({
      endpoint: await runtime.devices.directory.detail(props.endpoint.id),
      materials: await client.list(props.endpoint.id),
    }),
    (value) => {
      currentEndpoint.value = value.endpoint
      rows.value = value.materials.items
      nextCursor.value = value.materials.nextCursor
    },
  )
  if (ok) {
    resultId.value = ''
    resolvedConflict()
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
function input(): CredentialDraft {
  const registration = (currentEndpoint.value ?? props.endpoint).channels.find(
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
      ? (pending.value!.input as { kind: 'native'; input: CredentialDraft }).input
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
    | { kind: 'native'; input: CredentialDraft }
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
credentialQuery.onClear(() => {
  rows.value = []
  projectedRows.value = []
})
</script>
<template>
  <DirectoryControls
    :query="credentialQuery"
    :busy="busy"
    hint="id / version / current / validity / escrowed / operation / createdAt / invalidatedAt"
    @load="load"
  />
  <DirectoryResults
    v-if="!credentialQuery.complete.value"
    :disabled="busy || locked"
    :required="['id', 'version']"
    :items="projectedRows"
    @open="
      (row) => {
        readProjected(row)
      }
    "
  />

  <v-card :title="t('gap.credentials')" data-panel="recovery-credentials" :aria-busy="busy"
    ><v-card-text>
      <p class="mb-4">{{ t('gap.escrowHint') }}</p>
      <v-alert v-if="failure" type="error" variant="tonal" class="mb-4">{{
        t('devices.' + failure)
      }}</v-alert
      ><v-btn variant="tonal" :disabled="busy" class="mb-4" @click="load()">{{
        t('gap.load')
      }}</v-btn>
      <v-card
        v-for="entry in rows"
        :key="entry.id + ':' + entry.version"
        variant="tonal"
        :title="entry.binding.subject.kind + ' · ' + entry.id + ' / ' + entry.version"
        class="mb-4"
        ><v-card-text
          ><p class="mb-3">
            {{ entry.binding.registration }} / {{ entry.binding.generation }} ·
            {{ entry.validity }} · {{ t('gap.metadata') }}: {{ entry.escrowed }}
          </p>
          <v-table v-if="entry.binding.subject.kind === 'bitlocker'" class="mb-3"
            ><tbody>
              <tr>
                <th>{{ t('gap.volume') }}</th>
                <td>{{ entry.binding.subject.volume }}</td>
              </tr>
              <tr>
                <th>{{ t('gap.protector') }}</th>
                <td>{{ entry.binding.subject.protector }}</td>
              </tr>
            </tbody></v-table
          >
          <div class="d-flex flex-wrap ga-3">
            <v-btn
              :disabled="
                busy || !entry.escrowed || ['superseded', 'revoked'].includes(entry.validity)
              "
              @click="reveal(entry)"
              >{{ t('gap.reveal') }}</v-btn
            ><v-btn
              variant="outlined"
              :disabled="locked || entry.validity === 'revoked' || !confirmation"
              @click="revoke(entry)"
              >{{ t('gap.revoke') }}</v-btn
            >
          </div></v-card-text
        ></v-card
      >

      <v-alert v-if="secret" type="warning" variant="tonal" class="my-4"
        ><output aria-live="polite">{{ secret }}</output
        ><v-btn variant="text" @click="clear">{{ t('gap.clear') }}</v-btn></v-alert
      >
      <p class="my-3">{{ t('gap.revokedHint') }}</p>
      <p v-if="currentEndpoint?.primaryMdmRegistration" class="mb-3">
        {{ t('gap.registration') }}: {{ currentEndpoint.primaryMdmRegistration.registrationId }} ·
        {{ t('gap.generation') }}: {{ currentEndpoint.primaryMdmRegistration.generation }}
      </p>
      <v-checkbox v-model="confirmation" :label="t('gap.confirmation')" :disabled="busy" />
      <form
        v-if="(currentEndpoint ?? endpoint).primaryMdmRegistration?.source === 'mdm.apple'"
        @submit.prevent="execute()"
      >
        <v-select
          v-model="action"
          :label="t('gap.action')"
          :items="appleCredentialActions.map((kind) => ({ value: kind, title: t('gap.' + kind) }))"
          :disabled="locked"
        />
        <v-row
          ><v-col cols="12" md="6"
            ><v-text-field
              v-model.number="revision"
              :label="t('gap.revision')"
              type="number"
              min="0"
              required
              :disabled="locked" /></v-col
          ><v-col cols="12" md="6"
            ><v-text-field
              v-model="recipient"
              :label="t('gap.recipient')"
              :disabled="locked" /></v-col
          ><v-col cols="12" md="6"
            ><v-text-field
              v-model="materialId"
              :label="t('gap.material')"
              :disabled="locked" /></v-col
          ><v-col cols="12" md="6"
            ><v-text-field
              v-model.number="materialVersion"
              :label="t('gap.version')"
              type="number"
              min="1"
              :disabled="locked" /></v-col
        ></v-row>
        <v-text-field
          v-if="action === 'reconcile_recovery_lock'"
          v-model="sourceOperation"
          :label="t('gap.operation')"
          required
          :disabled="locked"
        /><v-checkbox
          v-if="action === 'set_recovery_lock'"
          v-model="clearLock"
          :label="t('gap.clear')"
          :disabled="locked"
        /><v-text-field
          v-if="needsPassword"
          v-model="password"
          :label="t('gap.password')"
          type="password"
          autocomplete="off"
          :disabled="busy"
        /><v-btn type="submit" :disabled="locked || !confirmation">{{ t('gap.save') }}</v-btn>
      </form>
      <v-alert v-if="pending" type="warning" variant="tonal" class="my-4"
        >{{ t(pending.state === 'conflict' ? 'gap.compare' : 'gap.unknown') }}
        {{ pending.id }}</v-alert
      >
      <div class="d-flex flex-wrap ga-3 my-3">
        <v-btn v-if="pending?.state === 'conflict'" :disabled="busy" @click="compare">{{
          t('gap.compare')
        }}</v-btn
        ><v-btn
          v-if="pending?.state === 'unknown'"
          :disabled="busy || !confirmation"
          @click="restore"
          >{{ t('gap.replayOriginal') }}</v-btn
        ><v-btn v-if="resultId || nativePending" :disabled="busy" @click="query">{{
          t('gap.queryOriginal')
        }}</v-btn
        ><v-btn
          v-if="resultId"
          variant="text"
          :to="{
            name: 'policy-execution',
            params: { tenant: runtime.tenant, execution: resultId },
            query: { device: endpoint.id },
          }"
          >{{ t('gap.result') }}</v-btn
        ><v-btn
          variant="text"
          :to="{ name: 'policy-lifecycle', params: { tenant: runtime.tenant } }"
          >{{ t('gap.lifecycle') }}</v-btn
        >
      </div>
    </v-card-text></v-card
  >
</template>
