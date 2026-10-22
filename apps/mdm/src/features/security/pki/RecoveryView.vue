<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import PageFrame from '../../../components/PageFrame.vue'
import WindowsRecovery from './WindowsRecovery.vue'
const { t } = useI18n(),
  runtime = useMdm()
</script>
<template>
  <PageFrame :title="t('security.pki.recover')"
    ><template #actions
      ><RouterLink :to="{ name: 'security-device-trust', params: { tenant: runtime.tenant } }">{{
        t('security.pki.title')
      }}</RouterLink></template
    >
    <p>{{ t('security.recovery.hint') }}</p>
    <WindowsRecovery
  /></PageFrame>
</template>
