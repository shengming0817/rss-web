<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionLifecycle } from '@rss/auth'
import { useDa } from './context'
import WorkspaceLayout from './layouts/WorkspaceLayout.vue'
useSessionLifecycle()
const r = useDa(),
  route = useRoute(),
  protectedPage = computed(() => route.meta['protected'] === true)
</script>
<template>
  <v-app
    ><component :is="r.controls" v-if="r.controls" /><WorkspaceLayout v-if="protectedPage"
      ><router-view /></WorkspaceLayout
    ><router-view v-else
  /></v-app>
</template>
