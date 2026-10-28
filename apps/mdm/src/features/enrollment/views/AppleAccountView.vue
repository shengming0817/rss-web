<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import {
  VForm,
  VSelect,
  VBtn,
  VCheckbox,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VTable,
  VTextField,
} from 'vuetify/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../usePermission'
import { useOperation } from '../../../services/useOperation'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import MdmPage from '../../../ui/MdmPage.vue'
const accountQuery = useDirectoryQuery(
  ['account', 'revision', 'enabled', 'principalId', 'instanceId'],
  1000,
)

const organizationQuery = useDirectoryQuery(['id', 'ade', 'accountEnrollment'], 1000)

const id = ref('')
const runtime = useMdm(),
  client = runtime.onboarding.apple,
  { t } = useI18n(),
  { canRead, canWrite } = usePermission(
    'registration_configuration_read',
    'registration_configuration_write',
  ),
  { run, runWrite, busy, uncertain, failure } = useOperation(['service_unavailable'], () => [
    runtime.session.state.value.session?.id,
    id.value,
  ])
const organizations = ref<Awaited<ReturnType<typeof client.organizations>>['items']>([]),
  organizationCursor = ref<string | null>(null),
  accounts = ref<Awaited<ReturnType<typeof client.accounts>>['items']>([]),
  accountCursor = ref<string | null>(null),
  domain = ref(''),
  serverUuid = ref(''),
  signingKey = ref(''),
  enabled = ref(false),
  name = ref(''),
  principalId = ref(''),
  instanceId = ref(''),
  accountEnabled = ref(true),
  freshRead = ref(false)
const organizationRows = ref<object[]>([]),
  accountRows = ref<object[]>([])
const selected = ref<Awaited<ReturnType<typeof client.accountConfiguration>>>(),
  mapping = ref<Awaited<ReturnType<typeof client.account>>>()
