<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { VTabs, VTab, VAlert } from 'vuetify/components'
import MdmPage from '../../../ui/MdmPage.vue'
import DeviceGroupsPanel from '../components/DeviceGroupsPanel.vue'
import UserGroupsPanel from '../components/UserGroupsPanel.vue'
import { groupMessages } from '../group-i18n'
const { t } = useI18n({ useScope: 'local', messages: groupMessages })
const route = useRoute(),
  router = useRouter()
const categories = ['device-dynamic', 'device-static', 'user-dynamic', 'user-static'] as const
const category = computed({
  get: () => categories.find((value) => value === route.query['category']) ?? 'device-dynamic',
  set: (value) => {
    void router.push({ query: { ...route.query, category: value } })
  },
})
</script>
<template>
  <MdmPage :title="t('groupModule.title')" :description="t('groupModule.boundary')">
    <v-tabs v-model="category" :aria-label="t('groupModule.title')"
      ><v-tab v-for="value in categories" :key="value" :value="value">{{
        t('groupModule.' + value)
      }}</v-tab></v-tabs
    >
    <DeviceGroupsPanel
      v-if="category === 'device-dynamic' || category === 'device-static'"
      :key="category"
      :group-kind="category === 'device-dynamic' ? 'dynamic' : 'static'"
    />
    <UserGroupsPanel v-else-if="category === 'user-static'" />
    <v-alert v-else type="info" variant="tonal">{{ t('groupModule.dynamicUnavailable') }}</v-alert>
  </MdmPage>
</template>
