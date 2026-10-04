<script setup lang="ts">
import { AuthShell } from '@rss/auth'
import { useI18n } from 'vue-i18n'
import { useMdm } from './context'
const { t } = useI18n()
const { tenant } = useMdm()
</script>
<template>
  <AuthShell product="MDM">
    <template #navigation>
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
