<script setup lang="ts">
import {
  VFileInput,
  VSelect,
  VBtn,
  VCard,
  VCardText,
  VCheckbox,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VTable,
  VTextField,
  VTextarea,
} from 'vuetify/components'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { usePermission } from '../usePermission'
import { useAttachment } from '../useAttachment'
import { setupPanes, type AdeCommand } from '../clients/apple'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import MdmPage from '../../../ui/MdmPage.vue'
const id = ref('')
const runtime = useMdm(),
  client = runtime.onboarding.apple,
  { t } = useI18n(),
  { canRead, canWrite } = usePermission(
    'registration_configuration_read',
    'registration_configuration_write',
  ),
  { run, runWrite, busy, uncertain, failure } = useOperation(['service_unavailable'], () => [
    runtime.session.state.value.session?.id,
    id.value,
  ])
const delivery = useAttachment(),
  { url, filename } = delivery
const organizations = ref<Awaited<ReturnType<typeof client.organizations>>['items']>([]),
  status = ref<Awaited<ReturnType<typeof client.ade>>>(),
  profiles = ref<Awaited<ReturnType<typeof client.profiles>>['items']>([]),
  devices = ref<Awaited<ReturnType<typeof client.devices>>['items']>([]),
  cursor = ref<string | null>(null),
  organizationCursor = ref<string | null>(null),
  profileCursor = ref<string | null>(null),
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
    !!(operation.value && ['pending', 'running', 'unknown'].includes(operation.value.state)),
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
      profiles.value = v.profiles.items
      profileCursor.value = v.profiles.nextCursor
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
function list(cursor?: string) {
  if (!canRead.value) return
  void run(
    () => client.organizations({ cursor }),
    (v) => {
      organizations.value = cursor ? [...organizations.value, ...v.items] : v.items
      organizationCursor.value = v.nextCursor
    },
  )
}
function next() {
  if (!cursor.value) return
  const after = cursor.value
  void run(
    () => client.devices(id.value, { cursor: after }),
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
function moreProfiles() {
  if (!profileCursor.value) return
  void run(
    () => client.profiles(id.value, { cursor: profileCursor.value! }),
    (page) => {
      profiles.value.push(...page.items)
      profileCursor.value = page.nextCursor
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
async function selectToken(value: File | File[] | null) {
  const file = Array.isArray(value) ? value[0] : value,
    own = delivery.stamp()
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
  profileCursor.value = null
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
  [() => canWrite.value, () => runtime.session.state.value.session?.id],
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
  <MdmPage :title="t('onboarding.appleAde')" :busy="busy" :failure="failure">
    <RegistrationStatus channel="macos_mdm" />
    <p>{{ t('onboarding.adeGuide') }}</p>
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <v-btn v-if="organizationCursor" :disabled="busy" @click="list(organizationCursor)">{{
        t('devices.next')
      }}</v-btn>
      <v-select
        v-model="id"
        :label="t('onboarding.organization')"
        :disabled="busy || uncertain"
        :items="[
          { value: '', title: t('devices.select') },
          ...organizations.map((o) => ({
            value: o.id,
            title: `${o.accountEnrollment?.domain || o.ade?.orgId || o.id} · ${o.id}`,
          })),
        ]"
      />
      <v-text-field
        v-if="canWrite"
        v-model="id"
        :disabled="busy || uncertain"
        :label="t('onboarding.organizationId')"
      />
      <v-btn type="button" :disabled="!!busy" @click="refresh">{{ t('devices.reload') }}</v-btn>
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
      <v-expansion-panels
        multiple
        v-if="canWrite && id"
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{ t('console.configure') }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <form @submit.prevent="configure">
              <fieldset :disabled="blocked">
                <legend>{{ t('onboarding.organizationConfiguration') }}</legend>
                <v-text-field
                  v-model="serverUuid"
                  required
                  :disabled="blocked"
                  :label="t('onboarding.serverUuid')"
                /><v-text-field
                  v-model="orgId"
                  required
                  maxlength="256"
                  :disabled="blocked"
                  :label="t('onboarding.appleOrganizationId')"
                /><v-checkbox
                  v-model="enabled"
                  :disabled="blocked"
                  :label="t('onboarding.enabled')"
                /><v-checkbox
                  v-model="rotateKey"
                  :disabled="blocked"
                  :label="t('onboarding.rotateKey')"
                /><v-btn type="submit" :disabled="blocked">{{ t('registration.save') }}</v-btn>
              </fieldset>
            </form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
      <template v-if="status"
        ><v-btn type="button" :disabled="!!busy" @click="publicKey">
          {{ t('onboarding.exportPublicKey') }}</v-btn
        ><v-btn variant="text" v-if="url" :href="url" :download="filename">{{
          t('onboarding.download')
        }}</v-btn></template
      >
      <v-expansion-panels
        multiple
        v-if="canWrite && status"
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{ t('onboarding.importToken') }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <form @submit.prevent="importToken">
              <fieldset :disabled="blocked">
                <legend>{{ t('onboarding.importToken') }}</legend>
                <v-file-input
                  :model-value="[]"
                  accept=".p7m"
                  @update:model-value="selectToken"
                  :disabled="blocked"
                  :label="t('onboarding.p7m')"
                /><v-btn type="submit" :disabled="blocked || !!!token">{{
                  t('onboarding.importToken')
                }}</v-btn>
              </fieldset>
            </form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
      <v-card variant="outlined" v-if="canWrite && status" class="console-panel"
        ><v-card-text>
          <h2>{{ t('onboarding.sync') }}</h2>
          <form @submit.prevent="submit({ kind: 'sync', full: fullSync })">
            <fieldset :disabled="blocked">
              <v-checkbox
                v-model="fullSync"
                :disabled="blocked"
                :label="t('onboarding.fullSync')"
              /><v-btn type="submit" :disabled="blocked">{{ t('onboarding.sync') }}</v-btn>
            </fieldset>
          </form>
        </v-card-text></v-card
      >
      <v-expansion-panels
        multiple
        v-if="canWrite && status"
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{ t('onboarding.setupProfile') }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <form @submit.prevent="saveProfile">
              <fieldset :disabled="blocked">
                <legend>{{ t('onboarding.setupProfile') }}</legend>
                <v-text-field
                  v-model="profileId"
                  :disabled="blocked"
                  :label="t('onboarding.profileId')"
                /><v-text-field
                  v-model="profileName"
                  required
                  maxlength="128"
                  :disabled="blocked"
                  :label="t('devices.name')"
                /><v-checkbox
                  v-model="mandatory"
                  :disabled="blocked"
                  :label="t('onboarding.mandatory')"
                /><v-checkbox
                  v-model="removable"
                  :disabled="blocked"
                  :label="t('onboarding.removable')"
                />
                <fieldset>
                  <legend>{{ t('onboarding.skipSetup') }}</legend>
                  <v-checkbox
                    v-for="pane in setupPanes"
                    :key="pane"
                    v-model="skip"
                    :value="pane"
                    :disabled="blocked"
                    :label="pane"
                  />
                </fieldset>
                <v-btn type="submit" :disabled="blocked || !!(!mandatory && !removable)">{{
                  t('registration.save')
                }}</v-btn>
              </fieldset>
            </form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
      <ul>
        <li v-for="p in profiles" :key="p.id">
          <v-btn type="button" :disabled="!!blocked" @click="chooseProfile(p)">
            {{ p.configuration.name }} · {{ p.id }} · {{ p.revision }} ·
            {{ p.remoteUuid ?? t('devices.unknown') }}
          </v-btn>
        </li>
      </ul>
      <v-table>
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
            <td>
              {{ d.deleted ? t('devices.deleted') : t('onboarding.registrationNotImplied') }}
            </td>
            <td>{{ d.observedAt }}</td>
          </tr>
        </tbody>
      </v-table>
      <v-btn v-if="profileCursor" :disabled="busy" @click="moreProfiles">{{
        t('devices.next')
      }}</v-btn>
      <v-btn v-if="cursor" type="button" :disabled="!!busy" @click="next">
        {{ t('devices.next') }}
      </v-btn>
      <v-expansion-panels
        multiple
        v-if="canWrite && status"
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{ t('console.targets') }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <form @submit.prevent="assignment(false)">
              <fieldset :disabled="blocked">
                <v-textarea
                  v-model="serials"
                  required
                  :disabled="blocked"
                  :label="t('onboarding.serials')"
                /><v-btn type="submit" :disabled="blocked">{{
                  t('onboarding.assignProfile')
                }}</v-btn
                ><v-btn type="button" @click="assignment(true)" :disabled="blocked">
                  {{ t('onboarding.clearAssignment') }}
                </v-btn>
              </fieldset>
            </form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
      <v-card variant="outlined" class="console-panel"
        ><v-card-text>
          <h2>{{ t('console.enrollmentProgress') }}</h2>
          <form @submit.prevent="readOperation">
            <v-text-field
              v-model="operationId"
              required
              :disabled="busy || uncertain"
              :label="t('devices.operation')"
            /><v-btn :disabled="!!busy" type="submit">{{ t('onboarding.readOutcome') }}</v-btn>
          </form>
        </v-card-text></v-card
      >
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
          <v-text-field
            v-model="recoveryId"
            :disabled="busy"
            :label="t('onboarding.originalOperation')"
          /><v-btn
            v-if="['assign', 'clear'].includes(operation.kind)"
            type="submit"
            :disabled="busy"
          >
            {{ t('onboarding.reconcile') }}</v-btn
          ><v-text-field
            v-if="operation.kind === 'profile'"
            v-model="remoteProfile"
            required
            :disabled="busy"
            :label="t('onboarding.remoteProfile')"
          /><v-btn
            v-if="operation.kind === 'profile'"
            type="button"
            @click="
              submit(
                { kind: 'resolve', operation: recoveryId || operation!.operationId, remoteProfile },
                true,
              )
            "
            :disabled="busy"
          >
            {{ t('onboarding.resolve') }}
          </v-btn>
        </fieldset>
      </form>
    </template>
  </MdmPage>
</template>
