<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import PageFrame from '../../../components/PageFrame.vue'
import MaterialPanel from '../components/MaterialPanel.vue'
const route = useRoute(),
  runtime = useMdm(),
  { t } = useI18n()
</script>
<template>
  <PageFrame :title="t('settings.title')"
    ><RouterLink :to="{ name: 'settings-overview', params: { tenant: runtime.tenant } }">{{
      t('settings.overview')
    }}</RouterLink
    ><MaterialPanel :material="String(route.params['material'])"
  /></PageFrame>
</template>