let creatingOrganization: string | undefined
function newOrganization() {
  creatingOrganization = crypto.randomUUID()
  id.value = creatingOrganization
}
function confirmComparison() {
  if (!freshRead.value || busy.value) return
  uncertain.value = false
  freshRead.value = false
}
async function refresh(cursor?: string) {
  if (!canRead.value) return
  const ok = await run(
    () => organizationQuery.read(cursor, (query) => client.organizations(query)),
    (v) => {
      organizationRows.value = v.items
      organizations.value = organizationQuery.complete.value ? v.items : []
      organizationCursor.value = v.nextCursor
    },
  )
  if (ok && selected.value) await loadAccounts()
}
async function load() {
  accountQuery.reset()
  accounts.value = []
  accountCursor.value = null
  selected.value = undefined
  mapping.value = undefined
  domain.value = ''
  serverUuid.value = ''
  signingKey.value = ''
  enabled.value = false
  if (!id.value || id.value === creatingOrganization) return
  const ok = await run(
    () => client.accountConfiguration(id.value),
    (value) => {
      selected.value = value
      domain.value = value.domain
      serverUuid.value = value.serverUuid
      signingKey.value = value.signingKey
      enabled.value = value.enabled
      freshRead.value = true
    },
  )
  if (ok) await loadAccounts()
}
function saveOrganization() {
  if (!canWrite.value || uncertain.value) return
  freshRead.value = false
  void runWrite(() =>
    client.accountOrganization(id.value, crypto.randomUUID(), {
      expectedRevision: selected.value?.revision ?? 0,
      domain: domain.value,
      serverUuid: serverUuid.value,
      signingKey: signingKey.value,
      enabled: enabled.value,
    }),
  ).then((ok) => {
    if (ok) void refresh()
  })
}
function saveMapping() {
  if (!canWrite.value || uncertain.value) return
  const old = mapping.value?.account === name.value ? mapping.value : undefined
  freshRead.value = false
  void runWrite(() =>
    client.accountMapping(id.value, name.value, crypto.randomUUID(), {
      expectedRevision: old?.revision ?? 0,
      principalId: principalId.value,
      instanceId: instanceId.value,
      enabled: accountEnabled.value,
    }),
  ).then((ok) => {
    if (ok) void refresh()
  })
}
async function chooseAccount(account: string) {
  await run(
    () => client.account(id.value, account),
    (value) => {
      mapping.value = value
      name.value = value.account
      principalId.value = value.principalId
      instanceId.value = value.instanceId
      accountEnabled.value = value.enabled
      freshRead.value = true
    },
  )
}
async function loadAccounts(cursor?: string) {
  if (!id.value || !canRead.value) return
  await run(
    () => accountQuery.read(cursor, (query) => client.accounts(id.value, query)),
    (page) => {
      accountRows.value = page.items
      accounts.value = accountQuery.complete.value ? page.items : []
      accountCursor.value = page.nextCursor
    },
  )
}
watch(
  id,
  () => {
    void load()
  },
  { flush: 'sync' },
)
watch(
  canRead,
  (allowed) => {
    organizations.value = []
    accounts.value = []
    accountCursor.value = null
    organizationCursor.value = null
    freshRead.value = false
    if (allowed) refresh()
  },
  { immediate: true },
)
organizationQuery.onClear(() => {
  organizations.value = []
  organizationRows.value = []
})
accountQuery.onClear(() => {
  accounts.value = []
  accountRows.value = []
})
watch(
  canRead,
  (allowed) => {
    if (!allowed) {
      selected.value = undefined
      mapping.value = undefined
      organizationQuery.reset()
      accountQuery.reset()
    }
  },
  { flush: 'sync' },
)
accountQuery.restrict(canRead)
organizationQuery.restrict(canRead)
</script>
<template>
  <VBtn :disabled="busy || !id" @click="load()">{{ t('settings.reload') }}</VBtn>
  <MdmPage :title="t('onboarding.appleAccount')" :busy="busy" :failure="failure">
    <DirectoryControls
      :query="accountQuery"
      :busy="busy"
      hint="account / revision / enabled / principalId / instanceId"
      @load="loadAccounts"
    />
    <DirectoryResults
      :disabled="busy || uncertain"
      :required="['account']"
      v-if="!accountQuery.complete.value"
      :items="accountRows"
      @open="
        (row) => {
          chooseAccount(String(row.account))
        }
      "
    />

    <DirectoryControls :query="organizationQuery" :busy="busy" hint="id" @load="refresh" />
    <DirectoryResults
      :disabled="busy || uncertain"
      v-if="!organizationQuery.complete.value"
      :items="organizationRows"
      @open="
        (row) => {
          id = String(row.id)
        }
      "
    />

    <RegistrationStatus channel="macos_mdm" />
    <p>{{ t('onboarding.appleAccountGuide') }}</p>
    <v-btn
      v-if="runtime.registrationChannels.allowed('macos_mdm')"
      variant="text"
      :href="client.bridge"
      >{{ t('onboarding.appleBridge') }}</v-btn
    >
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <v-btn type="button" :disabled="!!busy" @click="refresh()">{{ t('devices.reload') }}</v-btn>

      <v-select
        v-model="id"
        :label="t('onboarding.organization')"
        :disabled="busy || uncertain"
        :items="[
          { value: '', title: t('devices.select') },
          ...organizations.map((o) => ({
            value: o.id,
            title: `${o.accountEnrollment?.domain || o.ade?.orgId || o.id} · ${o.id}`,
          })),
        ]"
      />
      <v-text-field
        v-if="canWrite"
        v-model="id"
        data-testid="organization-id"
        :disabled="busy || uncertain"
        :label="t('onboarding.organizationId')"
      />
      <v-btn
        v-if="canWrite"
        type="button"
        :disabled="!!(busy || uncertain)"
        @click="newOrganization"
      >
        {{ t('onboarding.newOrganization') }}
      </v-btn>

      <dl v-if="selected">
        <dt>{{ t('devices.revision') }}</dt>
        <dd>{{ selected.revision }}</dd>
        <dt>{{ t('onboarding.signingKeyConfigured') }}</dt>
        <dd>{{ t(`devices.${selected.signingKeyConfigured ? 'yes' : 'no'}`) }}</dd>
        <dt>{{ t('onboarding.externalVerification') }}</dt>
        <dd>{{ t('onboarding.notObserved') }}</dd>
        <dt>{{ t('onboarding.domain') }}</dt>
        <dd>{{ selected.domain }}</dd>
        <dt>{{ t('onboarding.serverUuid') }}</dt>
        <dd>{{ selected.serverUuid }}</dd>
        <dt>{{ t('onboarding.signingKeyReference') }}</dt>
        <dd>{{ selected.signingKey }}</dd>
        <dt>{{ t('onboarding.enabled') }}</dt>
        <dd>{{ t(`devices.${selected.enabled ? 'yes' : 'no'}`) }}</dd>
      </dl>
      <v-expansion-panels
        v-if="canWrite && id"
        multiple
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{
            t('onboarding.organizationConfiguration')
          }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <v-form :novalidate="false" @submit.prevent="saveOrganization">
              <fieldset :disabled="busy || uncertain">
                <legend>{{ t('onboarding.organizationConfiguration') }}</legend>
                <v-text-field
                  v-model="domain"
                  required
                  maxlength="253"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.domain')"
                /><v-text-field
                  v-model="serverUuid"
                  required
                  :disabled="busy || uncertain"
                  :label="t('onboarding.serverUuid')"
                /><v-text-field
                  v-model="signingKey"
                  required
                  maxlength="128"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.signingKeyReference')"
                /><v-checkbox
                  v-model="enabled"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.enabled')"
                /><v-btn type="submit" :disabled="busy || uncertain">{{
                  t('registration.save')
                }}</v-btn>
              </fieldset>
            </v-form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
      <v-table v-if="selected">
        <thead>
          <tr>
            <th>{{ t('onboarding.managedAccount') }}</th>
            <th>{{ t('onboarding.principal') }}</th>
            <th>{{ t('onboarding.instance') }}</th>
            <th>{{ t('devices.revision') }}</th>
            <th>{{ t('devices.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in accounts" :key="a.account">
            <td>
              <v-btn
                type="button"
                :disabled="!!(busy || uncertain)"
                @click="chooseAccount(a.account)"
              >
                {{ a.account }}
              </v-btn>
            </td>
            <td>{{ a.principalId }}</td>
            <td>{{ a.instanceId }}</td>
            <td>{{ a.revision }}</td>
            <td>{{ t(`devices.${a.enabled ? 'yes' : 'no'}`) }}</td>
          </tr>
        </tbody>
      </v-table>
      <v-expansion-panels
        v-if="canWrite && selected"
        multiple
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{ t('onboarding.accountMapping') }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <v-form :novalidate="false" @submit.prevent="saveMapping">
              <fieldset :disabled="busy || uncertain">
                <legend>{{ t('onboarding.accountMapping') }}</legend>
                <v-text-field
                  v-model="name"
                  type="email"
                  required
                  :disabled="busy || uncertain"
                  :label="t('onboarding.managedAccount')"
                /><v-text-field
                  v-model="principalId"
                  required
                  :disabled="busy || uncertain"
                  :label="t('onboarding.principal')"
                /><v-text-field
                  v-model="instanceId"
                  required
                  :disabled="busy || uncertain"
                  :label="t('onboarding.instance')"
                /><v-checkbox
                  v-model="accountEnabled"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.enabled')"
                /><v-btn type="submit" :disabled="busy || uncertain">{{
                  t('registration.save')
                }}</v-btn>
              </fieldset>
            </v-form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
      <p v-if="uncertain">{{ t('onboarding.compareUnknown') }}</p>
      <v-btn v-if="uncertain && freshRead" type="button" @click="confirmComparison">
        {{ t('onboarding.confirmComparison') }}
      </v-btn>
    </template>
  </MdmPage>
</template>
