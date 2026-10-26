<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useIdentityError } from '../useIdentityError'
const { t } = useI18n()
const { reason, tenant, host, loginTarget } = useIdentityError()
</script>
<template>
  <section class="auth-page" aria-labelledby="error-title">
    <h1 id="error-title">{{ t(`identity.${reason}`) }}</h1>
    <p>{{ t('identity.restartHelp') }}</p>
    <RouterLink v-if="tenant" :to="loginTarget(tenant, host)">{{ t('identity.login') }}</RouterLink>
  </section>
</template>
