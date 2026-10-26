<script setup lang="ts">
import '../settings.css'
import { VAlert, VBtn, VCard, VForm, VSelect, VTextField } from 'vuetify/components'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction, useSettingsSecrets } from '../useSettingsAction'
import type { StorageInput } from '../clients/providers'
import OperationNotice from './OperationNotice.vue'
import MaterialVersions from './MaterialVersions.vue'
const props = defineProps<{ kind: 'storage' | 'smtp' | 'wns' }>()
const runtime = useMdm(),
  { t } = useI18n()
const { canRead, canWrite } = usePermission(
  props.kind === 'storage' ? 'storage_configuration_read' : 'registration_configuration_read',
  props.kind === 'storage' ? 'storage_configuration_write' : 'registration_configuration_write',
)
const {
  run,
  busy,
  failure,
  pending,
  locked,
  submit,
  query,
  resolveConflict,
  compared,
  markCompared,
} = useSettingsAction(() => props.kind)
type Directory =
  | Awaited<ReturnType<typeof runtime.settings.storage.read>>
  | Awaited<ReturnType<typeof runtime.settings.mail.read>>
  | Awaited<ReturnType<typeof runtime.settings.wns.read>>
type Version = NonNullable<Directory['current']>
const directory = ref<Directory>(),
  profile = ref(''),
  sender = ref(''),
  recipient = ref(''),
  username = ref(''),
  password = ref(''),
  sid = ref(''),
  clientSecret = ref(''),
  packageFamilyName = ref(''),
  source = ref<'generate' | 'import'>('import'),
  accessKey = ref(''),
  secretKey = ref(''),
  sessionToken = ref(''),
  expires = ref(''),
  materialRevision = ref(0),
  history = ref<Version[]>([]),
  historyCursor = ref<string | null>(null)
