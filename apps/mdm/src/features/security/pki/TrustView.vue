<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiTabs } from '@rss/core/components'
import { useMdm } from '../../../context'
import PageFrame from '../../../components/PageFrame.vue'
import TrustPurpose from './TrustPurpose.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  purpose = ref('agent')
const purposes = ['agent', 'windows', 'apple'] as const
</script>
<template>
  <PageFrame :title="t('security.pki.title')"
    ><template #actions
      ><RouterLink :to="{ name: 'security-recovery', params: { tenant: runtime.tenant } }">{{
        t('security.pki.recover')
      }}</RouterLink></template
    >
    <p>{{ t('security.pki.hint') }}</p>
    <UiTabs
      v-model="purpose"
      :label="t('security.pki.purpose')"
      :items="purposes.map((value) => ({ value, label: t(`security.pki.${value}`) }))"
    >
      <template v-for="value in purposes" :key="value" #[value]
        ><TrustPurpose :purpose="value"
      /></template>
    </UiTabs>
  </PageFrame>
</template>
