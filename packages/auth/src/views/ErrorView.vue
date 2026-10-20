<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIdentity, loginTarget } from '../context'
import { uuid } from '../services/decode'
const { t } = useI18n()
const route = useRoute()
const { session, flows, hostLogin: host } = useIdentity()
const pending = flows.read()
flows.clear()
let queryTenant: string | null = null
try {
  queryTenant = uuid(route.query['tenant'])
} catch {
  /* no valid route locator */
}
const tenant = pending?.tenant ?? queryTenant ?? session.state.value.tenant
const reason = computed(() =>
  ['cancelled', 'unavailable', 'failed'].includes(String(route.query['reason']))
    ? String(route.query['reason'])
    : 'entry',
)
</script>
<template>
  <section class="auth-page" aria-labelledby="error-title">
    <h1 id="error-title">{{ t(`identity.${reason}`) }}</h1>
    <p>{{ t('identity.restartHelp') }}</p>
    <RouterLink v-if="tenant" :to="loginTarget(tenant, host)">{{ t('identity.login') }}</RouterLink>
  </section>
</template>
