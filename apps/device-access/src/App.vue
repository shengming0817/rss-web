<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionLifecycle } from '@rss/auth'
import { useDa } from './context'
import WorkspaceLayout from './layouts/WorkspaceLayout.vue'
useSessionLifecycle()
const accessTheme = ref('access')
const r = useDa(),
  route = useRoute(),
  protectedPage = computed(() => route.meta['protected'] === true)
</script>
<template>
  <v-app class="access-surface" :class="`v-theme--${accessTheme}`"
    ><component :is="r.controls" v-if="r.controls" /><WorkspaceLayout
      v-if="protectedPage"
      :theme="accessTheme"
      @theme="accessTheme = $event"
      ><router-view /></WorkspaceLayout
    ><router-view v-else
  /></v-app>
</template>
