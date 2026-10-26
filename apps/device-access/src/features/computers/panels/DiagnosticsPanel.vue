<script setup lang="ts">
import type { Computer } from '@rss/device-access/model'
import { useRouter } from 'vue-router'
import { utc } from '../../../services/status'
const props = defineProps<{ device: Computer }>(),
  router = useRouter()
</script>
<template>
  <h2>{{ $t('da.m6c4d6c6eea') }}</h2>
  <dl class="detail-list mt-5">
    <div>
      <dt>{{ $t('da.m48885ad0fa') }}</dt>
      <dd>{{ device.name }}</dd>
    </div>
    <div>
      <dt>{{ $t('da.me4b9d69486') }}</dt>
      <dd>{{ device.platform }}</dd>
    </div>
    <div>
      <dt>{{ $t('da.m924427d050') }}</dt>
      <dd>{{ utc(device.lastObservedAt) }}</dd>
    </div>
    <div>
      <dt>{{ $t('da.m5ecdceffdb') }}</dt>
      <dd>{{ $t('da.md47aba2a6a') }}</dd>
    </div>
  </dl>
  <v-alert type="info" :icon="false" class="mt-5">{{ $t('da.m9c970ac07b') }}</v-alert
  ><v-btn
    class="mt-5"
    variant="outlined"
    @click="router.push({ name: 'audit', query: { device: props.device.id } })"
    >{{ $t('da.m714a7eca4c') }}</v-btn
  >
</template>
