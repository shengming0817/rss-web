<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ModalShell } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import type { Provider, ProviderSettings } from '../services/decode'
const { t } = useI18n()
const { api, session } = useIdentity()
const { busy, error, run } = useOperation()
const blocked = computed(() =>
  ['configuration_changed', 'unknown_result', 'identity_unavailable'].includes(error.value),
)
const rows = ref<Provider[]>([])
const selected = ref<Provider | null>(null)
const report = ref('')
const pending = ref<Provider | null>(null)
const issuer = ref('')
const client = ref('')
const secretRef = ref('')
const scopes = ref('openid profile email')
const email = ref('email')
const groups = ref('groups')
const jit = ref(false)
function clear() {
  selected.value = null
  issuer.value = ''
  client.value = ''
  secretRef.value = ''
  scopes.value = 'openid profile email'
  email.value = 'email'
  groups.value = 'groups'
  jit.value = false
  report.value = ''
}
function edit(p: Provider) {
  selected.value = p
  issuer.value = p.settings.issuer
  client.value = p.settings.client_id
  secretRef.value = p.settings.secret_ref
  scopes.value = p.settings.scopes.join(' ')
  email.value = p.settings.claims.email ?? ''
  groups.value = p.settings.claims.groups ?? ''
  jit.value = p.settings.jit
  report.value = ''
}
async function load() {
  clear()
  rows.value = await api.providers()
}
onMounted(() => {
  if (session.state.value.identity?.administrator) void run(load)
})
async function save() {
  const settings: ProviderSettings = {
    issuer: issuer.value,
    client_id: client.value,
    secret_ref: secretRef.value,
    redirect_uri: `${window.location.origin}/api/v1/oidc/callback`,
    scopes: scopes.value.split(/\s+/).filter(Boolean),
    claims: { email: email.value || null, groups: groups.value || null },
    jit: jit.value,
  }
  const current = selected.value
  await run(async () => {
    if (current) await api.updateProvider(current, settings)
    else await api.createProvider(settings)
    clear()
    await load()
  })
}
function toggle(p: Provider) {
  if (p.enabled) pending.value = p
  else void changeEnabled(p)
}
async function confirmDisable() {
  const p = pending.value
  pending.value = null
  if (p) await changeEnabled(p)
}
async function changeEnabled(p: Provider) {
  await run(async () => {
    await api.enableProvider(p, !p.enabled)
    clear()
    await load()
  })
}
async function test(p: Provider) {
  report.value = ''
  await run(async () => {
    const result = await api.testProvider(p)
    report.value = result.passed
      ? t('identity.testPassed')
      : `${t('identity.testFailed')} · ${result.diagnostic}`
  })
}
</script>
<template>
  <section class="identity-card">
    <h1>{{ t('identity.providers') }}</h1>
    <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <p v-if="report" role="status">{{ report }}</p>
    <p v-if="!session.state.value.identity?.administrator">
      {{ t('identity.errors.insufficient_privilege') }}
    </p>
    <template v-else
      ><div class="identity-actions">
        <button :disabled="busy" @click="run(load)">{{ t('identity.reload') }}</button
        ><button :disabled="busy || blocked" @click="clear">{{ t('identity.newProvider') }}</button>
      </div>
      <div class="identity-table">
        <table>
          <thead>
            <tr>
              <th>{{ t('identity.issuer') }}</th>
              <th>{{ t('identity.state') }}</th>
              <th>{{ t('identity.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in rows" :key="p.id">
              <td>
                {{ p.settings.issuer }}<small>{{ p.id }}</small>
              </td>
              <td>
                {{ t(p.enabled ? 'identity.enabled' : 'identity.disabled') }} · v{{ p.version }}
              </td>
              <td class="identity-actions">
                <button :disabled="busy || blocked" @click="edit(p)">
                  {{ t('identity.edit') }}</button
                ><button :disabled="busy || blocked" @click="toggle(p)">
                  {{
                    t(p.enabled ? 'identity.disableProvider' : 'identity.enableProvider')
                  }}</button
                ><button :disabled="busy || blocked" @click="test(p)">
                  {{ t('identity.test') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form @submit.prevent="save">
        <h2>{{ t(selected ? 'identity.editProvider' : 'identity.newProvider') }}</h2>
        <p>{{ t('identity.providerHelp') }}</p>
        <label for="issuer">{{ t('identity.issuer') }}</label
        ><input id="issuer" v-model="issuer" type="url" :readonly="selected !== null" required />
        <label for="client-id">{{ t('identity.client') }}</label
        ><input id="client-id" v-model="client" required />
        <label for="secret-ref">{{ t('identity.secretRef') }}</label
        ><input id="secret-ref" v-model="secretRef" autocomplete="off" required />
        <label for="scopes">{{ t('identity.scopes') }}</label
        ><input id="scopes" v-model="scopes" required />
        <label for="email-claim">{{ t('identity.emailClaim') }}</label
        ><input id="email-claim" v-model="email" />
        <label for="groups-claim">{{ t('identity.groupsClaim') }}</label
        ><input id="groups-claim" v-model="groups" />
        <label class="identity-checkbox" for="jit"
          ><input id="jit" v-model="jit" type="checkbox" />{{ t('identity.jit') }}</label
        >
        <button type="submit" :disabled="busy || blocked">{{ t('identity.save') }}</button>
      </form></template
    >
    <ModalShell
      :open="pending !== null"
      title-id="provider-disable-title"
      description-id="provider-disable-detail"
      role="alertdialog"
      @close="pending = null"
    >
      <h2 id="provider-disable-title">{{ t('identity.disableProvider') }}</h2>
      <p id="provider-disable-detail">
        {{ pending?.settings.issuer }} · {{ t('identity.disableProviderHelp') }}
      </p>
      <button @click="pending = null">{{ t('identity.cancel') }}</button>
      <button :disabled="busy" @click="confirmDisable">{{ t('identity.confirm') }}</button>
    </ModalShell>
  </section>
</template>
