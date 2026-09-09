<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '../context'
const { t } = useI18n()
const route = useRoute()
const { session, flows } = useIdentity()
const pending = flows.read()
flows.clear()
const tenant = pending?.tenant ?? session.state.value.tenant
const reason = computed(() =>
  ['cancelled', 'unavailable', 'failed'].includes(String(route.query['reason']))
    ? String(route.query['reason'])
    : 'entry',
)
</script>
<template>
  <section class="identity-card" aria-labelledby="error-title">
    <h1 id="error-title">{{ t(`identity.${reason}`) }}</h1>
    <p>{{ t('identity.restartHelp') }}</p>
    <RouterLink v-if="tenant" :to="{ name: 'login', params: { tenant } }">{{
      t('identity.login')
    }}</RouterLink>
  </section>
</template>
