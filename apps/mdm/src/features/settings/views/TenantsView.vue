<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import '../settings.css'
import { VAlert, VBtn, VCard, VCheckbox, VForm, VTextField } from 'vuetify/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction, useSettingsSecrets } from '../useSettingsAction'
import type { Tenant, Provisioning } from '../clients/platform'
import MdmPage from '../../../ui/MdmPage.vue'
import TenantEditor from '../components/TenantEditor.vue'
import OperationNotice from '../components/OperationNotice.vue'
const provisioningQuery = useDirectoryQuery(['operationId', 'action', 'result'], 1000)

const tenantQuery = useDirectoryQuery(
  [
    'tenantId',
    'name',
    'notes',
    'revision',
    'initialEpoch',
    'management',
    'deletable',
    'currentEpoch',
  ],
  1000,
)

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
  nextCursor = ref<string | null>(null),
  tenantCursor = ref<string | null>(null),
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
    async () => ({
      tenants: await tenantQuery.read(undefined, (query) => client.tenants(query)),
      page: await provisioningQuery.read(undefined, (query) => client.provisionings(query)),
    }),
    (v) => {
      projectedTenants.value = v.tenants.items
      tenants.value = tenantQuery.complete.value ? v.tenants.items : []
      tenantCursor.value = v.tenants.nextCursor
      projectedProvisionings.value = v.page.items
      provisionings.value = provisioningQuery.complete.value
        ? v.page.items.map((v) => v.result)
        : []
      nextCursor.value = v.page.nextCursor
    },
  )
}
const projectedTenants = ref<object[]>([]),
  projectedProvisionings = ref<object[]>([]),
  selectedTenant = ref<Tenant>(),
  currentProvisioning = ref<Provisioning>()
async function readTenant(id: string) {
  await run(
    () => client.tenant(id),
    (value) => {
      selectedTenant.value = value
    },
  )
}
async function loadTenants(after?: string) {
  return run(
    () => tenantQuery.read(after, (query) => client.tenants(query)),
    (page) => {
      projectedTenants.value = page.items
      tenants.value = tenantQuery.complete.value ? page.items : []
      tenantCursor.value = page.nextCursor
    },
  )
}
async function loadProvisionings(after?: string) {
  return run(
    () => provisioningQuery.read(after, (query) => client.provisionings(query)),
    (page) => {
      projectedProvisionings.value = page.items
      provisionings.value = provisioningQuery.complete.value
        ? page.items.map((row) => row.result)
        : []
      nextCursor.value = page.nextCursor
    },
  )
}
async function lookup(id = pending.value?.id ?? original.value) {
  if (!id) return
  await query(
    id,
    () => client.operation(id),
    (v) => {
      currentProvisioning.value = v.result
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
      currentProvisioning.value = v.result
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
  tenantCursor.value = null
  nextCursor.value = null
})
tenantQuery.onClear(() => {
  tenants.value = []
  projectedTenants.value = []
})
provisioningQuery.onClear(() => {
  provisionings.value = []
  projectedProvisionings.value = []
})
</script>
<template>
  <MdmPage :title="t('settings.tenants')" :busy="busy" :failure="failure">
    <DirectoryControls
      :query="provisioningQuery"
      :busy="busy"
      hint="operationId"
      @load="loadProvisionings" />
    <DirectoryResults
      :disabled="busy"
      :required="['operationId']"
      v-if="!provisioningQuery.complete.value"
      :items="projectedProvisionings"
      @open="
        (row) => {
          lookup(String(row.operationId))
        }
      " />

    <DirectoryControls
      :query="tenantQuery"
      :busy="busy"
      hint="tenantId / name / notes / revision / initialEpoch / management / deletable"
      @load="loadTenants" />
    <DirectoryResults
      :disabled="busy"
      :required="['tenantId']"
      v-if="!tenantQuery.complete.value"
      :items="projectedTenants"
      @open="
        (row) => {
          readTenant(String(row.tenantId))
        }
      " />
    <template v-if="runtime.realm === 'platform'"
      ><VAlert type="info" :title="t('settings.scopeHint')" variant="tonal">{{
        t('settings.capacityHint')
      }}</VAlert
      ><VBtn :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</VBtn
      ><OperationNotice
        :operation="pending"
        :busy="busy"
        :can-write="canWrite"
        :compared="compared"
        @query="lookup()"
        @retry="create(true)"
        @compare="compare"
        @edit="resolveConflict" /><VForm
        :novalidate="false"
        class="settings-editor"
        @submit.prevent="create()"
        ><fieldset :disabled="busy || !canWrite">
          <legend>{{ t('settings.createTenant') }}</legend>
          <p>{{ t('settings.createHint') }}</p>
          <VTextField
            v-model="name"
            required
            maxlength="256"
            :label="t('settings.name')"
            :disabled="busy || !canWrite"
          /><VTextField
            v-model="login"
            autocomplete="off"
            required
            maxlength="256"
            :label="t('settings.administratorLogin')"
            :disabled="busy || !canWrite"
          /><VTextField
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            required
            maxlength="1024"
            :label="t('settings.administratorPassword')"
            :disabled="busy || !canWrite"
          />
          <div class="settings-actions">
            <VBtn :disabled="busy || !canWrite" @click="generate">{{
              t('settings.generatePassword')
            }}</VBtn
            ><VCheckbox
              v-model="showPassword"
              :label="t('settings.showPassword')"
              :disabled="busy || !canWrite"
            />
          </div>
          <VBtn type="submit" :disabled="busy || !canWrite || locked">{{
            t('settings.createTenant')
          }}</VBtn>
        </fieldset></VForm
      ><VForm :novalidate="false" class="settings-editor" @submit.prevent="lookup(original)"
        ><VTextField
          v-model="original"
          required
          maxlength="36"
          :label="t('settings.queryId')"
        /><VBtn type="submit" :disabled="busy || !canRead">{{
          t('settings.queryOperation')
        }}</VBtn></VForm
      ><VCard
        v-for="p in provisionings"
        :key="p.operationId"
        class="console-panel"
        tag="article"
        variant="outlined"
        ><h2>{{ p.tenantId }}</h2>
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
        <VBtn :disabled="busy" @click="lookup(p.operationId)">{{
          t('settings.queryOperation')
        }}</VBtn
        ><VBtn v-if="p.phase === 'enabled' && p.origin" :href="p.origin"
          >{{ t('settings.businessEntry') }} · {{ p.origin }}</VBtn
        ></VCard
      ><VCard v-if="currentProvisioning" class="console-panel"
        ><p>{{ t('settings.queryOperation') }} · {{ currentProvisioning.operationId }}</p>
        <p>
          {{ t('settings.phases.' + currentProvisioning.phase) }} ·
          {{ currentProvisioning.tenantId }}
        </p></VCard
      >
      <section v-for="tenant in tenants" :key="tenant.tenantId">
        <p>{{ tenant.name ?? tenant.tenantId }}</p>
        <VBtn :disabled="busy" @click="readTenant(tenant.tenantId)">{{ t('policies.open') }}</VBtn>
      </section>
      <TenantEditor
        v-if="selectedTenant"
        :key="selectedTenant.tenantId"
        :tenant="selectedTenant"
        @changed="load" /></template
    ><VAlert v-else type="warning" :title="t('settings.scopeHint')" variant="tonal"
  /></MdmPage>
</template>
