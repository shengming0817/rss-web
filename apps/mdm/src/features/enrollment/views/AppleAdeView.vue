<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { usePermission } from '../usePermission'
import { useAttachment } from '../useAttachment'
import { setupPanes, type AdeCommand } from '../clients/apple'
import OperationsFrame from '../../operations/components/OperationsFrame.vue'
const id = ref('')
const runtime = useMdm(),
  client = runtime.onboarding.apple,
  { t } = useI18n(),
  { canRead, canWrite } = usePermission('authorization_read', 'authorization_write'),
  { run, runWrite, busy, uncertain, failure } = useOperation(['service_unavailable'], () => [
    runtime.session.state.value.session?.id,
    id.value,
  ])
const delivery = useAttachment(),
  { url, filename } = delivery
const organizations = ref<Awaited<ReturnType<typeof client.organizations>>>([]),
  status = ref<Awaited<ReturnType<typeof client.ade>>>(),
  profiles = ref<Awaited<ReturnType<typeof client.profiles>>>([]),
  devices = ref<Awaited<ReturnType<typeof client.devices>>['items']>([]),
  cursor = ref<string | null>(null),
  operationId = ref(''),
  operation = ref<Awaited<ReturnType<typeof client.operation>>>()
const serverUuid = ref(''),
  orgId = ref(''),
  enabled = ref(false),
  rotateKey = ref(false),
  token = ref(''),
  fullSync = ref(false),
  profileId = ref(''),
  profileName = ref(''),
  mandatory = ref(true),
  removable = ref(false),
  skip = ref<(typeof setupPanes)[number][]>([]),
  serials = ref(''),
  recoveryId = ref(''),
  remoteProfile = ref('')
