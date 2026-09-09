<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import { isRssApiError } from '@rss/api/identity'
import { uuid } from '../services/decode'
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { session, api, flows } = useIdentity()
const { busy, error, run, checkpoint } = useOperation()
const tenant = ref('')
const login = ref('')
const password = ref('')
const providers = ref<{ id: string; label: string }[]>([])
async function failFlow(failure: unknown) {
  checkpoint()
  flows.clear()
  await router.replace({
    name: 'error',
    query: { reason: isRssApiError(failure) && failure.status === 503 ? 'unavailable' : 'failed' },
  })
}
async function continueFlow() {
  checkpoint()
  const pending = flows.take()
  if (pending && pending.kind !== 'sso' && pending.flow) {
    try {
      const location = await api.accept(pending.kind, pending.challenge, pending.flow)
      checkpoint()
      window.location.assign(location)
    } catch (failure) {
      await failFlow(failure)
    }
  } else if (route.name === 'hydra-login' || route.name === 'hydra-consent') {
    await failFlow(new Error('Flow expired'))
  } else await router.replace({ name: 'sessions', params: { tenant: tenant.value } })
}
async function submit() {
  const secret = password.value
  password.value = ''
  await run(async () => {
    await session.login(tenant.value, login.value, secret)
    await continueFlow()
  })
}
async function sso(id: string) {
  await run(async () => {
    if (!flows.read()) flows.save({ kind: 'sso', tenant: tenant.value, challenge: '', flow: null })
    try {
      const location = await api.beginSso(tenant.value, id)
      checkpoint()
      window.location.assign(location)
    } catch (failure) {
      checkpoint()
      flows.clear()
      throw failure
    }
  })
}
onMounted(() => {
  void run(async () => {
    try {
      if (route.name === 'resume') {
        const pending = flows.read()
        if (!pending) throw new Error('Flow expired')
        tenant.value = pending.tenant
        await session.check(tenant.value)
        checkpoint()
        if (session.state.value.status !== 'authenticated') {
          flows.clear()
          throw new Error('Session unavailable')
        }
        await continueFlow()
        return
      }
      if (route.name === 'hydra-login' || route.name === 'hydra-consent') {
        const kind = route.name === 'hydra-login' ? 'login' : 'consent'
        const challenge = route.query[`${kind}_challenge`]
        window.history.replaceState(null, '', route.path)
        flows.clear()
        if (typeof challenge !== 'string' || !challenge || challenge.length > 8192)
          throw new Error('Invalid challenge')
        const value = await api.prepare(kind, challenge)
        checkpoint()
        tenant.value = value.tenant_id
        flows.save({ kind, tenant: value.tenant_id, challenge, flow: value })
      } else tenant.value = uuid(route.params['tenant'])
      await session.check(tenant.value)
      checkpoint()
      const options = await api.loginOptions(tenant.value)
      checkpoint()
      providers.value = options
    } catch (failure) {
      if (['resume', 'hydra-login', 'hydra-consent'].includes(String(route.name)))
        await failFlow(failure)
      else throw failure
    }
  })
})
</script>
<template>
  <section class="identity-card identity-login" aria-labelledby="login-title">
    <p class="identity-eyebrow">RSS Identity</p>
    <h1 id="login-title">{{ t('identity.login') }}</h1>
    <p>{{ t('identity.loginDescription') }}</p>
    <p v-if="route.query['reason'] === 'expired'" role="status">{{ t('identity.expired') }}</p>
    <p v-if="error" role="alert">{{ t(`identity.errors.${error}`) }}</p>
    <template
      v-if="session.state.value.status === 'authenticated' && session.state.value.tenant === tenant"
    >
      <button class="btn btn-primary" :disabled="busy" @click="run(continueFlow)">
        {{ t('identity.continue') }}
      </button>
    </template>
    <form v-else-if="tenant" @submit.prevent="submit">
      <label for="login-name">{{ t('identity.username') }}</label
      ><input id="login-name" v-model="login" autocomplete="username" required :disabled="busy" />
      <label for="login-password">{{ t('identity.password') }}</label
      ><input
        id="login-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
        :disabled="busy"
      />
      <button class="btn btn-primary" type="submit" :disabled="busy">
        {{ t('identity.login') }}
      </button>
    </form>
    <div class="identity-actions">
      <button v-for="p in providers" :key="p.id" class="btn" :disabled="busy" @click="sso(p.id)">
        {{ t('identity.sso') }} · {{ p.label }}
      </button>
    </div>
    <p class="identity-muted">{{ t('identity.recoveryHelp') }}</p>
  </section>
</template>
