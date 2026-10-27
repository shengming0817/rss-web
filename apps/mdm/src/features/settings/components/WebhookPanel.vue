<script setup lang="ts">
import '../settings.css'
import { VAlert, VBtn, VCard, VForm, VSelect, VTextField } from 'vuetify/components'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction, useSettingsSecrets } from '../useSettingsAction'
import type { WebhookInput, WebhookTransition } from '../clients/webhook'
import OperationNotice from './OperationNotice.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.webhook
const { canRead, canWrite } = usePermission('webhook_read', 'webhook_write')
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
} = useSettingsAction(() => 'webhook')
const directory = ref<Awaited<ReturnType<typeof client.read>>>(),
  reference = ref(''),
  endpoint = ref(''),
  networkReference = ref(''),
  source = ref<'generate' | 'import'>('generate'),
  secret = ref(''),
  materialRevision = ref(0)
const head = computed(() => directory.value?.heads.find((v) => v.reference === reference.value)),
  revision = computed(() => head.value?.revision ?? 0)
useSettingsSecrets(() => (secret.value = ''))
async function load() {
  directory.value = undefined
  return run(
    () => client.read(),
    (v) => (directory.value = v),
  )
}
async function compare() {
  if (await load()) markCompared()
}
async function lookup() {
  const id = pending.value?.id
  if (id)
    await query(
      id,
      () => client.operation(id),
      () => {
        queueMicrotask(() => void load())
      },
    )
}
async function change(
  action: 'prepare' | 'activate' | 'revoke' | 'retire_previous',
  replay = false,
) {
  if (!canWrite.value || !directory.value) return
  const importedSecret = secret.value
  secret.value = ''
  const expectedRevision = replay ? pending.value!.expectedRevision : revision.value
  if (action === 'prepare') {
    try {
      const url = new URL(endpoint.value)
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        throw new Error('Invalid endpoint')
    } catch {
      failure.value = 'invalidRequest'
      return
    }
    const input: WebhookInput = {
      reference: reference.value,
      expectedRevision,
      configurationSha256: directory.value.configurationSha256,
      endpoint: endpoint.value,
      networkReference: networkReference.value,
      source:
        source.value === 'generate'
          ? { kind: 'generate' }
          : { kind: 'import', secret: importedSecret },
    }
    secret.value = ''
    await submit(
      action,
      expectedRevision,
      {
        reference: input.reference,
        configurationSha256: input.configurationSha256,
        endpoint: input.endpoint,
        networkReference: input.networkReference,
        source: input.source.kind,
      },
      (id) => client.prepare(id, input),
      () => {
        queueMicrotask(() => void load())
      },
      replay,
    )
  } else {
    const input: WebhookTransition = {
      reference: reference.value,
      expectedRevision,
      action:
        action === 'retire_previous'
          ? { kind: action }
          : { kind: action, materialRevision: materialRevision.value },
    }
    await submit(
      action,
      expectedRevision,
      {
        reference: input.reference,
        materialRevision: action === 'retire_previous' ? null : materialRevision.value,
      },
      (id) => client.transition(id, input),
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
  <VAlert type="info" :title="t('settings.webhookHint')" variant="tonal">{{
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
    @retry="change(pending!.action as 'prepare' | 'activate' | 'revoke' | 'retire_previous', true)"
    @compare="compare"
    @edit="resolveConflict"
  /><VTextField
    v-model="reference"
    required
    maxlength="128"
    :disabled="busy"
    class="settings-editor"
    :label="t('settings.reference')"
  />
  <p>
    {{ t('settings.savedVersion') }} {{ revision }} · {{ t('settings.requestedVersion') }}
    {{ head?.activeRevision ?? '—' }} · {{ t('settings.runtimeVersion') }}
    {{ t('settings.notObserved') }}
  </p>
  <VForm :novalidate="false" class="settings-editor" @submit.prevent="change('prepare')"
    ><fieldset :disabled="busy || !canWrite || !directory">
      <legend>{{ t('settings.generate') }}</legend>
      <VTextField
        v-model="endpoint"
        type="url"
        required
        :label="t('settings.endpoint')"
        :disabled="busy || !canWrite || !directory"
      /><VTextField
        v-model="networkReference"
        required
        maxlength="128"
        :label="t('settings.networkReference')"
        :disabled="busy || !canWrite || !directory"
      /><VSelect
        v-model="source"
        :label="t('settings.source')"
        :disabled="busy || !canWrite || !directory"
        :items="[
          { title: t('settings.generated'), value: 'generate', props: { disabled: false } },
          { title: t('settings.imported'), value: 'import', props: { disabled: false } },
        ]"
      /><VTextField
        v-if="source === 'import'"
        v-model="secret"
        type="password"
        autocomplete="new-password"
        required
        maxlength="4096"
        :label="t('settings.secretKey')"
        :disabled="busy || !canWrite || !directory"
      /><VBtn type="submit" :disabled="busy || !canWrite || !directory || locked || !reference">{{
        t('settings.generate')
      }}</VBtn>
    </fieldset></VForm
  ><VForm :novalidate="false" class="settings-editor" @submit.prevent="change('activate')"
    ><fieldset :disabled="busy || !canWrite || !head">
      <legend>{{ t('settings.activate') }}</legend>
      <VSelect
        v-model.number="materialRevision"
        required
        :label="t('settings.materialRevision')"
        :disabled="busy || !canWrite || !head"
        :items="[
          { title: t('settings.select'), value: 0, props: { disabled: true } },
          ...(
            directory?.materials.filter((v) => v.reference === reference && !v.revoked) ?? []
          ).map((v) => ({
            title:
              v.revision +
              ' · ' +
              (v.confirmed ? t('settings.status.qualified') : t('settings.status.pending')),
            value: v.revision,
            props: { disabled: false },
          })),
        ]"
      />
      <div class="settings-actions">
        <VBtn type="submit" :disabled="busy || !canWrite || !head || locked">{{
          t('settings.activate')
        }}</VBtn
        ><VBtn
          :disabled="busy || !canWrite || !head || locked || !materialRevision"
          @click="change('revoke')"
          >{{ t('settings.revoke') }}</VBtn
        ><VBtn :disabled="busy || !canWrite || !head" @click="change('retire_previous')">{{
          t('settings.retire')
        }}</VBtn>
      </div>
    </fieldset></VForm
  ><VCard
    v-for="v in directory?.materials"
    :key="v.operationId"
    class="console-panel"
    tag="article"
    variant="outlined"
    ><h2>{{ v.reference }} · {{ v.revision }}</h2>
    <p>
      {{ t('settings.operationId') }} <code>{{ v.operationId }}</code>
    </p>
    <p>
      {{ t('settings.fingerprint') }} <code>{{ v.keyDigest }}</code>
    </p>
    <p>
      {{ t(v.confirmed ? 'settings.status.qualified' : 'settings.status.pending') }} ·
      {{ v.revoked ? t('settings.revoke') : '' }} {{ v.failureReason ?? '' }}
    </p></VCard
  >
</template>
