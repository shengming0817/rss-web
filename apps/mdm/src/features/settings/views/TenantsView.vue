<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction, useSettingsSecrets } from '../useSettingsAction'
import type { Tenant, Provisioning } from '../clients/platform'
import PageFrame from '../../../components/PageFrame.vue'
import TenantEditor from '../components/TenantEditor.vue'
import OperationNotice from '../components/OperationNotice.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.platform
const { canRead, canWrite } = usePermission('tenant_read', 'tenant_create')
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
} = useSettingsAction(() => 'provision')
const tenants = ref<Tenant[]>([]),
  provisionings = ref<Provisioning[]>([]),
  nextAfter = ref<string | null>(null),
  name = ref(''),
  login = ref(''),
  password = ref(''),
  showPassword = ref(false),
  original = ref('')
useSettingsSecrets(() => {
  password.value = ''
  showPassword.value = false
})
function generate() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  password.value = btoa(String.fromCharCode(...bytes)) + 'Aa9!'
  showPassword.value = true
}
async function load() {
  if (runtime.realm !== 'platform') return false
  return run(
    async () => ({ tenants: await client.tenants(), page: await client.provisionings() }),
    (v) => {
      tenants.value = v.tenants
      provisionings.value = v.page.items.map((v) => v.result)
      nextAfter.value = v.page.nextAfter
    },
  )
}
async function more() {
  if (!nextAfter.value) return
  await run(
    () => client.provisionings(nextAfter.value!),
    (v) => {
      provisionings.value.push(...v.items.map((v) => v.result))
      nextAfter.value = v.nextAfter
    },
  )
}
async function lookup(id = pending.value?.id ?? original.value) {
  if (!id) return
  await query(
    id,
    () => client.operation(id),
    (v) => {
      provisionings.value = [v.result, ...provisionings.value.filter((p) => p.operationId !== id)]
    },
  )
}
async function create(replay = false) {
  if (!canWrite.value || runtime.realm !== 'platform') return
  const input = {
    name: name.value,
    administratorLogin: login.value,
    administratorPassword: password.value,
  }
  password.value = ''
  showPassword.value = false
  await submit(
    'provision',
    0,
    { name: input.name, administratorLogin: input.administratorLogin },
    (id) => client.provision(id, input),
    (v) => {
      original.value = v.operationId
      provisionings.value = [
        v.result,
        ...provisionings.value.filter((p) => p.operationId !== v.operationId),
      ]
      queueMicrotask(() => void load())
    },
    replay,
  )
}
async function compare() {
  if (await load()) markCompared()
}
onMounted(load)
useSettingsFacts(() => {
  tenants.value = []
  provisionings.value = []
  nextAfter.value = null
})
</script>
<template>
  <PageFrame :title="t('settings.tenants')" :busy="busy" :failure="failure"
    ><template v-if="runtime.realm === 'platform'">
      <UiMessage tone="info" :title="t('settings.scopeHint')">{{
        t('settings.capacityHint')
      }}</UiMessage
      ><UiButton :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</UiButton>
      <OperationNotice
        :operation="pending"
        :busy="busy"
        :can-write="canWrite"
        :compared="compared"
        @query="lookup()"
        @retry="create(true)"
        @compare="compare"
        @edit="resolveConflict"
      />
      <form class="settings-form" @submit.prevent="create()">
        <fieldset :disabled="busy || !canWrite">
          <legend>{{ t('settings.createTenant') }}</legend>
          <p>{{ t('settings.createHint') }}</p>
          <label>{{ t('settings.name') }}<input v-model="name" required maxlength="256" /></label
          ><label
            >{{ t('settings.administratorLogin')
            }}<input v-model="login" autocomplete="off" required maxlength="256" /></label
          ><label
            >{{ t('settings.administratorPassword')
            }}<input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              required
              maxlength="1024"
          /></label>
          <div class="settings-actions">
            <UiButton @click="generate">{{ t('settings.generatePassword') }}</UiButton
            ><label
              ><input v-model="showPassword" type="checkbox" />{{
                t('settings.showPassword')
              }}</label
            >
          </div>
          <UiButton type="submit" :disabled="locked">{{ t('settings.createTenant') }}</UiButton>
        </fieldset>
      </form>
      <form class="settings-form" @submit.prevent="lookup(original)">
        <label
          >{{ t('settings.queryId') }}<input v-model="original" required maxlength="36" /></label
        ><UiButton type="submit" :disabled="busy || !canRead">{{
          t('settings.queryOperation')
        }}</UiButton>
      </form>
      <article v-for="p in provisionings" :key="p.operationId" class="console-panel">
        <h2>{{ p.tenantId }}</h2>
        <dl class="settings-facts">
          <dt>{{ t('settings.operationId') }}</dt>
          <dd>
            <code>{{ p.operationId }}</code>
          </dd>
          <dt>{{ t('settings.phase') }}</dt>
          <dd>{{ t('settings.phases.' + p.phase) }}</dd>
          <dt>{{ t('settings.blocked') }}</dt>
          <dd>{{ p.blocked ? t('settings.blockers.' + p.blocked) : '—' }}</dd>
          <dt>{{ t('settings.host') }}</dt>
          <dd>{{ p.hostId }}</dd>
          <dt>{{ t('settings.administrator') }}</dt>
          <dd>{{ p.administratorId ?? '—' }}</dd>
          <dt>{{ t('settings.requestedVersion') }}</dt>
          <dd>{{ p.application?.requestedRevision ?? '—' }}</dd>
          <dt>{{ t('settings.runtimeVersion') }}</dt>
          <dd>{{ p.application?.observation?.appliedRevision ?? '—' }}</dd>
          <dt>{{ t('settings.processGeneration') }}</dt>
          <dd>{{ p.application?.observation?.processGeneration ?? '—' }}</dd>
          <dt>{{ t('settings.observedAt') }}</dt>
          <dd>{{ p.application?.observation?.observedAt ?? '—' }}</dd>
        </dl>
        <UiButton :disabled="busy" @click="lookup(p.operationId)">{{
          t('settings.queryOperation')
        }}</UiButton
        ><a v-if="p.phase === 'enabled' && p.origin" class="ui-button" :href="p.origin"
          >{{ t('settings.businessEntry') }} · {{ p.origin }}</a
        >
      </article>
      <UiButton v-if="nextAfter" :disabled="busy" @click="more">{{ t('settings.next') }}</UiButton
      ><TenantEditor
        v-for="tenant in tenants"
        :key="tenant.tenantId"
        :tenant="tenant"
        @changed="load"
      /> </template
    ><UiMessage v-else tone="warning" :title="t('settings.scopeHint')"
  /></PageFrame>
</template>
