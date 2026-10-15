<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
import { useTheme } from '@rss/core/composables'
import { useIdentity } from './context'
import { useSessionLifecycle } from './useSessionLifecycle'
const { session } = useIdentity()
const { activity } = useSessionLifecycle()
const router = useRouter()
const { t, locale } = useI18n()
const theme = useTheme()
</script>
<template>
  <div class="auth-host" @pointerdown="activity" @keydown="activity">
    <a class="auth-skip" href="#identity-main">{{ t('identity.skip') }}</a>
    <header class="auth-host-header">
      <RouterLink to="/" class="auth-brand"
        ><span>R</span> RSS <strong>Identity</strong></RouterLink
      >
      <div class="auth-actions">
        <UiButton variant="ghost" @click="locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'">{{
          locale === 'zh-CN' ? 'English' : '中文'
        }}</UiButton
        ><UiButton variant="ghost" @click="theme.toggleTheme()">{{ t('identity.theme') }}</UiButton>
      </div>
    </header>
    <nav
      v-if="session.state.value.status === 'authenticated'"
      class="auth-navigation"
      :aria-label="t('identity.navigation')"
    >
      <RouterLink :to="{ name: 'sessions', params: { tenant: session.state.value.tenant } }">{{
        t('identity.sessions')
      }}</RouterLink>
      <RouterLink
        v-if="session.managementHint.value"
        :to="{ name: 'accounts', params: { tenant: session.state.value.tenant } }"
        >{{ t('identity.accounts') }}</RouterLink
      >
      <RouterLink
        v-if="session.providerHint.value"
        :to="{ name: 'providers', params: { tenant: session.state.value.tenant } }"
        >{{ t('identity.providers') }}</RouterLink
      >
    </nav>
    <UiMessage
      v-if="
        session.state.value.status === 'authenticated' &&
        session.state.value.navigation === 'unavailable'
      "
      tone="warning"
      :title="t('identity.navigationUnavailable')"
      ><UiButton variant="ghost" @click="session.loadContext().catch(() => undefined)">{{
        t('identity.retryNavigation')
      }}</UiButton></UiMessage
    >
    <main id="identity-main" class="auth-host-main" tabindex="-1">
      <RouterView :key="router.currentRoute.value.path" />
    </main>
    <footer class="auth-host-footer">{{ t('identity.footer') }}</footer>
  </div>
</template>
