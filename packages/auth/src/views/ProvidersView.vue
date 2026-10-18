<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import type { Provider, ProviderSettings } from '../services/decode'
const { t } = useI18n()
const { api, session } = useIdentity()
const { busy, error, run, checkpoint } = useOperation()
const blocked = computed(() =>
  ['configuration_changed', 'unknown_result', 'identity_unavailable'].includes(error.value),
)
const editorOpen = ref(false)
function newProvider() {
  if (busy.value || blocked.value) return
  clear()
  editorOpen.value = true
}
function closeEditor() {
  editorOpen.value = false
  clientSecret.value = ''
  caPem.value = ''
}
const rows = ref<Provider[]>([])
const loaded = ref(false)
const selected = ref<Provider | null>(null)
const report = ref('')
const pending = ref<Provider | null>(null)
const issuer = ref('')
const client = ref('')
const clientSecret = ref('')
const caPem = ref('')
const scopes = ref('openid profile email')
const email = ref('email')
const groups = ref('groups')
const jit = ref(false)
function clear() {
  editorOpen.value = false
  selected.value = null
  issuer.value = ''
  client.value = ''
  clientSecret.value = ''
  caPem.value = ''
  scopes.value = 'openid profile email'
  email.value = 'email'
  groups.value = 'groups'
  jit.value = false
  report.value = ''
}
function edit(p: Provider) {
  editorOpen.value = true
  selected.value = p
  issuer.value = p.settings.issuer
  client.value = p.settings.clientId
  clientSecret.value = ''
  caPem.value = ''
  scopes.value = p.settings.scopes.join(' ')
  email.value = p.settings.claims.email ?? ''
  groups.value = p.settings.claims.groups ?? ''
  jit.value = p.settings.jit
  report.value = ''
}
async function load() {
  clear()
  const value = await api.providers()
  checkpoint()
  rows.value = value
  loaded.value = true
}
onMounted(() => {
  if (session.providerHint.value) void run(load)
})
onBeforeUnmount(() => {
  clientSecret.value = ''
  caPem.value = ''
})
async function save() {
  const current = selected.value
  const settings: ProviderSettings = {
    issuer: issuer.value,
    clientId: client.value,
    redirectUri: `${session.config.canonicalOrigin}/api/v1/identity/oidc/callback`,
    scopes: scopes.value.split(/\s+/).filter(Boolean),
    claims: {
      subject: current ? { ...current.settings.claims.subject } : { kind: 'oidc' },
      email: email.value || null,
      groups: groups.value || null,
      departmentSnapshot: current ? current.settings.claims.departmentSnapshot : null,
    },
    jit: jit.value,
  }
  const secret = clientSecret.value
  const ca = caPem.value || null
  clientSecret.value = ''
  caPem.value = ''
  await run(async () => {
    if (current) await api.updateProvider(current, settings, secret, ca)
    else await api.createProvider(settings, secret, ca)
    checkpoint()
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
  <section class="auth-page">
    <h1>{{ t('identity.providers') }}</h1>
    <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <p v-if="report" role="status">{{ report }}</p>
    <p v-if="session.state.value.navigation !== 'ready'" role="status">
      {{ t('identity.navigationUnavailable') }}
    </p>
    <p v-else-if="!session.providerHint.value">
      {{ t('identity.errors.insufficient_privilege') }}
    </p>
    <template v-else
      ><div class="auth-actions">
        <UiButton :disabled="!!busy" type="submit" @click="run(load)">
          {{ t(loaded ? 'identity.reload' : 'identity.loadList') }}</UiButton
        ><UiButton :disabled="!!(busy || blocked)" type="submit" @click="newProvider">
          {{ t('identity.newProvider') }}
        </UiButton>
      </div>
      <p v-if="!loaded" role="status">{{ t('identity.listNotLoaded') }}</p>
      <div v-if="loaded" class="auth-table">
        <div class="ui-table-scroll">
          <table class="ui-table">
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
                <td class="auth-actions">
                  <UiButton :disabled="!!(busy || blocked)" type="submit" @click="edit(p)">
                    {{ t('identity.edit') }}</UiButton
                  ><UiButton :disabled="!!(busy || blocked)" type="submit" @click="toggle(p)">
                    {{
                      t(p.enabled ? 'identity.disableProvider' : 'identity.enableProvider')
                    }}</UiButton
                  ><UiButton :disabled="!!(busy || blocked)" type="submit" @click="test(p)">
                    {{ t('identity.test') }}
                  </UiButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <UiDialog
        :open="editorOpen"
        :title="t(selected ? 'identity.editProvider' : 'identity.newProvider')"
        :close-label="t('identity.cancel')"
        placement="right"
        :dismissible="!busy"
        @update:open="!$event && closeEditor()"
      >
        <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
        <form class="auth-form" @submit.prevent="save">
          <h2>{{ t(selected ? 'identity.editProvider' : 'identity.newProvider') }}</h2>
          <p>{{ t('identity.providerHelp') }}</p>
          <label for="issuer">{{ t('identity.issuer') }}</label
          ><input
            id="issuer"
            v-model="issuer"
            class="ui-input"
            type="url"
            :readonly="selected !== null"
            required
          />
          <label for="client-id">{{ t('identity.client') }}</label
          ><input id="client-id" v-model="client" class="ui-input" required />
          <label for="client-secret">{{ t('identity.clientSecret') }}</label
          ><input
            id="client-secret"
            v-model="clientSecret"
            class="ui-input"
            type="password"
            autocomplete="new-password"
            required
          />
          <label for="ca-pem">{{ t('identity.caPem') }}</label>
          <textarea id="ca-pem" v-model="caPem" class="ui-input" autocomplete="off"></textarea>
          <label for="scopes">{{ t('identity.scopes') }}</label
          ><input id="scopes" v-model="scopes" class="ui-input" required />
          <label for="email-claim">{{ t('identity.emailClaim') }}</label
          ><input id="email-claim" v-model="email" class="ui-input" />
          <label for="groups-claim">{{ t('identity.groupsClaim') }}</label
          ><input id="groups-claim" v-model="groups" class="ui-input" />
          <label v-if="session.providerHint.value" class="auth-checkbox" for="jit"
            ><input id="jit" v-model="jit" type="checkbox" />{{ t('identity.jit') }}</label
          >
          <UiButton type="submit" :disabled="!!(busy || blocked)">{{
            t('identity.save')
          }}</UiButton>
        </form>
      </UiDialog>
    </template>
    <UiDialog
      :open="pending !== null"
      :title="t('identity.disableProvider')"
      :description="`${pending?.settings.issuer ?? ''} · ${t('identity.disableProviderHelp')}`"
      :close-label="t('identity.cancel')"
      kind="alertdialog"
      @update:open="!$event && (pending = null)"
    >
      <template #footer>
        <UiButton class="ui-button" type="submit" @click="pending = null">{{
          t('identity.cancel')
        }}</UiButton>
        <UiButton
          class="ui-button ui-button--primary"
          :disabled="!!busy"
          type="submit"
          @click="confirmDisable"
        >
          {{ t('identity.confirm') }}
        </UiButton>
      </template>
    </UiDialog>
  </section>
</template>
