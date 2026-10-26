<script setup lang="ts">
import { useLoginFlow } from '@rss/auth'
import Icon from '../ui/Icon.vue'
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
  <main class="login-layout">
    <section class="login-story">
      <div class="wordmark">
        <span class="brand-symbol"><Icon name="shield" /></span>RSS <span>DEVICE ACCESS</span>
      </div>
      <div>
        <p class="eyebrow">ONE IDENTITY. EVERY WORKDAY.</p>
        <h1>{{ $t('da.m818878d0c0') }}<br />{{ $t('da.mec6e172a00') }}</h1>
        <p class="login-copy">{{ $t('da.md8f0a12239') }}</p>
      </div>
      <p class="small">RSS Device Access</p>
    </section>
    <section class="login-form">
      <div class="login-inner">
        <h2>{{ $t('da.m54295583ac') }}</h2>
        <p class="muted">{{ $t('da.mbffdaea9ee') }}</p>
        <v-alert v-if="session.invalidated.value" type="warning" :icon="false" class="mb-4">{{
          $t('da.m9969922ff8')
        }}</v-alert
        ><v-alert v-if="error" type="error" :icon="false" class="mb-4">{{ errorMessage }}</v-alert
        ><v-btn
          v-if="
            session.state.value.status === 'authenticated' && session.state.value.tenant === tenant
          "
          block
          color="primary"
          :loading="busy"
          @click="run(continueFlow)"
          >{{ $t('da.m78b8716746') }}</v-btn
        >
        <form v-else-if="tenant" @submit.prevent="submit">
          <v-text-field
            v-model="login"
            :label="$t('da.m9013849179')"
            autocomplete="username"
            :disabled="busy"
            required
            class="mb-4"
          /><v-text-field
            v-model="password"
            :label="$t('da.mc839a8ff17')"
            autocomplete="current-password"
            type="password"
            :disabled="busy"
            required
            class="mb-5"
          /><v-btn type="submit" color="primary" block :loading="busy">{{
            $t('da.m21f1e88275')
          }}</v-btn>
        </form>
        <v-btn
          v-for="provider in providers"
          :key="provider.id"
          variant="outlined"
          block
          class="mt-4"
          :disabled="busy"
          @click="sso(provider.id)"
          >企业 SSO · {{ provider.label }}</v-btn
        >
        <p class="small muted mt-7">{{ host?.origin }}</p>
        <p class="login-note">{{ $t('da.m162321586c') }}</p>
      </div>
    </section>
  </main>
</template>
