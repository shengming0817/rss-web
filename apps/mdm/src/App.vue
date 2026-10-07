<script setup lang="ts">
import { AuthShell } from '@rss/auth'
import { useI18n } from 'vue-i18n'
import { useMdm } from './context'
const { t } = useI18n()
const { tenant } = useMdm()
import { usePermission } from './features/enrollment/usePermission'
const { canRead: canManageAgent } = usePermission('agent_enrollment_read', 'agent_enrollment_write')
</script>
<template>
  <AuthShell product="MDM">
    <template #navigation>
      <RouterLink
        v-if="canManageAgent"
        :to="{ name: 'agent-configurations', params: { tenant } }"
        >{{ t('onboarding.configurations') }}</RouterLink
      >
      <RouterLink :to="{ name: 'agent-downloads' }">{{ t('onboarding.downloads') }}</RouterLink>
      <RouterLink :to="{ name: 'workspace', params: { tenant } }">{{ t('mdm.home') }}</RouterLink>
      <RouterLink :to="{ name: 'self-enrollments', params: { tenant } }">{{
        t('registration.self')
      }}</RouterLink>
      <RouterLink :to="{ name: 'registration-quotas', params: { tenant } }">{{
        t('registration.quotas')
      }}</RouterLink>
      <RouterLink :to="{ name: 'registration-users', params: { tenant } }">{{
        t('registration.user')
      }}</RouterLink>
    </template>
  </AuthShell>
</template>
