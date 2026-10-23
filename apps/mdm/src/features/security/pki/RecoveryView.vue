<script setup lang="ts">
import { ref } from 'vue'
import { UiTabs } from '@rss/core/components'
import AgentRecovery from './AgentRecovery.vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import PageFrame from '../../../components/PageFrame.vue'
import WindowsRecovery from './WindowsRecovery.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  kind = ref('registration')
</script>
<template>
  <PageFrame :title="t('security.pki.recover')"
    ><template #actions
      ><RouterLink :to="{ name: 'security-device-trust', params: { tenant: runtime.tenant } }">{{
        t('security.pki.title')
      }}</RouterLink></template
    >
    <p>{{ t('security.recovery.hint') }}</p>
    <UiTabs
      v-model="kind"
      :label="t('security.pki.recover')"
      :items="[
        { value: 'registration', label: t('security.recovery.registration') },
        { value: 'issuance', label: t('security.recovery.issuance') },
        { value: 'windows', label: t('security.recovery.windows') },
      ]"
    >
      <template #registration><AgentRecovery kind="registration" /></template
      ><template #issuance><AgentRecovery kind="issuance" /></template
      ><template #windows><WindowsRecovery /></template> </UiTabs
  ></PageFrame>
</template>
