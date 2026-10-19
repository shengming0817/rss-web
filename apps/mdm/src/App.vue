<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSessionLifecycle } from '@rss/auth'
import { useTheme } from '@rss/core/composables'
import { UiButton, UiDialog, UiSearchInput, UiMessage, UiPopover } from '@rss/core/components'
import { useMdm } from './context'
import { usePermission } from './features/enrollment/usePermission'
import ConsoleNavigation from './components/ConsoleNavigation.vue'
import {
  navigation,
  platformNavigation,
  detailParents,
  type NavigationItem,
} from './components/navigation'
const { t, locale } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  theme = useTheme()
useSessionLifecycle()
const { canRead: canManageAgent } = usePermission('agent_enrollment_read', 'agent_enrollment_write')
const collapsed = ref(false),
  mobileOpen = ref(false),
  commandOpen = ref(false),
  query = ref('')
const authenticated = computed(() => runtime.session.state.value.status === 'authenticated')
const personal = computed(() => route.name === 'self-enrollments')
const consoleMode = computed(
  () => authenticated.value && route.meta['protected'] && !personal.value,
)
const authDestinations: NavigationItem[] = [
  { name: 'sessions', label: 'identity.sessions' },
  { name: 'accounts', label: 'identity.accounts' },
  { name: 'providers', label: 'identity.providers' },
]
const authLinks = computed(() =>
  authDestinations.filter((item) =>
    item.name === 'accounts'
      ? runtime.session.managementHint.value
      : item.name === 'providers'
        ? runtime.session.providerHint.value
        : true,
  ),
)
const sections = computed(() => (runtime.realm === 'platform' ? platformNavigation : navigation))
const destinations = computed<NavigationItem[]>(() => [
  { name: 'workspace', label: 'console.overview' },
  ...sections.value
    .flatMap<NavigationItem>((section) => [...section.items])
    .filter((item) => item.name !== 'agent-configurations' || canManageAgent.value),
  ...authLinks.value,
  ...(runtime.realm === 'tenant'
    ? [
        { name: 'self-enrollments', label: 'registration.self' },
        { name: 'agent-downloads', label: 'onboarding.downloads' },
      ]
    : []),
])
const parentName = computed(() => detailParents[String(route.name)] ?? String(route.name))
const section = computed(() =>
  sections.value.find((group) => group.items.some((item) => item.name === parentName.value)),
)
const title = computed(() =>
  t(
    [
      ...sections.value.flatMap<NavigationItem>((group) => [...group.items]),
      ...authDestinations,
      ...destinations.value,
    ].find((item) => item.name === parentName.value)?.label ?? 'console.overview',
  ),
)
const matches = computed(() =>
  destinations.value.filter((item) =>
    t(item.label).toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
  ),
)
function destination(name: string) {
  return name === 'agent-downloads' ? { name } : { name, params: { tenant: runtime.tenant } }
}
function closeNavigation() {
  mobileOpen.value = false
  commandOpen.value = false
}
function shortcut(event: KeyboardEvent) {
  if (
    !commandOpen.value &&
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    )
  )
    return
  if (consoleMode.value && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    commandOpen.value = !commandOpen.value
  }
}
watch(() => route.path, closeNavigation)
watch(consoleMode, (active) => {
  if (!active) closeNavigation()
})
watch(commandOpen, (open) => {
  if (!open) query.value = ''
})
onMounted(() => document.addEventListener('keydown', shortcut))
onBeforeUnmount(() => document.removeEventListener('keydown', shortcut))
</script>
<template>
  <div class="mdm-app" :class="{ 'has-console': consoleMode, 'sidebar-collapsed': collapsed }">
    <a class="console-skip" href="#identity-main">{{ t('identity.skip') }}</a>
    <aside v-if="consoleMode" class="console-sidebar">
      <RouterLink :to="destination('workspace')" class="console-brand"
        ><span class="console-logo">R</span
        ><span class="console-nav-label">RSS <strong>MDM</strong></span></RouterLink
      >
      <ConsoleNavigation :collapsed="collapsed" :can-manage-agent="canManageAgent" />
      <div class="console-sidebar-bottom">
        <UiButton
          variant="ghost"
          :aria-label="t(collapsed ? 'console.expandNavigation' : 'console.collapseNavigation')"
          @click="collapsed = !collapsed"
          ><span aria-hidden="true">◧</span
          ><span v-if="!collapsed">{{ t('console.collapseNavigation') }}</span></UiButton
        >
      </div>
    </aside>
    <div class="console-workspace" :class="{ 'is-public': !consoleMode }">
      <header class="console-topbar">
        <div class="console-topbar-context">
          <UiButton
            v-if="consoleMode"
            class="console-mobile-toggle"
            variant="ghost"
            :aria-label="t('console.navigation')"
            @click="mobileOpen = true"
            >☰</UiButton
          >
          <RouterLink v-if="!consoleMode" to="/" class="console-brand"
            ><span class="console-logo">R</span><span>RSS <strong>MDM</strong></span></RouterLink
          >
          <nav v-else class="console-breadcrumb" :aria-label="t('console.location')">
            <RouterLink :to="destination('workspace')">{{ t('console.workspace') }}</RouterLink
            ><span aria-hidden="true">/</span
            ><RouterLink
              v-if="section && title !== t(section.label)"
              :to="destination(section.items[0].name)"
              >{{ t(section.label) }}</RouterLink
            ><span v-if="section && title !== t(section.label)" aria-hidden="true">/</span
            ><span aria-current="page">{{ title }}</span>
          </nav>
        </div>
        <div class="console-topbar-actions">
          <UiButton
            v-if="consoleMode"
            variant="ghost"
            class="console-command-trigger"
            @click="commandOpen = true"
            >{{ t('console.navigate') }} <kbd>⌘ / Ctrl K</kbd></UiButton
          >
          <UiButton variant="ghost" @click="locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'">{{
            locale === 'zh-CN' ? 'EN' : '中文'
          }}</UiButton>
          <UiButton variant="ghost" :aria-label="t('identity.theme')" @click="theme.toggleTheme()"
            ><span aria-hidden="true">◐</span></UiButton
          >
          <UiPopover
            v-if="authenticated"
            :label="t('console.account')"
            :close-label="t('console.close')"
            ><div class="console-account-menu">
              <small>{{ t('console.tenant') }}</small
              ><code>{{ runtime.tenant }}</code
              ><RouterLink
                v-for="item in authLinks"
                :key="item.name"
                :to="destination(item.name)"
                >{{ t(item.label) }}</RouterLink
              >
            </div></UiPopover
          >
        </div>
      </header>
      <div
        v-if="authenticated && runtime.session.state.value.navigation === 'unavailable'"
        class="console-context-warning"
      >
        <UiMessage tone="warning" :title="t('identity.navigationUnavailable')"
          ><UiButton
            variant="ghost"
            @click="runtime.session.loadContext().catch(() => undefined)"
            >{{ t('identity.retryNavigation') }}</UiButton
          ></UiMessage
        >
      </div>
      <nav v-if="personal" class="console-personal-nav" :aria-label="t('registration.self')">
        <RouterLink :to="destination('workspace')">{{ t('mdm.home') }}</RouterLink
        ><RouterLink :to="destination('self-enrollments')">{{ t('registration.self') }}</RouterLink
        ><RouterLink :to="destination('agent-downloads')">{{
          t('onboarding.downloads')
        }}</RouterLink>
      </nav>
      <main
        id="identity-main"
        class="console-main"
        :class="{ 'console-public-main': !consoleMode }"
        tabindex="-1"
      >
        <RouterView :key="route.path" />
      </main>
      <footer v-if="!consoleMode" class="console-public-footer">{{ t('identity.footer') }}</footer>
    </div>
    <UiDialog
      :open="mobileOpen"
      :title="t('console.navigation')"
      :close-label="t('console.close')"
      placement="right"
      @update:open="mobileOpen = $event"
      ><ConsoleNavigation :can-manage-agent="canManageAgent" @navigate="closeNavigation"
    /></UiDialog>
    <UiDialog
      :open="commandOpen"
      :title="t('console.navigate')"
      :description="t('console.navigationOnly')"
      :close-label="t('console.close')"
      @update:open="commandOpen = $event"
      ><UiSearchInput
        v-model="query"
        :label="t('console.searchNavigation')"
        :clear-label="t('console.clear')"
        :placeholder="t('console.searchNavigation')"
      />
      <nav class="console-command-results" :aria-label="t('console.navigation')">
        <RouterLink
          v-for="item in matches"
          :key="item.name"
          :to="destination(item.name)"
          @click="closeNavigation"
          >{{ t(item.label) }}<span aria-hidden="true">↗</span></RouterLink
        >
        <p v-if="!matches.length">{{ t('console.noNavigation') }}</p>
      </nav></UiDialog
    >
  </div>
</template>
