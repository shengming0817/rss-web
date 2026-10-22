<script setup lang="ts">
import { UiButton, UiTabs, UiDialog } from '@rss/core/components'
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useIdentity, loginTarget } from '../context'
import { useOperation } from '../services/operation'
import type { Session } from '../services/decode'
const { t } = useI18n()
const router = useRouter()
const { session, api, flows, hostLogin: host } = useIdentity()
const { busy, error, run, checkpoint } = useOperation()
const rows = ref<Session[]>([])
const next = ref<string | null>(null)
const current = ref('')
const tab = ref('sessions'),
  confirmAll = ref(false)
function clearLocalSecrets() {
  password.value = ''
  current.value = ''
  reauthPassword.value = ''
  linkPassword.value = ''
}
function clearClosedSecrets(event: Event) {
  if (!(event.target as HTMLDetailsElement).open) clearLocalSecrets()
}
watch(tab, clearLocalSecrets)
const password = ref('')
const reauthPassword = ref('')
const linkPassword = ref('')
const providers = ref<{ id: string; label: string }[]>([])
const selectedProvider = ref('')
const owner = computed(() =>
  session.state.value.status === 'authenticated'
    ? [
        session.state.value.tenant,
        session.state.value.identity?.principalId,
        session.state.value.session?.id,
      ].join('/')
    : null,
)
let generation = 0
let reload = true
watch(
  owner,
  () => {
    generation++
    rows.value = []
    next.value = null
    current.value = ''
    password.value = ''
    reauthPassword.value = ''
    linkPassword.value = ''
    providers.value = []
    selectedProvider.value = ''
    reload = true
  },
  { flush: 'sync' },
)
watch(
  [owner, busy],
  () => {
    if (!owner.value || busy.value || !reload) return
    reload = false
    void run(async () => {
      await load()
      await session.loadSecurity()
      if (session.config.oidcEnabled && session.state.value.tenant)
        providers.value = await api.loginOptions(session.state.value.tenant)
    })
  },
  { immediate: true },
)
async function load(cursor?: string) {
  const expected = generation
  const value = await api.sessions(cursor)
  checkpoint()
  if (generation !== expected) throw new Error('Stale session page')
  rows.value = cursor ? [...rows.value, ...value.sessions] : value.sessions
  next.value = value.next
}
async function checkSession() {
  const tenant = session.state.value.tenant
  if (tenant) {
    await session.check(tenant)
    checkpoint()
  }
}
async function reloadSessions() {
  if (owner.value) await load()
  else await checkSession()
}
onMounted(() => {
  document.addEventListener('visibilitychange', visible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', visible))
function visible() {
  if (document.visibilityState === 'visible' && !busy.value) void run(checkSession)
}
watch(
  () => session.state.value.session,
  (value, previous) => {
    if (value && previous && value !== previous && !busy.value)
      void run(() => session.loadSecurity())
  },
)
async function stepUp(id: string) {
  await run(async () => {
    const tenant = session.state.value.tenant
    if (!tenant) return
    flows.save({
      kind: 'step-up',
      tenant,
    })
    try {
      const location = await api.stepUp(id)
      checkpoint()
      window.location.assign(location)
    } catch (failure) {
      flows.clear()
      throw failure
    }
  })
}
async function change() {
  const old = current.value
  const value = password.value
  current.value = ''
  password.value = ''
  await run(async () => {
    await api.ownPassword(old, value)
    flows.clear()
    await router.replace(loginTarget(session.state.value.tenant, host))
  })
}
async function logout(all: boolean) {
  const tenant = session.state.value.tenant
  flows.clear()
  await run(async () => {
    await session.logout(all)
    checkpoint()
    await router.replace(loginTarget(tenant, host))
  })
}
async function reauthenticate() {
  const value = reauthPassword.value
  reauthPassword.value = ''
  await run(() => session.reauthenticate(value))
}
async function link() {
  const tenant = session.state.value.tenant
  const value = session.state.value.identity?.hasLocalPassword ? linkPassword.value : null
  linkPassword.value = ''
  if (!tenant) return
  await run(async () => {
    flows.save({ kind: 'link', tenant })
    try {
      const location = await api.link(selectedProvider.value, value)
      checkpoint()
      window.location.assign(location)
    } catch (failure) {
      flows.clear()
      throw failure
    }
  })
}
onBeforeUnmount(() => {
  reauthPassword.value = ''
  linkPassword.value = ''
})
function submitConfirmed() {
  confirmAll.value = false
  void logout(true)
}
</script>
<template>
  <section class="auth-page">
    <h1>{{ t('identity.sessions') }}</h1>
    <p v-if="session.logoutOutcome.value === 'unconfirmed'" role="alert">
      {{ t('identity.logoutUnconfirmed') }}
    </p>
    <p v-else-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <p class="auth-muted">{{ t('identity.logoutHelp') }}</p>
    <UiTabs
      v-model="tab"
      :label="t('identity.sessions')"
      :items="[
        { value: 'sessions', label: t('identity.sessions') },
        { value: 'security', label: t('identity.authentication') },
      ]"
      keep-mounted
      ><template #sessions
        ><div class="auth-actions">
          <UiButton :disabled="!!busy" type="submit" @click="run(reloadSessions)">{{
            t('identity.reload')
          }}</UiButton
          ><UiButton :disabled="!!(busy || !owner)" type="submit" @click="logout(false)">{{
            t('identity.logout')
          }}</UiButton
          ><UiButton :disabled="!!(busy || !owner)" type="submit" @click="confirmAll = true">
            {{ t('identity.logoutAll') }}
          </UiButton>
          <RouterLink
            v-if="session.logoutOutcome.value === 'unconfirmed' && !owner"
            :to="loginTarget(session.state.value.tenant, host)"
          >
            {{ t('identity.login') }}
          </RouterLink>
        </div>
        <div class="auth-table">
          <div class="ui-table-scroll">
            <table class="ui-table">
              <thead>
                <tr>
                  <th>{{ t('identity.session') }}</th>
                  <th>{{ t('identity.expires') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td>
                    {{ row.id }}
                    <span v-if="row.id === session.state.value.session?.id"
                      >({{ t('identity.current') }})</span
                    >
                  </td>
                  <td>{{ new Date(row.idleExpiresAt * 1000).toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <UiButton
          v-if="next"
          :disabled="!!busy"
          type="submit"
          @click="run(() => load(next ?? undefined))"
        >
          {{ t('identity.more') }}
        </UiButton></template
      ><template #security
        ><section v-if="session.config.oidcEnabled" aria-labelledby="security-title">
          <h2 id="security-title">{{ t('identity.authentication') }}</h2>
          <template v-if="session.state.value.security">
            <p>
              {{ t('identity.authenticationSource') }}:
              {{ t('identity.' + session.state.value.security.authentication.source) }}
            </p>
            <p>
              {{ t('identity.authTime') }}:
              {{
                session.state.value.security.authentication.authTime === null
                  ? t('identity.noAuthTime')
                  : new Date(
                      session.state.value.security.authentication.authTime * 1000,
                    ).toLocaleString()
              }}
            </p>
            <p>
              {{ t('identity.strength') }}:
              {{ t('identity.' + session.state.value.security.authentication.acr) }}
            </p>
            <p>
              {{ t('identity.methods') }}:
              {{
                session.state.value.security.authentication.amr
                  .map((m) => t('identity.method_' + m))
                  .join(' · ') || t('identity.noMethods')
              }}
            </p>
            <p v-if="!session.state.value.security.eligibleStepUpProviders.length">
              {{ t('identity.noStepUp') }}
            </p>
            <UiButton
              v-for="p in session.state.value.security.eligibleStepUpProviders"
              :key="p.providerId"
              :disabled="!!busy"
              type="submit"
              @click="stepUp(p.providerId)"
            >
              {{ t('identity.stepUp') }} · {{ p.label }}
            </UiButton>
          </template>
          <UiButton
            :disabled="!!(busy || !owner)"
            type="submit"
            @click="run(() => session.loadSecurity())"
          >
            {{ t('identity.reloadSecurity') }}
          </UiButton>
        </section>
        <details
          v-if="session.state.value.identity?.hasLocalPassword"
          class="auth-task"
          @toggle="clearClosedSecrets"
        >
          <summary>{{ t('identity.changePassword') }}</summary>
          <form @submit.prevent="change">
            <h2>{{ t('identity.changePassword') }}</h2>
            <label for="current-password">{{ t('identity.currentPassword') }}</label
            ><input
              id="current-password"
              v-model="current"
              class="ui-input"
              type="password"
              autocomplete="current-password"
              required
            /><label for="new-password">{{ t('identity.newPassword') }}</label
            ><input
              id="new-password"
              v-model="password"
              class="ui-input"
              type="password"
              autocomplete="new-password"
              minlength="15"
              required
            /><UiButton type="submit" :disabled="!!busy">{{
              t('identity.changePassword')
            }}</UiButton>
          </form>
        </details>
        <details
          v-if="session.state.value.identity?.hasLocalPassword"
          class="auth-task"
          @toggle="clearClosedSecrets"
        >
          <summary>{{ t('identity.reauthenticate') }}</summary>
          <form @submit.prevent="reauthenticate">
            <h2>{{ t('identity.reauthenticate') }}</h2>
            <label for="reauth-password">{{ t('identity.currentPassword') }}</label>
            <input
              id="reauth-password"
              v-model="reauthPassword"
              class="ui-input"
              type="password"
              autocomplete="current-password"
              required
            />
            <UiButton :disabled="!!busy" type="submit">{{ t('identity.reauthenticate') }}</UiButton>
          </form>
        </details>
        <details
          v-if="session.config.oidcEnabled && providers.length"
          class="auth-task"
          @toggle="clearClosedSecrets"
        >
          <summary>{{ t('identity.linkProvider') }}</summary>
          <form @submit.prevent="link">
            <h2>{{ t('identity.linkProvider') }}</h2>
            <label for="link-provider">{{ t('identity.providers') }}</label>
            <select id="link-provider" v-model="selectedProvider" class="ui-input" required>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
            <template v-if="session.state.value.identity?.hasLocalPassword">
              <label for="link-password">{{ t('identity.currentPassword') }}</label>
              <input
                id="link-password"
                v-model="linkPassword"
                class="ui-input"
                type="password"
                autocomplete="current-password"
                required
              />
            </template>
            <UiButton :disabled="!!busy" type="submit">{{ t('identity.linkProvider') }}</UiButton>
          </form>
        </details></template
      ></UiTabs
    >
    <UiDialog
      :open="confirmAll"
      :title="t('identity.logoutAll')"
      :description="t('identity.logoutHelp')"
      :close-label="t('identity.cancel')"
      kind="alertdialog"
      @update:open="confirmAll = $event"
      ><template #footer
        ><UiButton :disabled="busy || !owner" @click="submitConfirmed">{{
          t('identity.confirm')
        }}</UiButton></template
      ></UiDialog
    >
  </section>
</template>
