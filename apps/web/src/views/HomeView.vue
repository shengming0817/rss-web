<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import VerifiedProfilePanel from '../features/identity/VerifiedProfilePanel.vue'
import { useIdentitySession } from '../features/identity/session-context'
import { SourceBadge } from '@rss/core'
import { RSS_SOURCE } from '@rss/shared'

const { t } = useI18n()
const { state } = useIdentitySession()
const profile = computed(() =>
  state.value.status === 'authenticated' || state.value.status === 'refreshing'
    ? state.value.profile
    : undefined,
)
</script>

<template>
  <section class="home" aria-labelledby="home-title">
    <h1 id="home-title" class="v1-h1">{{ t('home.title') }}</h1>
    <p class="v1-sub">{{ t('home.subtitle') }}</p>
    <SourceBadge :source="RSS_SOURCE" />
    <VerifiedProfilePanel v-if="profile" :profile="profile" />
  </section>
</template>

<style scoped>
.home {
  max-width: 720px;
  padding: 32px;
}
</style>
