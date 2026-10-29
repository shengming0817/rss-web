<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VTab, VTabs, VWindow, VWindowItem } from 'vuetify/components'
import MdmPage from '../../../ui/MdmPage.vue'
import TrustPurpose from './TrustPurpose.vue'
const { t } = useI18n(),
  purpose = ref('agent')
const purposes = ['agent', 'windows', 'apple'] as const
</script>
<template>
  <MdmPage :title="t('security.pki.title')" :description="t('security.pki.hint')">
    <v-tabs v-model="purpose" :aria-label="t('security.pki.purpose')"
      ><v-tab v-for="value in purposes" :key="value" :value="value">{{
        t(`security.pki.${value}`)
      }}</v-tab></v-tabs
    >
    <v-window v-model="purpose" class="mt-4"
      ><v-window-item v-for="value in purposes" :key="value" :value="value"
        ><TrustPurpose :purpose="value" /></v-window-item
    ></v-window>
  </MdmPage>
</template>
