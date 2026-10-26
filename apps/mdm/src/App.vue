<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSessionLifecycle } from '@rss/auth'
import { useTheme } from '@rss/core/composables'
import { useDisplay } from 'vuetify'
import MdmSurface from './ui/MdmSurface.vue'
import { useMdm } from './context'
import { usePermission } from './features/enrollment/usePermission'
import ConsoleNavigation from './components/ConsoleNavigation.vue'
import {
  useNavigation,
  platformNavigation,
  detailParents,
  pageLabels,
  navigationTarget,
  type NavigationItem,
} from './components/navigation'
const { t, locale } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  theme = useTheme(),
  navigation = useNavigation()
useSessionLifecycle()
const { canRead: canManageAgent } = usePermission('agent_enrollment_read', 'agent_enrollment_write')
const { mobile } = useDisplay()
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
  { name: 'user-profile', label: 'profiles.mine' },
  { name: 'sessions', label: 'identity.sessions' },
]
const authLinks = computed(() => authDestinations)
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
const title = computed(() =>
  t(
    pageLabels[String(route.name)] ??
      [
        ...sections.value.flatMap<NavigationItem>((group) => [...group.items]),
        ...authDestinations,
        ...destinations.value,
      ].find(
        (item) =>
          item.name === parentName.value &&
          (!item.query ||
            Object.entries(item.query).every(([key, value]) => route.query[key] === value)),
      )?.label ??
      sections.value.find((s) => s.items.some((item) => item.name === parentName.value))?.label ??
      'console.overview',
  ),
)
const matches = computed(() =>
  destinations.value.filter((item) =>
    t(item.label).toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()),
  ),
)
function destination(name: string) {
  return name === 'agent-downloads' || name === 'self-enrollments'
    ? { name }
    : { name, params: { tenant: runtime.tenant } }
}
function closeNavigation() {
  mobileOpen.value = false
  commandOpen.value = false
}
function shortcut(event: KeyboardEvent) {
  if (
    !commandOpen.value &&
    Array.from(
      document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'),
    ).some(
      (dialog) =>
        dialog.getAttribute('data-state') === 'open' || dialog.getClientRects().length > 0,
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
  <MdmSurface>
    <v-app class="mdm-app">
      <a class="console-skip" href="#identity-main">{{ t('identity.skip') }}</a>
      <v-navigation-drawer
        v-if="consoleMode"
        :model-value="!mobile || mobileOpen"
        :permanent="!mobile"
        :temporary="mobile"
        :rail="!mobile && collapsed"
        :width="238"
        :rail-width="64"
        class="mdm-sidebar"
        @update:model-value="mobileOpen = $event"
      >
        <v-list-item :to="destination('workspace')" title="RSS MDM" class="mdm-brand" />
        <ConsoleNavigation
          :collapsed="collapsed"
          :can-manage-agent="canManageAgent"
          @navigate="closeNavigation"
        />
        <template #append
          ><v-btn
            v-if="!mobile"
            variant="text"
            block
            :aria-label="t(collapsed ? 'console.expandNavigation' : 'console.collapseNavigation')"
            @click="collapsed = !collapsed"
            >{{ collapsed ? '◨' : t('console.collapseNavigation') }}</v-btn
          ></template
        >
      </v-navigation-drawer>
      <v-app-bar flat border height="58" class="mdm-toolbar">
        <v-btn
          v-if="consoleMode && mobile"
          variant="text"
          :aria-label="t('console.navigation')"
          @click="mobileOpen = true"
          >☰</v-btn
        >
        <v-btn v-if="!consoleMode" :to="destination('workspace')" variant="text">RSS MDM</v-btn>
        <nav v-else class="console-breadcrumb" :aria-label="t('console.location')">
          <RouterLink :to="destination('workspace')">{{ t('console.workspace') }}</RouterLink
          ><span aria-hidden="true">/</span><span aria-current="page">{{ title }}</span>
        </nav>
        <v-spacer />
        <v-btn
          v-if="consoleMode"
          variant="text"
          class="console-command-trigger"
          @click="commandOpen = true"
          >{{ t('console.navigate') }} <kbd>⌘ / Ctrl K</kbd></v-btn
        >
        <v-btn variant="text" @click="locale = locale === 'zh-CN' ? 'en-US' : 'zh-CN'">{{
          locale === 'zh-CN' ? 'EN' : '中文'
        }}</v-btn>
        <v-btn variant="text" :aria-label="t('identity.theme')" @click="theme.toggleTheme()"
          >◐</v-btn
        >
        <v-menu v-if="authenticated">
          <template #activator="{ props }"
            ><v-btn v-bind="props" variant="text">{{ t('console.account') }}</v-btn></template
          >
          <v-list density="compact"
            ><v-list-subheader>{{ t('console.tenant') }} · {{ runtime.tenant }}</v-list-subheader
            ><v-list-item
              v-for="item in authLinks"
              :key="item.name"
              :to="destination(item.name)"
              :title="t(item.label)"
          /></v-list>
        </v-menu>
      </v-app-bar>
      <v-main>
        <v-alert
          v-if="authenticated && runtime.session.state.value.navigation === 'unavailable'"
          type="warning"
          variant="tonal"
          :title="t('identity.navigationUnavailable')"
          ><v-btn variant="text" @click="runtime.session.loadContext().catch(() => undefined)">{{
            t('identity.retryNavigation')
          }}</v-btn></v-alert
        >
        <v-tabs v-if="personal" :aria-label="t('registration.self')"
          ><v-tab :to="destination('workspace')">{{ t('mdm.home') }}</v-tab
          ><v-tab :to="destination('self-enrollments')">{{ t('registration.self') }}</v-tab
          ><v-tab :to="destination('agent-downloads')">{{
            t('onboarding.downloads')
          }}</v-tab></v-tabs
        >
        <main
          id="identity-main"
          class="console-main"
          :class="{ 'console-public-main': !consoleMode }"
          tabindex="-1"
        >
          <RouterView :key="route.path" />
        </main>
        <footer v-if="!consoleMode" class="console-public-footer">
          {{ t('identity.footer') }}
        </footer>
      </v-main>
      <v-dialog v-model="commandOpen" :aria-label="t('console.navigate')" max-width="640"
        ><v-card :title="t('console.navigate')" :subtitle="t('console.navigationOnly')"
          ><v-card-text
            ><v-text-field
              :model-value="query"
              @update:model-value="query = typeof $event === 'string' ? $event : ''"
              type="search"
              clearable
              :label="t('console.searchNavigation')"
              :placeholder="t('console.searchNavigation')"
              @click:clear="query = ''" /><v-list
              density="compact"
              :aria-label="t('console.navigation')"
              ><v-list-item
                v-for="item in matches"
                :key="item.name + JSON.stringify(item.query)"
                :to="navigationTarget(item, runtime.tenant)"
                :title="t(item.label)"
                @click="closeNavigation" /><v-list-item
                v-if="!matches.length"
                :title="t('console.noNavigation')" /></v-list></v-card-text
          ><v-card-actions
            ><v-spacer /><v-btn variant="text" @click="commandOpen = false">{{
              t('console.close')
            }}</v-btn></v-card-actions
          ></v-card
        ></v-dialog
      >
    </v-app>
  </MdmSurface>
</template>
