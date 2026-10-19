<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
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
type Directory = {
  revision: number
  desiredRevision: number | null
  versions: {
    revision: number
    operationId: string
    state?: string
    selected?: boolean
    revoked?: boolean
    failureReason: string | null
    qualifiedAt?: number | null
    acceptedAt?: number | null
    expiresAt?: number | null
  }[]
}
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
  materialRevision = ref(0)
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
})
</script>
<template>
  <UiMessage
    tone="info"
    :title="t(kind === 'smtp' ? 'settings.mailHint' : 'settings.providerHint')"
    >{{ t('settings.secretCleared') }}</UiMessage
  >
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <UiButton :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</UiButton>
  <OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :compared="compared"
    @query="lookup"
    @retry="pending?.action === 'revoke' ? revoke(true) : save(true)"
    @compare="compare"
    @edit="resolveConflict"
  />
  <MaterialVersions
    v-if="directory"
    :revision="directory.revision"
    :desired-revision="directory.desiredRevision"
    :versions="directory.versions"
  />
  <form class="settings-form" @submit.prevent="save()">
    <fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.save') }}</legend>
      <label v-if="kind !== 'wns'"
        >{{ t('settings.profile') }}<input v-model="profile" required maxlength="128"
      /></label>
      <template v-if="kind === 'smtp'"
        ><label
          >{{ t('settings.sender')
          }}<input v-model="sender" type="email" required maxlength="320" /></label
        ><label
          >{{ t('settings.recipient')
          }}<input v-model="recipient" type="email" required maxlength="320" /></label
        ><label
          >{{ t('settings.username')
          }}<input v-model="username" autocomplete="off" required maxlength="256" /></label
        ><label
          >{{ t('settings.password')
          }}<input
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            maxlength="4096" /></label
      ></template>
      <template v-if="kind === 'wns'"
        ><label
          >{{ t('settings.packageFamilyName')
          }}<input v-model="packageFamilyName" required maxlength="255" /></label
        ><label
          >{{ t('settings.sid')
          }}<input v-model="sid" autocomplete="off" required maxlength="4096" /></label
        ><label
          >{{ t('settings.clientSecret')
          }}<input
            v-model="clientSecret"
            type="password"
            autocomplete="new-password"
            required
            maxlength="4096" /></label
      ></template>
      <template v-if="kind === 'storage'"
        ><label
          >{{ t('settings.source')
          }}<select v-model="source">
            <option value="import">{{ t('settings.imported') }}</option>
            <option value="generate">{{ t('settings.generated') }}</option>
          </select></label
        ><template v-if="source === 'import'"
          ><label
            >{{ t('settings.accessKey')
            }}<input v-model="accessKey" autocomplete="off" required maxlength="4096" /></label
          ><label
            >{{ t('settings.secretKey')
            }}<input
              v-model="secretKey"
              type="password"
              autocomplete="new-password"
              required
              maxlength="4096" /></label
          ><label
            >{{ t('settings.sessionToken')
            }}<input
              v-model="sessionToken"
              type="password"
              autocomplete="off"
              maxlength="8192" /></label
          ><label
            >{{ t('settings.expiresInput')
            }}<input v-model="expires" type="number" min="1" step="1" /></label></template
      ></template>
      <UiButton type="submit" :disabled="locked">{{ t('settings.save') }}</UiButton>
    </fieldset>
  </form>
  <form v-if="kind === 'wns'" class="settings-form" @submit.prevent="revoke()">
    <fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.revoke') }}</legend>
      <label
        >{{ t('settings.materialRevision')
        }}<select v-model.number="materialRevision" required>
          <option :value="0" disabled>{{ t('settings.select') }}</option>
          <option
            v-for="v in directory?.versions.filter((v) => !v.revoked)"
            :key="v.revision"
            :value="v.revision"
          >
            {{ v.revision }}
          </option>
        </select></label
      ><UiButton type="submit" :disabled="locked">{{ t('settings.revoke') }}</UiButton>
    </fieldset>
  </form>
</template>
