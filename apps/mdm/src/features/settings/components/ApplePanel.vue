<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction, useSettingsSecrets } from '../useSettingsAction'
import type { AppleDirectory, ApplePurpose } from '../clients/apple'
import { inputDigest } from '../clients/value'
import { downloadPublic } from '../download'
import OperationNotice from './OperationNotice.vue'
import MaterialVersions from './MaterialVersions.vue'
const props = defineProps<{ purpose: ApplePurpose }>()
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.settings.apple
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
  resolveConflict,
  compared,
  markCompared,
} = useSettingsAction(() => props.purpose)
const directory = ref<AppleDirectory>(),
  revision = ref(0),
  source = ref<'generate' | 'import'>('generate'),
  privateKey = ref(''),
  certificate = ref(''),
  keyRevision = ref(0),
  materialRevision = ref(0),
  accountAlias = ref('')
useSettingsSecrets(() => {
  privateKey.value = ''
  certificate.value = ''
})
async function load() {
  directory.value = undefined
  return run(
    () => client.read(props.purpose),
    (v) => {
      directory.value = v
      revision.value = v.revision
    },
  )
}
async function compare() {
  if (await load()) markCompared()
}
async function lookup() {
  if (pending.value)
    await query(
      pending.value.id,
      () => client.operation(pending.value!.id),
      () => {
        queueMicrotask(() => void load())
      },
    )
}
async function change(action: string, replay = false) {
  if (!canWrite.value) return
  const importedKey = privateKey.value,
    importedCertificate = certificate.value
  privateKey.value = ''
  certificate.value = ''
  const expectedRevision = replay ? pending.value!.expectedRevision : revision.value
  if (action === 'key') {
    const input = {
      expectedRevision,
      source:
        source.value === 'generate'
          ? { kind: 'generate' as const }
          : { kind: 'import' as const, private_key_pem: importedKey },
    }
    privateKey.value = ''
    await submit(
      action,
      expectedRevision,
      { source: input.source.kind },
      (id) => client.key(id, props.purpose, input),
      () => {
        queueMicrotask(() => void load())
      },
      replay,
    )
  } else if (action === 'certificate') {
    const input = {
      expectedRevision,
      keyRevision: keyRevision.value,
      certificateChainPem: importedCertificate,
    }
    certificate.value = ''
    await submit(
      action,
      expectedRevision,
      {
        keyRevision: input.keyRevision,
        certificateSha256: inputDigest(input.certificateChainPem),
      },
      (id) => client.certificate(id, props.purpose, input),
      () => {
        queueMicrotask(() => void load())
      },
      replay,
    )
  } else if (action === 'apply') {
    const input = {
      expectedRevision,
      materialRevision: materialRevision.value,
      accountAlias: props.purpose === 'managed_account' ? accountAlias.value : null,
    }
    await submit(
      action,
      expectedRevision,
      { materialRevision: input.materialRevision, accountAlias: input.accountAlias },
      (id) => client.apply(id, props.purpose, input),
      () => {
        queueMicrotask(() => void load())
      },
      replay,
    )
  } else {
    const input = { expectedRevision, materialRevision: materialRevision.value }
    await submit(
      'revoke',
      expectedRevision,
      { materialRevision: input.materialRevision },
      (id) => client.revoke(id, props.purpose, input),
      () => {
        queueMicrotask(() => void load())
      },
      replay,
    )
  }
}
onMounted(load)
useSettingsFacts(() => {
  directory.value = undefined
})
</script>
<template>
  <UiMessage tone="info" :title="t('settings.csrHint')">{{
    t('settings.secretCleared')
  }}</UiMessage>
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <UiButton :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</UiButton>
  <OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :compared="compared"
    @query="lookup"
    @retry="change(pending!.action, true)"
    @compare="compare"
    @edit="resolveConflict"
  />
  <MaterialVersions
    v-if="directory"
    :revision="directory.revision"
    :desired-revision="directory.desiredRevision"
    :versions="directory.versions"
  />
  <form class="settings-form" @submit.prevent="change('key')">
    <fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.generate') }}</legend>
      <label
        >{{ t('settings.source')
        }}<select v-model="source">
          <option value="generate">{{ t('settings.generated') }}</option>
          <option value="import">{{ t('settings.imported') }}</option>
        </select></label
      >
      <label v-if="source === 'import'"
        >{{ t('settings.privateKey')
        }}<textarea
          v-model="privateKey"
          autocomplete="off"
          spellcheck="false"
          required
          maxlength="262144"
        />
      </label>
      <UiButton type="submit" :disabled="locked">{{
        t(source === 'generate' ? 'settings.generate' : 'settings.import')
      }}</UiButton>
    </fieldset>
  </form>
  <form class="settings-form" @submit.prevent="change('certificate')">
    <fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.import') }}</legend>
      <label
        >{{ t('settings.keyRevision')
        }}<select v-model.number="keyRevision" required>
          <option :value="0" disabled>{{ t('settings.select') }}</option>
          <option
            v-for="v in directory?.versions.filter((v) => !v.revoked)"
            :key="v.revision"
            :value="v.revision"
          >
            {{ v.revision }} · {{ v.publicKeyDigest }}
          </option>
        </select></label
      >
      <label
        >{{ t('settings.certificate')
        }}<textarea v-model="certificate" required maxlength="262144" spellcheck="false" /></label
      ><UiButton type="submit" :disabled="locked">{{ t('settings.import') }}</UiButton>
    </fieldset>
  </form>
  <form class="settings-form" @submit.prevent="change('apply')">
    <fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.apply') }}</legend>
      <label
        >{{ t('settings.materialRevision')
        }}<select v-model.number="materialRevision" required>
          <option :value="0" disabled>{{ t('settings.select') }}</option>
          <option
            v-for="v in directory?.versions.filter((v) => !v.revoked)"
            :key="v.revision"
            :value="v.revision"
          >
            {{ v.revision }} · {{ v.certificateDigest ?? v.publicKeyDigest }}
          </option>
        </select></label
      >
      <label v-if="purpose === 'managed_account'"
        >{{ t('settings.accountAlias') }}<input v-model="accountAlias" required maxlength="128"
      /></label>
      <div class="settings-actions">
        <UiButton type="submit" :disabled="locked">{{ t('settings.apply') }}</UiButton
        ><UiButton :disabled="locked || !materialRevision" @click="change('revoke')">{{
          t('settings.revoke')
        }}</UiButton>
      </div>
    </fieldset>
  </form>
  <div v-for="v in directory?.versions" :key="v.revision" class="settings-actions">
    <code>{{ v.revision }} · {{ v.keyId }}</code
    ><UiButton @click="downloadPublic(purpose + '-' + v.revision + '.csr', v.csr)">{{
      t('settings.csr')
    }}</UiButton
    ><UiButton
      v-if="v.certificateChainPem"
      @click="downloadPublic(purpose + '-' + v.revision + '.pem', v.certificateChainPem)"
      >{{ t('settings.publicCertificate') }}</UiButton
    >
  </div>
</template>
