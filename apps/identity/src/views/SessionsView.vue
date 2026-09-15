<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import { operationQuery } from '../services/navigation'
import type { Session } from '../services/decode'
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { session, api, flows } = useIdentity()
const { busy, error, run, checkpoint } = useOperation()
const rows = ref<Session[]>([])
const next = ref<string | null>(null)
const current = ref('')
const password = ref('')
const owner = computed(() =>
  session.state.value.status === 'authenticated'
    ? [
        session.state.value.tenant,
        session.state.value.identity?.principal_id,
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
      challenge: '',
      flow: null,
      operation: operationQuery(route.query).operation ?? null,
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
  const query = operationQuery(route.query)
  const old = current.value
  const value = password.value
  current.value = ''
  password.value = ''
  await run(async () => {
    await api.ownPassword(old, value)
    flows.clear()
    await router.replace({ name: 'login', params: { tenant: session.state.value.tenant }, query })
  })
}
async function logout(all: boolean) {
  const tenant = session.state.value.tenant
  const query = operationQuery(route.query)
  flows.clear()
  await run(() => session.logout(all))
  await router.replace({ name: 'login', params: { tenant }, query })
}
</script>
<template>
  <section class="identity-card">
    <h1>{{ t('identity.sessions') }}</h1>
    <section aria-labelledby="security-title">
      <h2 id="security-title">{{ t('identity.authentication') }}</h2>
      <template v-if="session.state.value.security">
        <p>
          {{ t('identity.authTime') }}:
          {{
            new Date(session.state.value.security.authentication.auth_time * 1000).toLocaleString()
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
        <p v-if="!session.state.value.security.eligible_step_up_providers.length">
          {{ t('identity.noStepUp') }}
        </p>
        <button
          v-for="p in session.state.value.security.eligible_step_up_providers"
          :key="p.provider_id"
          :disabled="busy"
          @click="stepUp(p.provider_id)"
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
            <td>{{ new Date(row.idle_expires_at * 1000).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="next" :disabled="busy" @click="run(() => load(next ?? undefined))">
      {{ t('identity.more') }}
    </button>
    <form v-if="session.state.value.identity?.has_local_password" @submit.prevent="change">
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
    <p class="identity-muted">{{ t('identity.logoutHelp') }}</p>
  </section>
</template>
