<script setup lang="ts">
import { VBtn } from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import { useIdentityError } from '@rss/auth'
import MdmPage from '../../../ui/MdmPage.vue'
const { t } = useI18n()
const { reason, tenant, host, loginTarget } = useIdentityError()
</script>
<template>
  <MdmPage :title="t(`identity.${reason}`)" :description="t('identity.restartHelp')">
    <VBtn v-if="tenant" color="primary" :to="loginTarget(tenant, host)">{{
      t('identity.login')
    }}</VBtn>
  </MdmPage>
</template>
