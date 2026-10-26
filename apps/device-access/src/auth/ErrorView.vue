<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>
<template>
  <main class="empty">
    <h1>{{ $t('da.mcdf86dca9f') }}</h1>
    <p>{{ $t('da.m5db0ebbb9b') }}</p>
    <v-btn color="primary" @click="router.replace({ name: 'login' })">{{
      $t('da.mf2fe4ecc0f')
    }}</v-btn>
  </main>
</template>
