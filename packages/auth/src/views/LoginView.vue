<script setup lang="ts">
import { VBtn, VTextField } from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import { useLoginFlow } from '../useLoginFlow'
const { t } = useI18n()
const {
  session,
  host,
  tenant,
  login,
  password,
  providers,
  busy,
  error,
  errorMessage,
  submit,
  sso,
  continueFlow,
  run,
} = useLoginFlow()
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
      <VBtn color="primary" :disabled="!!busy" type="submit" @click="run(continueFlow)">
        {{ t('identity.continue') }}
      </VBtn>
    </template>
    <form v-else-if="tenant" @submit.prevent="submit">
      <VTextField
        id="login-name"
        v-model="login"
        autocomplete="username"
        required
        :disabled="busy"
        :label="t('identity.username')"
      />
      <VTextField
        id="login-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
        :disabled="busy"
        :label="t('identity.password')"
      />
      <VBtn color="primary" type="submit" :disabled="!!busy">
        {{ t('identity.login') }}
      </VBtn>
    </form>
    <div class="auth-actions">
      <VBtn
        v-for="p in providers"
        :key="p.id"
        variant="outlined"
        :disabled="!!busy"
        type="submit"
        @click="sso(p.id)"
      >
        {{ t('identity.sso') }} · {{ p.label }}
      </VBtn>
    </div>
    <p v-if="host" class="auth-muted">{{ host.origin }}</p>
    <a v-if="host" :href="host.switchHref">{{ t(host.switchLabelKey) }}</a>
    <p class="auth-muted">{{ t('identity.recoveryHelp') }}</p>
  </section>
</template>
