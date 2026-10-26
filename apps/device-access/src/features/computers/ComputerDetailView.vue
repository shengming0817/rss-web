<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ComputerWorkspace from './ComputerWorkspace.vue'
const route = useRoute(),
  id = computed(() =>
    typeof route.params['deviceId'] === 'string' ? route.params['deviceId'] : '',
  )
</script>
<template><ComputerWorkspace :key="id" :device-id="id" /></template>
