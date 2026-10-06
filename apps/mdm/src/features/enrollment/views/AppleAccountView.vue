<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../usePermission'
import { useOperation } from '../../../services/useOperation'
import OperationsFrame from '../../operations/components/OperationsFrame.vue'
const id = ref('')
const runtime = useMdm(),
  client = runtime.onboarding.apple,
  { t } = useI18n(),
  { canRead, canWrite } = usePermission('authorization_read', 'authorization_write'),
  { run, runWrite, busy, uncertain, failure } = useOperation(['service_unavailable'], () => [
    runtime.session.state.value.session?.id,
    id.value,
  ])
const organizations = ref<Awaited<ReturnType<typeof client.organizations>>>([]),
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
function refresh() {
  if (!canRead.value) return
  void run(
    () => client.organizations(),
    (v) => {
      organizations.value = v
      freshRead.value = true
    },
  )
}
function load() {
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
    if (ok) refresh()
  })
}
function saveMapping() {
  if (!canWrite.value || uncertain.value) return
  const old = selected.value?.accounts.find((a) => a.account === name.value)
  freshRead.value = false
  void runWrite(() =>
    client.accountMapping(id.value, name.value, crypto.randomUUID(), {
      expectedRevision: old?.revision ?? 0,
      principalId: principalId.value,
      instanceId: instanceId.value,
      enabled: accountEnabled.value,
    }),
  ).then((ok) => {
    if (ok) refresh()
  })
}
function chooseAccount(account: string) {
  const value = selected.value?.accounts.find((a) => a.account === account)
  name.value = account
  principalId.value = value?.principalId ?? ''
  instanceId.value = value?.instanceId ?? ''
  accountEnabled.value = value?.enabled ?? true
}
watch(id, load)
watch(
  canRead,
  (allowed) => {
    organizations.value = []
    freshRead.value = false
    if (allowed) refresh()
  },
  { immediate: true },
)
</script>
<template>
  <OperationsFrame :title="t('onboarding.appleAccount')" :busy="busy" :failure="failure">
    <p>{{ t('onboarding.appleAccountGuide') }}</p>
    <a :href="client.bridge">{{ t('onboarding.appleBridge') }}</a>
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <button type="button" :disabled="busy" @click="refresh">{{ t('devices.reload') }}</button>
      <label
        >{{ t('onboarding.organization')
        }}<select v-model="id" :disabled="busy || uncertain">
          <option value="">{{ t('devices.select') }}</option>
          <option v-for="o in organizations" :key="o.id" :value="o.id">{{ o.id }}</option>
        </select></label
      >
      <label v-if="canWrite"
        >{{ t('onboarding.organizationId') }}<input v-model="id" :disabled="busy || uncertain"
      /></label>
      <button v-if="canWrite" type="button" :disabled="busy || uncertain" @click="newOrganization">
        {{ t('onboarding.newOrganization') }}
      </button>
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
      <form v-if="canWrite && id" @submit.prevent="saveOrganization">
        <fieldset :disabled="busy || uncertain">
          <legend>{{ t('onboarding.organizationConfiguration') }}</legend>
          <label
            >{{ t('onboarding.domain') }}<input v-model="domain" required maxlength="253" /></label
          ><label>{{ t('onboarding.serverUuid') }}<input v-model="serverUuid" required /></label
          ><label
            >{{ t('onboarding.signingKeyReference')
            }}<input v-model="signingKey" required maxlength="128" /></label
          ><label><input v-model="enabled" type="checkbox" />{{ t('onboarding.enabled') }}</label
          ><button>{{ t('registration.save') }}</button>
        </fieldset>
      </form>
      <table v-if="selected">
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
          <tr v-for="a in selected.accounts" :key="a.account">
            <td>
              <button type="button" :disabled="busy || uncertain" @click="chooseAccount(a.account)">
                {{ a.account }}
              </button>
            </td>
            <td>{{ a.principalId }}</td>
            <td>{{ a.instanceId }}</td>
            <td>{{ a.revision }}</td>
            <td>{{ t(`devices.${a.enabled ? 'yes' : 'no'}`) }}</td>
          </tr>
        </tbody>
      </table>
      <form v-if="canWrite && selected" @submit.prevent="saveMapping">
        <fieldset :disabled="busy || uncertain">
          <legend>{{ t('onboarding.accountMapping') }}</legend>
          <label
            >{{ t('onboarding.managedAccount')
            }}<input v-model="name" type="email" required /></label
          ><label>{{ t('onboarding.principal') }}<input v-model="principalId" required /></label
          ><label>{{ t('onboarding.instance') }}<input v-model="instanceId" required /></label
          ><label
            ><input v-model="accountEnabled" type="checkbox" />{{ t('onboarding.enabled') }}</label
          ><button>{{ t('registration.save') }}</button>
        </fieldset>
      </form>
      <p v-if="uncertain">{{ t('onboarding.compareUnknown') }}</p>
      <button
        v-if="uncertain && freshRead"
        type="button"
        @click="
          uncertain = false
          freshRead = false
        "
      >
        {{ t('onboarding.confirmComparison') }}
      </button>
    </template>
  </OperationsFrame>
</template>
