<script setup lang="ts">
import { computed, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { VTabs, VTab, VAlert } from 'vuetify/components'
import MdmPage from '../../../ui/MdmPage.vue'
import DeviceGroupsPanel from '../components/DeviceGroupsPanel.vue'
import UserGroupsPanel from '../components/UserGroupsPanel.vue'
import { groupMessages } from '../group-i18n'
const { t } = useI18n({ useScope: 'local', messages: groupMessages })
const route = useRoute(),
  router = useRouter()
const locked = ref(false)
onBeforeRouteUpdate((to, from) => to.fullPath === from.fullPath || !locked.value)
onBeforeRouteLeave(() => !locked.value)
const categories = ['device-dynamic', 'device-static', 'user-dynamic', 'user-static'] as const
const category = computed({
  get: () => categories.find((value) => value === route.query['category']) ?? 'device-dynamic',
  set: (value) => {
    if (locked.value) return
    void router.push({ query: { ...route.query, category: value } })
  },
})
</script>
<template>
  <MdmPage :title="t('groupModule.title')" :description="t('groupModule.boundary')">
    <v-tabs v-model="category" :aria-label="t('groupModule.title')"
      ><v-tab
        v-for="value in categories"
        :key="value"
        :value="value"
        :disabled="locked && value !== category"
        >{{ t('groupModule.' + value) }}</v-tab
      ></v-tabs
    >
    <DeviceGroupsPanel
      v-if="category === 'device-dynamic' || category === 'device-static'"
      :key="category"
      :group-kind="category === 'device-dynamic' ? 'dynamic' : 'static'"
      @locked="locked = $event"
    />
    <UserGroupsPanel v-else-if="category === 'user-static'" @locked="locked = $event" />
    <v-alert v-else type="info" variant="tonal">{{ t('groupModule.dynamicUnavailable') }}</v-alert>
  </MdmPage>
</template>
