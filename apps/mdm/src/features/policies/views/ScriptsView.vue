<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import PolicyFrame from '../components/PolicyFrame.vue'
const { t } = useI18n(),
  runtime = useMdm()
</script>
<template>
  <PolicyFrame :title="t('policies.scripts')">
    <p>{{ t('policies.scriptAssignment') }}</p>
    <RouterLink :to="{ name: 'policy-resources', params: { tenant: runtime.tenant } }">{{
      t('policies.resources')
    }}</RouterLink>
    <RouterLink :to="{ name: 'policy-policies', params: { tenant: runtime.tenant } }">{{
      t('policies.policies')
    }}</RouterLink>
    <RouterLink :to="{ name: 'policy-workflows', params: { tenant: runtime.tenant } }">{{
      t('policies.generalQuery')
    }}</RouterLink>
  </PolicyFrame>
</template>
