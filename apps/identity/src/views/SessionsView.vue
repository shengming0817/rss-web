<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import type { Session } from '../services/decode'
const { t } = useI18n()
const router = useRouter()
const { session, api, flows } = useIdentity()
const { busy, error, run, checkpoint } = useOperation()
const rows = ref<Session[]>([])
const next = ref<string | null>(null)
const current = ref('')
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
onMounted(() => {
  document.addEventListener('visibilitychange', visible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', visible))
function visible() {
  if (document.visibilityState === 'visible' && !busy.value)
    void run(async () => {
      const tenant = session.state.value.tenant
      if (tenant) {
        await session.check(tenant)
        checkpoint()
      }
    })
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
    await router.replace({ name: 'login', params: { tenant: session.state.value.tenant } })
  })
}
async function logout(all: boolean) {
  const tenant = session.state.value.tenant
  flows.clear()
  await run(() => session.logout(all))
  await router.replace({ name: 'login', params: { tenant } })
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
</script>
<template>
  <section class="identity-card">
    <h1>{{ t('identity.sessions') }}</h1>
    <section v-if="session.config.oidcEnabled" aria-labelledby="security-title">
      <h2 id="security-title">{{ t('identity.authentication') }}</h2>
      <template v-if="session.state.value.security">
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
        <button
          v-for="p in session.state.value.security.eligibleStepUpProviders"
          :key="p.providerId"
          :disabled="busy"
          @click="stepUp(p.providerId)"
        >
          {{ t('identity.stepUp') }} · {{ p.label }}
        </button>
      </template>
      <button :disabled="busy" @click="run(() => session.loadSecurity())">
        {{ t('identity.reloadSecurity') }}
      </button>
    </section>
    <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <div class="identity-actions">
      <button :disabled="busy" @click="run(() => load())">{{ t('identity.reload') }}</button
      ><button :disabled="busy" @click="logout(false)">{{ t('identity.logout') }}</button
      ><button :disabled="busy" @click="logout(true)">{{ t('identity.logoutAll') }}</button>
    </div>
    <div class="identity-table">
      <table>
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
    <button v-if="next" :disabled="busy" @click="run(() => load(next ?? undefined))">
      {{ t('identity.more') }}
    </button>
    <form v-if="session.state.value.identity?.hasLocalPassword" @submit.prevent="change">
      <h2>{{ t('identity.changePassword') }}</h2>
      <label for="current-password">{{ t('identity.currentPassword') }}</label
      ><input
        id="current-password"
        v-model="current"
        type="password"
        autocomplete="current-password"
        required
      /><label for="new-password">{{ t('identity.newPassword') }}</label
      ><input
        id="new-password"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="15"
        required
      /><button type="submit" :disabled="busy">{{ t('identity.changePassword') }}</button>
    </form>
    <form v-if="session.state.value.identity?.hasLocalPassword" @submit.prevent="reauthenticate">
      <h2>{{ t('identity.reauthenticate') }}</h2>
      <label for="reauth-password">{{ t('identity.currentPassword') }}</label>
      <input
        id="reauth-password"
        v-model="reauthPassword"
        type="password"
        autocomplete="current-password"
        required
      />
      <button :disabled="busy">{{ t('identity.reauthenticate') }}</button>
    </form>
    <form v-if="session.config.oidcEnabled && providers.length" @submit.prevent="link">
      <h2>{{ t('identity.linkProvider') }}</h2>
      <label for="link-provider">{{ t('identity.providers') }}</label>
      <select id="link-provider" v-model="selectedProvider" required>
        <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.label }}</option>
      </select>
      <template v-if="session.state.value.identity?.hasLocalPassword">
        <label for="link-password">{{ t('identity.currentPassword') }}</label>
        <input
          id="link-password"
          v-model="linkPassword"
          type="password"
          autocomplete="current-password"
          required
        />
      </template>
      <button :disabled="busy">{{ t('identity.linkProvider') }}</button>
    </form>
    <p class="identity-muted">{{ t('identity.logoutHelp') }}</p>
  </section>
</template>
