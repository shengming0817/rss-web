<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="home" aria-labelledby="home-title">
    <h1 id="home-title" class="v1-h1">{{ t('home.title') }}</h1>
    <p class="v1-sub">{{ t('home.subtitle') }}</p>
  </section>
</template>

<style scoped>
.home {
  max-width: 720px;
  padding: 32px;
}
</style>
