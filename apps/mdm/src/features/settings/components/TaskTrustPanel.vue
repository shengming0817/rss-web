<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import type { TaskTrust, TaskChange } from '../clients/trust'
import { origin as httpsOrigin } from '../clients/value'
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
  origin = ref(window.location.origin),
  keyId = ref('')
async function load() {
  trust.value = undefined
  return run(
    () => client.read(),
    (v) => {
      trust.value = v
      revision.value = v.revision
      origin.value = v.origin
    },
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
      (v) => (trust.value = v),
    )
}
async function change(action: TaskChange['action'], replay = false) {
  if (!canWrite.value) return
  try {
    httpsOrigin(origin.value)
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  const expectedRevision = replay ? pending.value!.expectedRevision : revision.value
  const input: TaskChange =
    action === 'prepare'
      ? { action, expectedRevision, origin: origin.value }
      : { action, expectedRevision, keyId: keyId.value }
  await submit(
    action,
    expectedRevision,
    action === 'prepare' ? { origin: origin.value } : { keyId: keyId.value },
    (id) => client.change(id, input),
    (v) => {
      trust.value = v
      revision.value = v.revision
    },
    replay,
  )
}
onMounted(load)
useSettingsFacts(() => {
  trust.value = undefined
})
</script>
<template>
  <UiMessage tone="info" :title="t('settings.trustHint')" />
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <UiButton :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</UiButton>
  <OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :compared="compared"
    @query="lookup"
    @retry="change(pending!.action as TaskChange['action'], true)"
    @compare="compare"
    @edit="resolveConflict"
  />
  <div v-if="trust" class="console-panel">
    <p>{{ t('settings.savedVersion') }} {{ trust.revision }}</p>
    <ul>
      <li v-for="key in trust.keys" :key="key.id">
        <code>{{ key.id }}</code> · {{ key.state }}
      </li>
    </ul>
    <UiButton @click="downloadPublic('task-trust.json', JSON.stringify(trust))">{{
      t('settings.publicTrustFile')
    }}</UiButton>
  </div>
  <form class="settings-form" @submit.prevent="change('prepare')">
    <fieldset :disabled="busy || !canWrite">
      <legend>{{ t('settings.generate') }}</legend>
      <label
        >{{ t('settings.revision')
        }}<input v-model.number="revision" type="number" min="0" step="1" required /></label
      ><label>{{ t('settings.origin') }}<input v-model="origin" type="url" required /></label
      ><UiButton type="submit" :disabled="locked">{{ t('settings.generate') }}</UiButton>
    </fieldset>
  </form>
  <form class="settings-form" @submit.prevent="change('activate')">
    <fieldset :disabled="busy || !canWrite || !trust">
      <legend>{{ t('settings.activate') }}</legend>
      <label
        >{{ t('settings.keyId')
        }}<select v-model="keyId" required>
          <option value="" disabled>{{ t('settings.select') }}</option>
          <option v-for="key in trust?.keys" :key="key.id" :value="key.id">
            {{ key.id }} · {{ key.state }}
          </option>
        </select></label
      >
      <div class="settings-actions">
        <UiButton type="submit" :disabled="locked">{{ t('settings.activate') }}</UiButton
        ><UiButton :disabled="locked || !keyId" @click="change('retire')">{{
          t('settings.retire')
        }}</UiButton>
      </div>
    </fieldset>
  </form>
  <ObservationPanel kind="task" />
</template>
