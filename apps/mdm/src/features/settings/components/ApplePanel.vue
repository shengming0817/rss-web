<script setup lang="ts">
import '../settings.css'
import { VAlert, VBtn, VCard, VForm, VSelect, VTextField, VTextarea } from 'vuetify/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
  <VCard v-if="purpose === 'apns'" class="console-panel" tag="section" variant="outlined"
    ><h2>{{ t('settings.apnsJourney') }}</h2>
    <ol>
      <li>{{ t('settings.apnsCsrStep') }}</li>
      <li>{{ t('settings.apnsVendorStep') }}</li>
      <li>
        <a href="https://identity.apple.com/pushcert/" target="_blank" rel="noopener noreferrer">{{
          t('settings.apnsPortalStep')
        }}</a>
      </li>
      <li>{{ t('settings.apnsImportStep') }}</li>
      <li>{{ t('settings.apnsApplyStep') }}</li>
    </ol></VCard
  ><VAlert type="info" :title="t('settings.csrHint')" variant="tonal">{{
    t('settings.secretCleared')
  }}</VAlert>
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <VBtn :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</VBtn
  ><OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :compared="compared"
    @query="lookup"
    @retry="change(pending!.action, true)"
    @compare="compare"
    @edit="resolveConflict"
  /><MaterialVersions
    v-if="directory"
    :revision="directory.revision"
    :desired-revision="directory.desiredRevision"
    :versions="directory.versions"
  /><VForm class="settings-editor" @submit.prevent="change('key')"
    ><fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.generate') }}</legend>
      <VSelect
        v-model="source"
        :label="t('settings.source')"
        :disabled="busy || !canWrite || !directory"
        :items="[
          { title: t('settings.generated'), value: 'generate', props: { disabled: false } },
          { title: t('settings.imported'), value: 'import', props: { disabled: false } },
        ]"
      /><VTextarea
        v-if="source === 'import'"
        v-model="privateKey"
        autocomplete="off"
        spellcheck="false"
        required
        maxlength="262144"
        :label="t('settings.privateKey')"
        :disabled="busy || !canWrite || !directory"
      /><VBtn type="submit" :disabled="busy || !canWrite || !directory || locked">{{
        t(source === 'generate' ? 'settings.generate' : 'settings.import')
      }}</VBtn>
    </fieldset></VForm
  ><VForm class="settings-editor" @submit.prevent="change('certificate')"
    ><fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.import') }}</legend>
      <VSelect
        v-model.number="keyRevision"
        required
        :label="t('settings.keyRevision')"
        :disabled="busy || !canWrite || !directory"
        :items="[
          { title: t('settings.select'), value: 0, props: { disabled: true } },
          ...(directory?.versions.filter((v) => !v.revoked) ?? []).map((v) => ({
            title: v.revision + ' · ' + v.publicKeyDigest,
            value: v.revision,
            props: { disabled: false },
          })),
        ]"
      /><VTextarea
        v-model="certificate"
        required
        maxlength="262144"
        spellcheck="false"
        :label="t('settings.certificate')"
        :disabled="busy || !canWrite || !directory"
      /><VBtn type="submit" :disabled="busy || !canWrite || !directory || locked">{{
        t('settings.import')
      }}</VBtn>
    </fieldset></VForm
  ><VForm class="settings-editor" @submit.prevent="change('apply')"
    ><fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.apply') }}</legend>
      <VSelect
        v-model.number="materialRevision"
        required
        :label="t('settings.materialRevision')"
        :disabled="busy || !canWrite || !directory"
        :items="[
          { title: t('settings.select'), value: 0, props: { disabled: true } },
          ...(directory?.versions.filter((v) => !v.revoked) ?? []).map((v) => ({
            title: v.revision + ' · ' + (v.certificateDigest ?? v.publicKeyDigest),
            value: v.revision,
            props: { disabled: false },
          })),
        ]"
      /><VTextField
        v-if="purpose === 'managed_account'"
        v-model="accountAlias"
        required
        maxlength="128"
        :label="t('settings.accountAlias')"
        :disabled="busy || !canWrite || !directory"
      />
      <div class="settings-actions">
        <VBtn type="submit" :disabled="busy || !canWrite || !directory || locked">{{
          t('settings.apply')
        }}</VBtn
        ><VBtn
          :disabled="busy || !canWrite || !directory || locked || !materialRevision"
          @click="change('revoke')"
          >{{ t('settings.revoke') }}</VBtn
        >
      </div>
    </fieldset></VForm
  >
  <div v-for="v in directory?.versions" :key="v.revision" class="settings-actions">
    <code>{{ v.revision }} · {{ v.keyId }}</code
    ><VBtn @click="downloadPublic(purpose + '-' + v.revision + '.csr', v.csr)">{{
      t('settings.csr')
    }}</VBtn
    ><VBtn
      v-if="v.certificateChainPem"
      @click="downloadPublic(purpose + '-' + v.revision + '.pem', v.certificateChainPem)"
      >{{ t('settings.publicCertificate') }}</VBtn
    >
  </div>
</template>
