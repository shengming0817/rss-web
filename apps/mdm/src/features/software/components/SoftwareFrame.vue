<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
defineProps<{ title: string; busy?: boolean; failure?: string | null }>()
const { t } = useI18n(),
  runtime = useMdm()
</script>
<template>
  <section class="device-console" :aria-busy="busy">
    <nav class="device-actions" :aria-label="t('software.title')">
      <RouterLink :to="{ name: 'software-bootstrap', params: { tenant: runtime.tenant } }">{{
        t('software.bootstrap')
      }}</RouterLink>
      <RouterLink :to="{ name: 'software-updates', params: { tenant: runtime.tenant } }">{{
        t('software.updates')
      }}</RouterLink>
      <RouterLink :to="{ name: 'software-self-service', params: { tenant: runtime.tenant } }">{{
        t('software.selfService')
      }}</RouterLink>
      <RouterLink :to="{ name: 'software-deployments', params: { tenant: runtime.tenant } }">{{
        t('software.deployments')
      }}</RouterLink>
      <RouterLink :to="{ name: 'software-imports', params: { tenant: runtime.tenant } }">{{
        t('software.imports')
      }}</RouterLink>
      <RouterLink :to="{ name: 'software-catalog', params: { tenant: runtime.tenant } }">{{
        t('software.catalog')
      }}</RouterLink>
      <RouterLink :to="{ name: 'software-sources', params: { tenant: runtime.tenant } }">{{
        t('software.sources')
      }}</RouterLink>
      <RouterLink :to="{ name: 'software-publications', params: { tenant: runtime.tenant } }">{{
        t('software.publications')
      }}</RouterLink>
      <RouterLink :to="{ name: 'policy-resources', params: { tenant: runtime.tenant } }">{{
        t('policies.resources')
      }}</RouterLink>
      <RouterLink :to="{ name: 'policy-scopes', params: { tenant: runtime.tenant } }">{{
        t('policies.scopes')
      }}</RouterLink>
      <RouterLink :to="{ name: 'policy-executions', params: { tenant: runtime.tenant } }">{{
        t('policies.executions')
      }}</RouterLink>
    </nav>
    <h1>{{ title }}</h1>
    <p v-if="runtime.demo" class="mdm-source">{{ t('mdm.mock') }} · {{ t('devices.noEffect') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <slot />
  </section>
</template>
