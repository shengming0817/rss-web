<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SourceBadge } from '@rss/core'
import { RSS_SOURCE } from '@rss/shared'
import PasswordChangeForm from './PasswordChangeForm.vue'
import SessionActions from './SessionActions.vue'
import VerifiedProfilePanel from './VerifiedProfilePanel.vue'
import { useIdentitySession } from './session-context'

const { t } = useI18n()
const { state } = useIdentitySession()
const profile = computed(() =>
  state.value.status === 'authenticated' || state.value.status === 'refreshing'
    ? state.value.profile
    : undefined,
)
</script>

<template>
  <section v-if="profile" class="identity-self" aria-labelledby="identity-self-title">
    <header>
      <div>
        <h1 id="identity-self-title" class="v1-h1">{{ t('identity.selfService.title') }}</h1>
        <p class="v1-sub">{{ t('identity.selfService.subtitle') }}</p>
      </div>
      <SourceBadge :source="RSS_SOURCE" />
    </header>
    <VerifiedProfilePanel :profile="profile" />
    <section class="identity-self__sessions" aria-labelledby="identity-session-actions-title">
      <h2 id="identity-session-actions-title">{{ t('identity.selfService.sessions') }}</h2>
      <SessionActions />
    </section>
    <PasswordChangeForm />
  </section>
</template>

<style scoped>
.identity-self {
  display: grid;
  gap: 24px;
  max-width: 900px;
  padding: 32px;
}
.identity-self > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.identity-self__sessions {
  max-width: 720px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-raised);
}
</style>