const client = computed(() =>
  props.kind === 'storage'
    ? runtime.settings.storage
    : props.kind === 'smtp'
      ? runtime.settings.mail
      : runtime.settings.wns,
)
const currentVersions = computed(() => [
  ...new Map(
    [directory.value?.current, directory.value?.latest, directory.value?.applied].flatMap((v) =>
      v ? [[v.revision, v] as const] : [],
    ),
  ).values(),
])
const revocableVersions = computed(() =>
  [
    ...new Map([...history.value, ...currentVersions.value].map((v) => [v.revision, v])).values(),
  ].filter((v) => 'revoked' in v && !v.revoked),
)
async function loadHistory(cursor?: string) {
  await run<{ items: Version[]; nextCursor: string | null }>(
    () => client.value.history({ cursor }),
    (page) => {
      history.value = cursor ? [...history.value, ...page.items] : page.items
      historyCursor.value = page.nextCursor
    },
  )
}
function clear() {
  password.value = ''
  username.value = ''
  sid.value = ''
  clientSecret.value = ''
  accessKey.value = ''
  secretKey.value = ''
  sessionToken.value = ''
}
useSettingsSecrets(clear)
async function read(): Promise<Directory> {
  return props.kind === 'storage'
    ? runtime.settings.storage.read()
    : props.kind === 'smtp'
      ? runtime.settings.mail.read()
      : runtime.settings.wns.read()
}
async function load() {
  directory.value = undefined
  history.value = []
  historyCursor.value = null
  return run(read, (v) => (directory.value = v))
}
async function compare() {
  if (await load()) markCompared()
}
async function lookup() {
  const id = pending.value?.id
  if (!id) return
  await query(
    id,
    async () => {
      if (props.kind === 'storage') return runtime.settings.storage.operation(id)
      if (props.kind === 'smtp') return runtime.settings.mail.operation(id)
      return runtime.settings.wns.operation(id)
    },
    () => {
      queueMicrotask(() => void load())
    },
  )
}
async function save(replay = false) {
  if (!canWrite.value || !directory.value) return
  const expectedRevision = replay ? pending.value!.expectedRevision : directory.value.revision
  if (props.kind === 'storage') {
    const input: StorageInput = {
      expectedRevision,
      profile: profile.value,
      source:
        source.value === 'generate'
          ? { kind: 'generate' }
          : {
              kind: 'import',
              access_key: accessKey.value,
              secret_key: secretKey.value,
              session_token: sessionToken.value || null,
              expires_at: expires.value ? Number(expires.value) : null,
            },
    }
    clear()
    await submit(
      'save',
      expectedRevision,
      {
        profile: input.profile,
        source: input.source.kind,
        expiresAt: input.source.kind === 'import' ? input.source.expires_at : null,
      },
      (id) => runtime.settings.storage.save(id, input),
      () => {
        queueMicrotask(() => void load())
      },
      replay,
    )
  } else if (props.kind === 'smtp') {
    const input = {
      expectedRevision,
      profile: profile.value,
      sender: sender.value,
      recipient: recipient.value,
      username: username.value,
      password: password.value,
    }
    clear()
    await submit(
      'save',
      expectedRevision,
      { profile: input.profile, sender: input.sender, recipient: input.recipient },
      (id) => runtime.settings.mail.save(id, input),
      () => {
        queueMicrotask(() => void load())
      },
      replay,
    )
  } else {
    const input = {
      expectedRevision,
      packageFamilyName: packageFamilyName.value,
      sid: sid.value,
      clientSecret: clientSecret.value,
    }
    clear()
    await submit(
      'save',
      expectedRevision,
      { packageFamilyName: input.packageFamilyName },
      (id) => runtime.settings.wns.save(id, input),
      () => {
        queueMicrotask(() => void load())
      },
      replay,
    )
  }
}
async function revoke(replay = false) {
  clear()
  if (!canWrite.value || !directory.value) return
  const input = {
    expectedRevision: replay ? pending.value!.expectedRevision : directory.value.revision,
    materialRevision: materialRevision.value,
  }
  await submit(
    'revoke',
    input.expectedRevision,
    { materialRevision: input.materialRevision },
    (id) => runtime.settings.wns.revoke(id, input),
    () => {
      queueMicrotask(() => void load())
    },
    replay,
  )
}
onMounted(load)
useSettingsFacts(() => {
  directory.value = undefined
  history.value = []
  historyCursor.value = null
})
</script>
<template>
  <VAlert
    type="info"
    :title="t(kind === 'smtp' ? 'settings.mailHint' : 'settings.providerHint')"
    variant="tonal"
    >{{ t('settings.secretCleared') }}</VAlert
  >
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <VBtn :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</VBtn
  ><OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :compared="compared"
    @query="lookup"
    @retry="pending?.action === 'revoke' ? revoke(true) : save(true)"
    @compare="compare"
    @edit="resolveConflict"
  /><MaterialVersions
    v-if="directory"
    :revision="directory.revision"
    :desired-revision="directory.activeRevision"
    :versions="currentVersions"
  /><VCard v-if="directory" class="console-panel" tag="section" variant="outlined"
    ><p>{{ t('settings.historyCount', { count: directory.versionCount }) }}</p>
    <VBtn :disabled="busy" @click="loadHistory()">{{ t('settings.history') }}</VBtn
    ><MaterialVersions
      v-if="history.length"
      :revision="directory.revision"
      :desired-revision="directory.activeRevision"
      :versions="history"
    /><VBtn v-if="historyCursor" :disabled="busy" @click="loadHistory(historyCursor)">{{
      t('settings.next')
    }}</VBtn></VCard
  ><VForm class="settings-editor" @submit.prevent="save()"
    ><fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.save') }}</legend>
      <VTextField
        v-if="kind !== 'wns'"
        v-model="profile"
        required
        maxlength="128"
        :label="t('settings.profile')"
        :disabled="busy || !canWrite || !directory"
      /><template v-if="kind === 'smtp'"
        ><VTextField
          v-model="sender"
          type="email"
          required
          maxlength="320"
          :label="t('settings.sender')"
          :disabled="busy || !canWrite || !directory" /><VTextField
          v-model="recipient"
          type="email"
          required
          maxlength="320"
          :label="t('settings.recipient')"
          :disabled="busy || !canWrite || !directory" /><VTextField
          v-model="username"
          autocomplete="off"
          required
          maxlength="256"
          :label="t('settings.username')"
          :disabled="busy || !canWrite || !directory" /><VTextField
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          maxlength="4096"
          :label="t('settings.password')"
          :disabled="busy || !canWrite || !directory" /></template
      ><template v-if="kind === 'wns'"
        ><VTextField
          v-model="packageFamilyName"
          required
          maxlength="255"
          :label="t('settings.packageFamilyName')"
          :disabled="busy || !canWrite || !directory" /><VTextField
          v-model="sid"
          autocomplete="off"
          required
          maxlength="4096"
          :label="t('settings.sid')"
          :disabled="busy || !canWrite || !directory" /><VTextField
          v-model="clientSecret"
          type="password"
          autocomplete="new-password"
          required
          maxlength="4096"
          :label="t('settings.clientSecret')"
          :disabled="busy || !canWrite || !directory" /></template
      ><template v-if="kind === 'storage'"
        ><VSelect
          v-model="source"
          :label="t('settings.source')"
          :disabled="busy || !canWrite || !directory"
          :items="[
            { title: t('settings.imported'), value: 'import', props: { disabled: false } },
            { title: t('settings.generated'), value: 'generate', props: { disabled: false } },
          ]" /><template v-if="source === 'import'"
          ><VTextField
            v-model="accessKey"
            autocomplete="off"
            required
            maxlength="4096"
            :label="t('settings.accessKey')"
            :disabled="busy || !canWrite || !directory" /><VTextField
            v-model="secretKey"
            type="password"
            autocomplete="new-password"
            required
            maxlength="4096"
            :label="t('settings.secretKey')"
            :disabled="busy || !canWrite || !directory" /><VTextField
            v-model="sessionToken"
            type="password"
            autocomplete="off"
            maxlength="8192"
            :label="t('settings.sessionToken')"
            :disabled="busy || !canWrite || !directory" /><VTextField
            v-model="expires"
            type="number"
            min="1"
            step="1"
            :label="t('settings.expiresInput')"
            :disabled="busy || !canWrite || !directory" /></template></template
      ><VBtn type="submit" :disabled="busy || !canWrite || !directory || locked">{{
        t('settings.save')
      }}</VBtn>
    </fieldset></VForm
  ><VForm v-if="kind === 'wns'" class="settings-editor" @submit.prevent="revoke()"
    ><fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.revoke') }}</legend>
      <VSelect
        v-model.number="materialRevision"
        required
        :label="t('settings.materialRevision')"
        :disabled="busy || !canWrite || !directory"
        :items="[
          { title: t('settings.select'), value: 0, props: { disabled: true } },
          ...(revocableVersions ?? []).map((v) => ({
            title: v.revision,
            value: v.revision,
            props: { disabled: false },
          })),
        ]"
      /><VBtn type="submit" :disabled="busy || !canWrite || !directory || locked">{{
        t('settings.revoke')
      }}</VBtn>
    </fieldset></VForm
  >
</template>
