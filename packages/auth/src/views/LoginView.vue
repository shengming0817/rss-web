<script setup lang="ts">
import { UiButton } from '@rss/core/components'
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
