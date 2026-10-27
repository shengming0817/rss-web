<script setup lang="ts">
import '../settings.css'
import { VAlert, VBtn, VCard, VForm, VSelect, VTextField } from 'vuetify/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import type { TaskTrust, TaskChange } from '../clients/trust'
import { downloadPublic } from '../download'
import OperationNotice from './OperationNotice.vue'
import ObservationPanel from './ObservationPanel.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.task
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
} = useSettingsAction(() => 'task')
const trust = ref<TaskTrust>(),
  revision = ref(0),
  keyId = ref('')
function applyTrust(value: TaskTrust) {
  trust.value = value
  revision.value = value.revision
}
async function load() {
  trust.value = undefined
  return run(() => client.read(), applyTrust)
}
async function compare() {
  if (await load()) markCompared()
}
async function lookup() {
  const id = pending.value?.id
  if (id)
    await query(
      id,
      async () => {
        await client.operation(id)
        return client.read()
      },
      applyTrust,
    )
}
async function change(action: TaskChange['action'], replay = false) {
  if (!canWrite.value) return
  if (action !== 'prepare' && !replay && !trust.value?.keys.some((key) => key.id === keyId.value))
    return
  const expectedRevision = replay ? pending.value!.expectedRevision : revision.value
  const input: TaskChange =
    action === 'prepare'
      ? { action, expectedRevision }
      : { action, expectedRevision, keyId: keyId.value }
  await submit(
    action,
    expectedRevision,
    action === 'prepare' ? {} : { keyId: keyId.value },
    (id) => client.change(id, input),
    applyTrust,
    replay,
  )
}
onMounted(load)
useSettingsFacts(() => {
  trust.value = undefined
})
</script>
<template>
  <VAlert type="info" :title="t('settings.trustHint')" variant="tonal" />
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <VBtn :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</VBtn
  ><OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :compared="compared"
    @query="lookup"
    @retry="change(pending!.action as TaskChange['action'], true)"
    @compare="compare"
    @edit="resolveConflict"
  /><VCard v-if="trust" class="console-panel" tag="div" variant="outlined"
    ><p>{{ t('settings.savedVersion') }} {{ trust.revision }}</p>
    <p>
      {{ t('settings.connections.service') }} <code>{{ trust.service_id }}</code>
    </p>
    <VBtn
      :to="{ name: 'settings-deployment', params: { tenant: runtime.tenant } }"
      variant="text"
      >{{ t('settings.connections.title') }}</VBtn
    >
    <ul>
      <li v-for="key in trust.keys" :key="key.id">
        <code>{{ key.id }}</code> · {{ key.state }}
      </li>
    </ul>
    <VBtn @click="downloadPublic('task-trust.json', JSON.stringify(trust))">{{
      t('settings.publicTrustFile')
    }}</VBtn></VCard
  ><VForm :novalidate="false" class="settings-editor" @submit.prevent="change('prepare')"
    ><fieldset :disabled="busy || !canWrite">
      <legend>{{ t('settings.generate') }}</legend>
      <VTextField
        v-model.number="revision"
        type="number"
        min="0"
        step="1"
        required
        :label="t('settings.revision')"
        :disabled="busy || !canWrite"
      /><VBtn type="submit" :disabled="busy || !canWrite || locked">{{
        t('settings.generate')
      }}</VBtn>
    </fieldset></VForm
  ><VForm :novalidate="false" class="settings-editor" @submit.prevent="change('activate')"
    ><fieldset :disabled="busy || !canWrite || !trust">
      <legend>{{ t('settings.activate') }}</legend>
      <VSelect
        v-model="keyId"
        required
        :label="t('settings.keyId')"
        :disabled="busy || !canWrite || !trust"
        :items="[
          { title: t('settings.select'), value: '', props: { disabled: true } },
          ...(trust?.keys ?? []).map((key) => ({
            title: key.id + ' · ' + key.state,
            value: key.id,
            props: { disabled: false },
          })),
        ]"
      />
      <div class="settings-actions">
        <VBtn type="submit" :disabled="busy || !canWrite || !trust || locked || !keyId">{{
          t('settings.activate')
        }}</VBtn
        ><VBtn
          :disabled="busy || !canWrite || !trust || locked || !keyId"
          @click="change('retire')"
          >{{ t('settings.retire') }}</VBtn
        >
      </div>
    </fieldset></VForm
  ><ObservationPanel kind="task" />
</template>
