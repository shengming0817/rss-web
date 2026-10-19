<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsSecrets } from '../useSettingsAction'
import type { Tenant } from '../clients/platform'
import OperationNotice from './OperationNotice.vue'
const props = defineProps<{ tenant: Tenant }>()
const emit = defineEmits<{ changed: [] }>()
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.platform
const { canWrite: canUpdate } = usePermission('tenant_read', 'tenant_update'),
  { canWrite: canDelete } = usePermission('tenant_read', 'tenant_delete'),
  { canWrite: canAdd } = usePermission('tenant_read', 'tenant_administrator_create')
const {
  busy,
  failure,
  pending,
  locked,
  submit,
  query,
  resolveConflict,
  compared,
  markCompared,
  run,
} = useSettingsAction(() => 'tenant:' + props.tenant.tenantId)
const name = ref(props.tenant.name ?? ''),
  notes = ref(props.tenant.notes ?? ''),
  login = ref(''),
  password = ref(''),
  deleteConfirmed = ref(false)
useSettingsSecrets(() => (password.value = ''))
async function lookup() {
  const id = pending.value?.id
  if (id)
    await query(
      id,
      () => client.registryOperation(id),
      () => emit('changed'),
    )
}
async function compare() {
  if (
    await run(
      () => client.tenants(),
      (items) => {
        const current = items.find((v) => v.tenantId === props.tenant.tenantId)
        if (!current) throw new Error('Tenant removed')
        emit('changed')
      },
    )
  )
    markCompared()
}
async function change(action: string, replay = false) {
  const submittedPassword = password.value
  password.value = ''
  const revision = replay ? pending.value!.expectedRevision : props.tenant.revision,
    target = props.tenant.tenantId
  if (action === 'update' && canUpdate.value) {
    const input = { name: name.value || null, notes: notes.value || null }
    await submit(
      action,
      revision,
      input,
      (id) => client.update(target, id, revision, input),
      () => emit('changed'),
      replay,
    )
  } else if (action === 'administrator' && canAdd.value) {
    const input = { login: login.value, password: submittedPassword }
    password.value = ''
    await submit(
      action,
      revision,
      { tenant: target, login: input.login },
      (id) => client.administrator(target, id, input),
      () => emit('changed'),
      replay,
    )
  } else if (action === 'delete' && canDelete.value && deleteConfirmed.value)
    await submit(
      action,
      revision,
      { tenant: target },
      (id) => client.remove(target, id, revision),
      () => emit('changed'),
      replay,
    )
}
</script>
<template>
  <section v-if="!tenant.management" class="console-panel">
    <h2>{{ tenant.name ?? tenant.tenantId }}</h2>
    <p>
      <code>{{ tenant.tenantId }}</code> · {{ t('settings.revision') }} {{ tenant.revision }}
    </p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canUpdate || canDelete || canAdd"
      :compared="compared"
      @query="lookup"
      @retry="change(pending!.action, true)"
      @compare="compare"
      @edit="resolveConflict"
    />
    <form class="settings-form" @submit.prevent="change('update')">
      <fieldset :disabled="busy || !canUpdate">
        <legend>{{ t('settings.name') }}</legend>
        <label>{{ t('settings.name') }}<input v-model="name" maxlength="256" /></label
        ><label>{{ t('settings.notes') }}<textarea v-model="notes" maxlength="2048" /></label
        ><UiButton type="submit" :disabled="locked">{{ t('settings.save') }}</UiButton>
      </fieldset>
    </form>
    <form class="settings-form" @submit.prevent="change('administrator')">
      <fieldset :disabled="busy || !canAdd">
        <legend>{{ t('settings.addAdministrator') }}</legend>
        <label
          >{{ t('settings.login')
          }}<input v-model="login" autocomplete="off" required maxlength="256" /></label
        ><label
          >{{ t('settings.password')
          }}<input
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            maxlength="1024"
        /></label>
        <p>{{ t('settings.recentAuthentication') }}</p>
        <UiButton type="submit" :disabled="locked">{{ t('settings.addAdministrator') }}</UiButton>
      </fieldset>
    </form>
    <form v-if="tenant.deletable" class="settings-form" @submit.prevent="change('delete')">
      <fieldset :disabled="busy || !canDelete">
        <legend>{{ t('settings.deleteTenant') }}</legend>
        <label
          ><input v-model="deleteConfirmed" type="checkbox" required />{{
            t('settings.deleteConfirmation')
          }}</label
        ><UiButton type="submit" :disabled="locked">{{ t('settings.deleteTenant') }}</UiButton>
      </fieldset>
    </form>
  </section>
</template>
