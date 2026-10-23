<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '../context'
import { useOperation } from '../services/operation'
import { uuid } from '../services/decode'
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { session, api, flows, landingTarget, hostLogin: host } = useIdentity()
const { busy, error, errorMessage, run, checkpoint } = useOperation()
const tenant = ref('')
const login = ref('')
const password = ref('')
const providers = ref<{ id: string; label: string }[]>([])
async function continueFlow() {
  checkpoint()
  flows.clear()
  await router.replace(
    landingTarget?.(tenant.value) ?? { name: 'sessions', params: { tenant: tenant.value } },
  )
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
      if (host && tenant.value !== host.tenant) {
        await router.replace({ name: 'error' })
        return
      }
      await session.check(tenant.value)
      checkpoint()
      if (session.state.value.status !== 'authenticated') {
        await router.replace({ name: 'error' })
        return
      }
      await continueFlow()
      return
    }
    tenant.value = uuid(host?.tenant ?? route.params['tenant'])
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
  <section class="auth-page auth-login" aria-labelledby="login-title">
    <p class="auth-eyebrow">{{ host?.brand ?? 'RSS Identity' }}</p>
    <h1 id="login-title">{{ t('identity.login') }}</h1>
    <p>{{ t(host?.descriptionKey ?? 'identity.loginDescription') }}</p>
    <p v-if="session.invalidated.value" role="status">{{ t('identity.expired') }}</p>
    <p v-if="error" role="alert">{{ errorMessage }}</p>
    <template
      v-if="session.state.value.status === 'authenticated' && session.state.value.tenant === tenant"
    >
      <UiButton class="btn btn-primary" :disabled="!!busy" type="submit" @click="run(continueFlow)">
        {{ t('identity.continue') }}
      </UiButton>
    </template>
    <form v-else-if="tenant" @submit.prevent="submit">
      <label for="login-name">{{ t('identity.username') }}</label
      ><input
        id="login-name"
        v-model="login"
        class="ui-input"
        autocomplete="username"
        required
        :disabled="busy"
      />
      <label for="login-password">{{ t('identity.password') }}</label
      ><input
        id="login-password"
        v-model="password"
        class="ui-input"
        type="password"
        autocomplete="current-password"
        required
        :disabled="busy"
      />
      <UiButton class="btn btn-primary" type="submit" :disabled="!!busy">
        {{ t('identity.login') }}
      </UiButton>
    </form>
    <div class="auth-actions">
      <UiButton
        v-for="p in providers"
        :key="p.id"
        class="btn"
        :disabled="!!busy"
        type="submit"
        @click="sso(p.id)"
      >
        {{ t('identity.sso') }} · {{ p.label }}
      </UiButton>
    </div>
    <p v-if="host" class="auth-muted">{{ host.origin }}</p>
    <a v-if="host" :href="host.switchHref">{{ t(host.switchLabelKey) }}</a>
    <p class="auth-muted">{{ t('identity.recoveryHelp') }}</p>
  </section>
</template>
