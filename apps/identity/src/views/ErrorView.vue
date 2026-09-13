<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIdentity } from '../context'
import { uuid } from '../services/decode'
import { operationQuery } from '../services/navigation'
const { t } = useI18n()
const route = useRoute()
const { session, flows } = useIdentity()
const pending = flows.read()
flows.clear()
let queryTenant: string | null = null
try {
  queryTenant = uuid(route.query['tenant'])
} catch {
  /* no valid route locator */
}
const tenant = pending?.tenant ?? queryTenant ?? session.state.value.tenant
const operation = pending?.operation ?? operationQuery(route.query).operation
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
    <p v-if="operation">{{ t('identity.operationId') }}: {{ operation }}</p>
    <RouterLink
      v-if="tenant"
      :to="{ name: 'login', params: { tenant }, query: operation ? { operation } : {} }"
      >{{ t('identity.login') }}</RouterLink
    >
  </section>
</template>
