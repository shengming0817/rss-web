<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton, UiInput, UiMessage, UiDialog } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
import { useMdm } from '../../../context'
import { entries } from '../entries'
import { settingsSections } from '../routes'
import { settingsDestination } from '../destinations'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import type { SettingsCatalog } from '../clients/catalog'
import MaterialPanel from '../components/MaterialPanel.vue'
import DeploymentPanel from '../components/DeploymentPanel.vue'
import WebhookSubscriptionsPanel from '../components/WebhookSubscriptionsPanel.vue'
import ApiAccessPanel from '../components/ApiAccessPanel.vue'
import OperationsPanel from '../components/OperationsPanel.vue'
const runtime = useMdm(),
  route = useRoute(),
  { t, locale } = useI18n(),
  { run, busy, failure } = useSettingsAction(() => 'catalog')
const catalog = ref<SettingsCatalog>(),
  search = ref(''),
  material = ref('')
const materials = [
  'apns',
  'profile',
  'managed_account',
  'storage',
  'smtp',
  'wns',
  'task',
  'webhook',
  'pki',
  'packages',
]
const section = computed(() => String(route.name).replace('settings-', ''))
const selected = computed(
  () =>
    catalog.value?.items.filter(
      (item) =>
        (section.value === 'overview' || entries[item.id].section === section.value) &&
        (!search.value ||
          [entries[item.id].zh, entries[item.id].en]
            .join(' ')
            .toLowerCase()
            .includes(search.value.toLowerCase())),
    ) ?? [],
)
const nextSteps = computed(
  () =>
    catalog.value?.items.filter((item) =>
      ['unknown', 'unconfigured', 'pending', 'unavailable'].includes(item.status),
    ) ?? [],
)
async function load() {
  catalog.value = undefined
  await run(
    () => runtime.settings.catalog.read(),
    (v) => (catalog.value = v),
  )
}
onMounted(load)
useSettingsFacts(() => (catalog.value = undefined))
</script>
<template>
  <PageFrame :title="t('settings.' + section)" :busy="busy" :failure="failure">
    <template #actions
      ><UiButton @click="load">{{ t('settings.reload') }}</UiButton
      ><RouterLink
        v-if="runtime.realm === 'tenant'"
        class="ui-button"
        :to="{ name: 'settings-guide', params: { tenant: runtime.tenant } }"
        >{{ t('settings.guide') }}</RouterLink
      ></template
    >
    <p class="settings-scope">
      <strong>{{
        t(runtime.realm === 'platform' ? 'settings.scopePlatform' : 'settings.scopeTenant')
      }}</strong>
      · <code>{{ runtime.tenant }}</code>
    </p>
    <UiMessage
      tone="info"
      :title="t(runtime.realm === 'platform' ? 'settings.scopeHint' : 'settings.firstEnabled')"
      >{{ t('settings.noAuthority') }}</UiMessage
    >
    <nav class="settings-tabs" :aria-label="t('settings.title')">
      <RouterLink
        v-for="item in settingsSections"
        :key="item"
        :to="{ name: 'settings-' + item, params: { tenant: runtime.tenant } }"
        >{{ t('settings.' + item) }}</RouterLink
      ><RouterLink
        v-if="runtime.realm === 'platform'"
        :to="{ name: 'settings-tenants', params: { tenant: runtime.tenant } }"
        >{{ t('settings.tenants') }}</RouterLink
      >
    </nav>
    <article v-if="section === 'overview' && runtime.realm === 'tenant'" class="console-panel">
      <h2>{{ t('telemetry.dataCollection') }}</h2>
      <p>{{ t('telemetry.metricsHint') }}</p>
      <RouterLink :to="{ name: 'settings-metrics', params: { tenant: runtime.tenant } }">{{
        t('telemetry.metricsSettings')
      }}</RouterLink>
    </article>
    <article v-if="section === 'integrations' && runtime.realm === 'tenant'" class="console-panel">
      <RouterLink
        :to="{ name: 'security-certificate-archive', params: { tenant: runtime.tenant } }"
        >{{ t('security.certificate-archive') }}</RouterLink
      >
    </article>
    <div v-if="section === 'overview'" class="settings-overview-grid">
      <article class="console-panel">
        <h2>{{ t('settings.currentTenant') }}</h2>
        <code>{{ runtime.tenant }}</code>
      </article>
      <article class="console-panel">
        <h2>{{ t('settings.overview') }}</h2>
        <strong>{{ nextSteps.length }}</strong>
        <p>{{ t('settings.notObserved') }}</p>
      </article>
      <article class="console-panel">
        <h2>{{ t('settings.inventory') }}</h2>
        <strong>{{ catalog?.items.length ?? '—' }}</strong>
        <p>{{ t('settings.sourceCustody') }}</p>
      </article>
    </div>
    <UiInput
      v-if="section !== 'operations'"
      v-model="search"
      type="search"
      :aria-label="t('settings.search')"
      :placeholder="t('settings.search')"
    />
    <div class="settings-catalog">
      <article
        v-for="item in selected"
        :key="item.id"
        class="console-panel settings-catalog-row"
        :data-setting="item.id"
      >
        <div>
          <h2>{{ locale === 'zh-CN' ? entries[item.id].zh : entries[item.id].en }}</h2>

          <details>
            <summary>{{ t('devices.evidence') }}</summary>
            <p>
              {{ t('settings.savedVersion') }} {{ item.revision ?? '—' }} ·
              {{ t('settings.requestedVersion') }} {{ item.desiredRevision ?? '—' }} ·
              {{ t('settings.runtimeVersion') }} {{ item.appliedRevision ?? '—' }}
            </p>
          </details>
          <p v-if="item.status === 'unknown' || item.reason">
            {{
              t(
                item.custody === 'deployment_operator'
                  ? 'settings.operatorHint'
                  : 'settings.notObserved',
              )
            }}
          </p>
        </div>
        <div class="settings-catalog-state">
          <span class="ui-badge">{{ t('settings.status.' + item.status) }}</span
          ><UiButton
            v-if="materials.includes(entries[item.id].target)"
            @click="material = entries[item.id].target"
            >{{ t('settings.open') }}</UiButton
          ><RouterLink
            v-else-if="settingsDestination(entries[item.id].target, runtime.tenant)"
            class="ui-button"
            :to="settingsDestination(entries[item.id].target, runtime.tenant)!"
            >{{
              t(item.custody === 'deployment_operator' ? 'settings.operatorOnly' : 'settings.open')
            }}</RouterLink
          ><span v-else>{{ t('settings.notSupported') }}</span>
        </div>
      </article>
      <p v-if="catalog && !selected.length && section !== 'operations'">
        {{ t('settings.noData') }}
      </p>
    </div>
    <div v-if="section === 'access' && runtime.realm === 'tenant'" class="settings-actions">
      <RouterLink :to="{ name: 'operations-organization', params: { tenant: runtime.tenant } }">{{
        t('settings.access')
      }}</RouterLink
      ><RouterLink :to="{ name: 'operations-authorization', params: { tenant: runtime.tenant } }">{{
        t('operations.authorization')
      }}</RouterLink>
    </div>
    <UiDialog
      :open="!!material"
      :title="t('settings.title')"
      :close-label="t('console.cancel')"
      placement="right"
      @update:open="!$event && (material = '')"
      ><MaterialPanel v-if="material" :key="material" :material="material"
    /></UiDialog>
    <WebhookSubscriptionsPanel v-if="section === 'integrations' && runtime.realm === 'tenant'" />
    <ApiAccessPanel v-if="section === 'access'" />
    <DeploymentPanel v-if="section === 'deployment'" />
    <OperationsPanel v-if="section === 'operations'" />
  </PageFrame>
</template>
