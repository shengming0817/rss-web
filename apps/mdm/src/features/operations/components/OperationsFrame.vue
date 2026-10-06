<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
defineProps<{ title: string; busy?: boolean; failure?: string | null }>()
const { t } = useI18n(),
  runtime = useMdm()
</script>
<template>
  <section class="device-console" :aria-busy="busy">
    <nav class="device-actions" :aria-label="t('operations.navigation')">
      <RouterLink
        v-for="name in [
          'organization',
          'appleAccount',
          'appleAde',
          'windowsEntra',
          'authorization',
          'audit',
          'reports',
          'alerts',
          'alertRules',
          'integrations',
          'settings',
          'approvals',
        ]"
        :key="name"
        :to="{ name: `operations-${name}`, params: { tenant: runtime.tenant } }"
        >{{
          t(
            ['appleAccount', 'appleAde', 'windowsEntra'].includes(name)
              ? `onboarding.${name}`
              : `operations.${name}`,
          )
        }}</RouterLink
      >
    </nav>
    <h1>{{ title }}</h1>
    <p v-if="runtime.demo" class="mdm-source">{{ t('mdm.mock') }} · {{ t('devices.noEffect') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <slot />
  </section>
</template>
