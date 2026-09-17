<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
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
async function continueFlow() {
  checkpoint()
  flows.clear()
  await router.replace({ name: 'sessions', params: { tenant: tenant.value } })
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
    flows.save({ kind: 'sso', tenant: tenant.value })
    try {
      const location = await api.beginSso(tenant.value, id)
      checkpoint()
      window.location.assign(location)
    } catch (failure) {
      flows.clear()
      throw failure
    }
  })
}
onMounted(() => {
  void run(async () => {
    if (route.name === 'resume') {
      const pending = flows.take()
      if (!pending || !session.config.oidcEnabled) {
        await router.replace({ name: 'error' })
        return
      }
      tenant.value = pending.tenant
      await session.check(tenant.value)
      checkpoint()
      if (session.state.value.status !== 'authenticated') {
        await router.replace({ name: 'error' })
        return
      }
      await continueFlow()
      return
    }
    tenant.value = uuid(route.params['tenant'])
    await session.check(tenant.value)
    checkpoint()
    if (session.config.oidcEnabled) {
      providers.value = await api.loginOptions(tenant.value)
      checkpoint()
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
