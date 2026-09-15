<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@rss/core/composables'
import { useIdentity } from './context'
import { operationQuery } from './services/navigation'
const { session } = useIdentity()
const router = useRouter()
const { t, locale } = useI18n()
const theme = useTheme()
onMounted(() => window.addEventListener('pagehide', session.leavePage))
onBeforeUnmount(() => window.removeEventListener('pagehide', session.leavePage))
watch(
  () => session.state.value.status,
  (status) => {
    // Keep the single operation receipt visible while authority is cleared.
    // PlatformView hides all protected content and offers reauthentication.
    if (
      router.currentRoute.value.name === 'platform' &&
      operationQuery(router.currentRoute.value.query).operation
    )
      return
    if (
      router.currentRoute.value.meta['protected'] &&
      status !== 'authenticated' &&
      status !== 'checking'
    )
      void router.replace(
        status === 'unavailable'
          ? { name: 'error', query: { reason: 'unavailable' } }
          : { name: 'login', params: { tenant: session.state.value.tenant } },
      )
  },
)
function activity(event: Event) {
  if (event.isTrusted) void session.activity().catch(() => undefined)
}
</script>
<template>
  <div class="identity-app" @pointerdown="activity" @keydown="activity">
    <a class="identity-skip" href="#identity-main">{{ t('identity.skip') }}</a>
    <header>
      <RouterLink
        :to="{ path: '/', query: operationQuery(router.currentRoute.value.query) }"
        class="identity-brand"
        >RSS <strong>Identity</strong></RouterLink
      >
      <div class="identity-actions">
        <button @click="locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'">
          {{ locale === 'zh-CN' ? 'English' : '中文' }}</button
        ><button @click="theme.toggleTheme()">{{ t('identity.theme') }}</button>
      </div>
    </header>
    <nav
      v-if="session.state.value.status === 'authenticated'"
      :aria-label="t('identity.navigation')"
    >
      <RouterLink
        v-if="session.state.value.identity?.platform_administrator"
        :to="{
          name: 'platform',
          params: { tenant: session.state.value.tenant },
          query: operationQuery(router.currentRoute.value.query),
        }"
        >{{ t('identity.platform') }}</RouterLink
      >
      <RouterLink
        :to="{
          name: 'sessions',
          params: { tenant: session.state.value.tenant },
          query: operationQuery(router.currentRoute.value.query),
        }"
        >{{ t('identity.sessions') }}</RouterLink
      ><template v-if="session.managementHint.value"
        ><RouterLink
          :to="{
            name: 'accounts',
            params: { tenant: session.state.value.tenant },
            query: operationQuery(router.currentRoute.value.query),
          }"
          >{{ t('identity.accounts') }}</RouterLink
        ><RouterLink
          :to="{
            name: 'providers',
            params: { tenant: session.state.value.tenant },
            query: operationQuery(router.currentRoute.value.query),
          }"
          >{{ t('identity.providers') }}</RouterLink
        ></template
      >
    </nav>
    <main id="identity-main" tabindex="-1">
      <RouterView :key="router.currentRoute.value.path" />
    </main>
    <footer>{{ t('identity.footer') }}</footer>
  </div>
</template>