const seenCursors = new Set<string>()
const blocked = computed(
  () =>
    busy.value ||
    uncertain.value ||
    (operation.value && ['pending', 'running', 'unknown'].includes(operation.value.state)),
)
function refresh() {
  if (!canRead.value || !id.value) return
  void run(
    async () => ({
      status: await client.ade(id.value),
      profiles: await client.profiles(id.value),
      devices: await client.devices(id.value),
    }),
    (v) => {
      status.value = v.status
      profiles.value = v.profiles
      devices.value = v.devices.items
      cursor.value = v.devices.nextCursor
      seenCursors.clear()
      if (cursor.value) seenCursors.add(cursor.value)
      serverUuid.value = v.status.serverUuid
      orgId.value = v.status.orgId
      enabled.value = v.status.enabled
    },
  )
}
function list() {
  if (!canRead.value) return
  void run(
    () => client.organizations(),
    (v) => {
      organizations.value = v
    },
  )
}
function next() {
  if (!cursor.value) return
  const after = cursor.value
  void run(
    () => client.devices(id.value, after),
    (v) => {
      if (
        (v.nextCursor && seenCursors.has(v.nextCursor)) ||
        v.items.some((d) => devices.value.some((old) => old.serial === d.serial))
      ) {
        failure.value = 'invalidResponse'
        return
      }
      devices.value.push(...v.items)
      cursor.value = v.nextCursor
      if (cursor.value) seenCursors.add(cursor.value)
    },
  )
}
function readOperation() {
  if (!canRead.value || !id.value || !operationId.value) return
  void run(
    () => client.operation(id.value, operationId.value),
    (v) => {
      operation.value = v
      uncertain.value = false
    },
  )
}
function configure() {
  if (!canWrite.value || blocked.value) return
  operationId.value = crypto.randomUUID()
  operation.value = undefined
  void runWrite(() =>
    client.configure(id.value, operationId.value, {
      expectedRevision: status.value?.revision ?? 0,
      enabled: enabled.value,
      serverUuid: serverUuid.value,
      orgId: orgId.value,
      rotateKey: rotateKey.value,
    }),
  ).then((ok) => {
    if (ok) {
      readOperation()
    }
  })
}
function submit(command: AdeCommand, recovery = false) {
  if (!canWrite.value || busy.value || (!recovery && blocked.value)) return
  operationId.value = crypto.randomUUID()
  operation.value = undefined
  void runWrite(() => client.command(id.value, operationId.value, command)).then((ok) => {
    if (ok) readOperation()
  })
}
function importToken() {
  const p7m = token.value
  token.value = ''
  if (p7m && status.value) submit({ kind: 'token', expectedRevision: status.value.revision, p7m })
}
async function selectToken(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0],
    own = delivery.stamp()
  input.value = ''
  token.value = ''
  if (!file || !file.size || file.size > 180 * 1024) {
    failure.value = 'invalidRequest'
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    if (own !== delivery.stamp()) return
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    token.value = btoa(binary)
  } finally {
    bytes.fill(0)
  }
}
function chooseProfile(profile: (typeof profiles.value)[number]) {
  profileId.value = profile.id
  profileName.value = profile.configuration.name
  mandatory.value = profile.configuration.mandatory
  removable.value = profile.configuration.removable
  skip.value = [...profile.configuration.skip]
}
function saveProfile() {
  const old = profiles.value.find((p) => p.id === profileId.value)
  submit({
    kind: 'profile',
    id: profileId.value || crypto.randomUUID(),
    expectedRevision: old?.revision ?? 0,
    configuration: {
      name: profileName.value,
      mandatory: mandatory.value,
      removable: removable.value,
      skip: [...skip.value],
    },
  })
}
function assignment(clear: boolean) {
  const selection = serials.value
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean),
    profile = profiles.value.find((p) => p.id === profileId.value)
  if (clear) submit({ kind: 'clear', devices: selection })
  else if (profile)
    submit({ kind: 'assign', profile: profile.id, revision: profile.revision, devices: selection })
}
async function publicKey() {
  delivery.clear()
  const own = delivery.stamp()
  let file: Awaited<ReturnType<typeof client.publicKey>> | undefined
  try {
    await run(
      async () => {
        file = await client.publicKey(id.value)
        return file
      },
      (file) => delivery.deliver(file, 'RSS-ADE-public.pem', own),
    )
  } finally {
    if (file) new Uint8Array(file.bytes).fill(0)
  }
}
watch(id, () => {
  status.value = undefined
  profiles.value = []
  devices.value = []
  cursor.value = null
  operation.value = undefined
  operationId.value = ''
  token.value = ''
  delivery.clear()
  if (id.value) refresh()
})
watch(
  canRead,
  (allowed) => {
    organizations.value = []
    token.value = ''
    delivery.clear()
    if (allowed) list()
  },
  { immediate: true },
)
watch(
  () => [canWrite.value, runtime.session.state.value.session?.id],
  () => {
    token.value = ''
    delivery.clear()
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  token.value = ''
})
</script>
<template>
  <OperationsFrame :title="t('onboarding.appleAde')" :busy="busy" :failure="failure">
    <p>{{ t('onboarding.adeGuide') }}</p>
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <label
        >{{ t('onboarding.organization')
        }}<select v-model="id" :disabled="busy || uncertain">
          <option value="">{{ t('devices.select') }}</option>
          <option v-for="o in organizations" :key="o.id" :value="o.id">{{ o.id }}</option>
        </select></label
      >
      <label v-if="canWrite"
        >{{ t('onboarding.organizationId') }}<input v-model="id" :disabled="busy || uncertain"
      /></label>
      <button type="button" :disabled="busy" @click="refresh">{{ t('devices.reload') }}</button>
      <dl v-if="status">
        <dt>{{ t('devices.revision') }}</dt>
        <dd>{{ status.revision }}</dd>
        <dt>{{ t('onboarding.tokenState') }}</dt>
        <dd>{{ t(`onboarding.token_${status.tokenState}`) }}</dd>
        <dt>{{ t('devices.expires') }}</dt>
        <dd>{{ status.tokenExpiresAt ?? t('devices.unknown') }}</dd>
        <dt>{{ t('onboarding.lastSync') }}</dt>
        <dd>{{ status.syncedAt ?? t('devices.unknown') }}</dd>
        <dt>{{ t('onboarding.externalVerification') }}</dt>
        <dd>{{ t('onboarding.notObserved') }}</dd>
      </dl>
      <form v-if="canWrite && id" @submit.prevent="configure">
        <fieldset :disabled="blocked">
          <legend>{{ t('onboarding.organizationConfiguration') }}</legend>
          <label>{{ t('onboarding.serverUuid') }}<input v-model="serverUuid" required /></label
          ><label
            >{{ t('onboarding.appleOrganizationId')
            }}<input v-model="orgId" required maxlength="256" /></label
          ><label><input v-model="enabled" type="checkbox" />{{ t('onboarding.enabled') }}</label
          ><label
            ><input v-model="rotateKey" type="checkbox" />{{ t('onboarding.rotateKey') }}</label
          ><button>{{ t('registration.save') }}</button>
        </fieldset>
      </form>
      <template v-if="status"
        ><button type="button" :disabled="busy" @click="publicKey">
          {{ t('onboarding.exportPublicKey') }}</button
        ><a v-if="url" :href="url" :download="filename">{{ t('onboarding.download') }}</a></template
      >
      <form v-if="canWrite && status" @submit.prevent="importToken">
        <fieldset :disabled="blocked">
          <legend>{{ t('onboarding.importToken') }}</legend>
          <label
            >{{ t('onboarding.p7m')
            }}<input type="file" accept=".p7m" @change="selectToken" /></label
          ><button :disabled="!token">{{ t('onboarding.importToken') }}</button>
        </fieldset>
      </form>
      <form v-if="canWrite && status" @submit.prevent="submit({ kind: 'sync', full: fullSync })">
        <fieldset :disabled="blocked">
          <label><input v-model="fullSync" type="checkbox" />{{ t('onboarding.fullSync') }}</label
          ><button>{{ t('onboarding.sync') }}</button>
        </fieldset>
      </form>
      <form v-if="canWrite && status" @submit.prevent="saveProfile">
        <fieldset :disabled="blocked">
          <legend>{{ t('onboarding.setupProfile') }}</legend>
          <label>{{ t('onboarding.profileId') }}<input v-model="profileId" /></label
          ><label
            >{{ t('devices.name') }}<input v-model="profileName" required maxlength="128" /></label
          ><label
            ><input v-model="mandatory" type="checkbox" />{{ t('onboarding.mandatory') }}</label
          ><label
            ><input v-model="removable" type="checkbox" />{{ t('onboarding.removable') }}</label
          >
          <fieldset>
            <legend>{{ t('onboarding.skipSetup') }}</legend>
            <label v-for="pane in setupPanes" :key="pane"
              ><input v-model="skip" type="checkbox" :value="pane" />{{ pane }}</label
            >
          </fieldset>
          <button :disabled="!mandatory && !removable">{{ t('registration.save') }}</button>
        </fieldset>
      </form>
      <ul>
        <li v-for="p in profiles" :key="p.id">
          <button type="button" :disabled="blocked" @click="chooseProfile(p)">
            {{ p.configuration.name }} · {{ p.id }} · {{ p.revision }} ·
            {{ p.remoteUuid ?? t('devices.unknown') }}
          </button>
        </li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>{{ t('onboarding.serial') }}</th>
            <th>{{ t('onboarding.remoteProfile') }}</th>
            <th>{{ t('devices.status') }}</th>
            <th>{{ t('devices.observed') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in devices" :key="d.serial">
            <td>{{ d.serial }}</td>
            <td>{{ d.profileUuid ?? '—' }}</td>
            <td>{{ d.deleted ? t('devices.deleted') : t('onboarding.registrationNotImplied') }}</td>
            <td>{{ d.observedAt }}</td>
          </tr>
        </tbody>
      </table>
      <button v-if="cursor" type="button" :disabled="busy" @click="next">
        {{ t('devices.next') }}
      </button>
      <form v-if="canWrite && status" @submit.prevent="assignment(false)">
        <fieldset :disabled="blocked">
          <label>{{ t('onboarding.serials') }}<textarea v-model="serials" required /></label
          ><button>{{ t('onboarding.assignProfile') }}</button
          ><button type="button" @click="assignment(true)">
            {{ t('onboarding.clearAssignment') }}
          </button>
        </fieldset>
      </form>
      <form @submit.prevent="readOperation">
        <label
          >{{ t('devices.operation')
          }}<input v-model="operationId" required :disabled="busy || uncertain" /></label
        ><button :disabled="busy">{{ t('onboarding.readOutcome') }}</button>
      </form>
      <p v-if="operation">{{ operation.kind }} · {{ t(`onboarding.ade_${operation.state}`) }}</p>
      <pre v-if="operation?.result">{{ JSON.stringify(operation.result, null, 2) }}</pre>
      <p>{{ t('onboarding.registrationNotImplied') }}</p>
      <form
        v-if="canWrite && operation?.state === 'unknown'"
        @submit.prevent="
          submit({ kind: 'reconcile', operation: recoveryId || operation!.operationId }, true)
        "
      >
        <fieldset :disabled="busy">
          <label>{{ t('onboarding.originalOperation') }}<input v-model="recoveryId" /></label
          ><button v-if="['assign', 'clear'].includes(operation.kind)">
            {{ t('onboarding.reconcile') }}</button
          ><label v-if="operation.kind === 'profile'"
            >{{ t('onboarding.remoteProfile') }}<input v-model="remoteProfile" required /></label
          ><button
            v-if="operation.kind === 'profile'"
            type="button"
            @click="
              submit(
                { kind: 'resolve', operation: recoveryId || operation!.operationId, remoteProfile },
                true,
              )
            "
          >
            {{ t('onboarding.resolve') }}
          </button>
        </fieldset>
      </form>
    </template>
  </OperationsFrame>
</template>
