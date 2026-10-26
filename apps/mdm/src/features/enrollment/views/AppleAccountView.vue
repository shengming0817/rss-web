<script setup lang="ts">
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
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../usePermission'
import { useOperation } from '../../../services/useOperation'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import MdmPage from '../../../ui/MdmPage.vue'
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
const selected = computed(
  () => organizations.value.find((v) => v.id === id.value)?.accountEnrollment,
)
function newOrganization() {
  id.value = crypto.randomUUID()
}
function confirmComparison() {
  if (!freshRead.value || busy.value) return
  uncertain.value = false
  freshRead.value = false
}
async function refresh(cursor?: string) {
  if (!canRead.value) return
  await run(
    () => client.organizations({ cursor }),
    (v) => {
      organizations.value = cursor ? [...organizations.value, ...v.items] : v.items
      organizationCursor.value = v.nextCursor
      freshRead.value = true
    },
  )
  if (selected.value) await loadAccounts()
}
function load() {
  accounts.value = []
  accountCursor.value = null
  if (selected.value) void loadAccounts()
  const v = selected.value
  domain.value = v?.domain ?? ''
  serverUuid.value = v?.serverUuid ?? ''
  signingKey.value = v?.signingKey ?? ''
  enabled.value = v?.enabled ?? false
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
  const old = accounts.value.find((a) => a.account === name.value)
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
function chooseAccount(account: string) {
  const value = accounts.value.find((a) => a.account === account)
  name.value = account
  principalId.value = value?.principalId ?? ''
  instanceId.value = value?.instanceId ?? ''
  accountEnabled.value = value?.enabled ?? true
}
async function loadAccounts(cursor?: string) {
  if (!id.value || !canRead.value) return
  await run(
    () => client.accounts(id.value, { cursor }),
    (page) => {
      accounts.value = cursor ? [...accounts.value, ...page.items] : page.items
      accountCursor.value = page.nextCursor
    },
  )
}
watch(id, load)
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
</script>
<template>
  <MdmPage :title="t('onboarding.appleAccount')" :busy="busy" :failure="failure">
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
      <v-btn v-if="organizationCursor" :disabled="busy" @click="refresh(organizationCursor)">{{
        t('devices.next')
      }}</v-btn>
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
      <v-btn v-if="accountCursor" :disabled="busy" @click="loadAccounts(accountCursor)">{{
        t('devices.next')
      }}</v-btn>
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
