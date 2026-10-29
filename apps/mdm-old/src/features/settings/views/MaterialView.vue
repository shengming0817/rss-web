<script setup lang="ts">
import { VBtn } from 'vuetify/components'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import MdmPage from '../../../ui/MdmPage.vue'
import MaterialPanel from '../components/MaterialPanel.vue'
const route = useRoute(),
  runtime = useMdm(),
  { t } = useI18n()
</script>
<template>
  <MdmPage :title="t('settings.title')"
    ><VBtn :to="{ name: 'settings-overview', params: { tenant: runtime.tenant } }" variant="text">{{
      t('settings.overview')
    }}</VBtn
    ><MaterialPanel :material="String(route.params['material'])"
  /></MdmPage>
</template>
