<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  VApp,
  VBtn,
  VAlert,
  VDefaultsProvider,
  VLocaleProvider,
  VThemeProvider,
} from 'vuetify/components'
import { useTheme } from '@rss/core/composables'
import { useIdentity } from './context'
import { useSessionLifecycle } from './useSessionLifecycle'
const { session } = useIdentity()
useSessionLifecycle()
const router = useRouter()
const { t, locale } = useI18n()
const theme = useTheme()
</script>
<template>
  <VLocaleProvider :locale="locale === 'zh-CN' ? 'zhHans' : 'en'">
    <VThemeProvider :theme="theme.theme.value">
      <VDefaultsProvider
        :defaults="{
          VDialog: { attach: '.auth-host', VMenu: { attach: '.auth-host' } },
          VMenu: { attach: '.auth-host' },
        }"
      >
        <VApp class="auth-host" :class="`v-theme--${theme.theme.value}`">
          <a class="auth-skip" href="#identity-main">{{ t('identity.skip') }}</a>
          <header class="auth-host-header">
            <RouterLink to="/" class="auth-brand"
              ><span>R</span> RSS <strong>Identity</strong></RouterLink
            >
            <div class="auth-actions">
              <VBtn variant="text" @click="locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'">{{
                locale === 'zh-CN' ? 'English' : '中文'
              }}</VBtn
              ><VBtn variant="text" @click="theme.toggleTheme()">{{ t('identity.theme') }}</VBtn>
            </div>
          </header>
          <nav
            v-if="session.state.value.status === 'authenticated'"
            class="auth-navigation"
            :aria-label="t('identity.navigation')"
          >
            <RouterLink
              :to="{ name: 'sessions', params: { tenant: session.state.value.tenant } }"
              >{{ t('identity.sessions') }}</RouterLink
            >
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
          <VAlert
            v-if="
              session.state.value.status === 'authenticated' &&
              session.state.value.navigation === 'unavailable'
            "
            type="warning"
            variant="tonal"
            :title="t('identity.navigationUnavailable')"
            ><VBtn variant="text" @click="session.loadContext().catch(() => undefined)">{{
              t('identity.retryNavigation')
            }}</VBtn></VAlert
          >
          <main id="identity-main" class="auth-host-main" tabindex="-1">
            <RouterView :key="router.currentRoute.value.path" />
          </main>
          <footer class="auth-host-footer">{{ t('identity.footer') }}</footer>
        </VApp></VDefaultsProvider
      ></VThemeProvider
    ></VLocaleProvider
  >
</template>
