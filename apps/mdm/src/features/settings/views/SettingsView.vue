<script setup lang="ts">
import '../settings.css'
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VChip,
  VTable,
  VTabs,
  VTab,
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelTitle,
  VExpansionPanelText,
  VTextField,
} from 'vuetify/components'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MdmPage from '../../../ui/MdmPage.vue'
import { useMdm } from '../../../context'
import { entries, managedSettingsPages } from '../entries'
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
const managedPages = computed(() =>
  managedSettingsPages.filter(
    (page) =>
      (section.value === 'overview' || page.section === section.value) &&
      (!search.value ||
        t('settings.directory.' + page.label)
          .toLowerCase()
          .includes(search.value.toLowerCase())),
  ),
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
  <MdmPage :title="t('settings.' + section)" :busy="busy" :failure="failure"
    ><template #actions
      ><VBtn @click="load">{{ t('settings.reload') }}</VBtn
      ><VBtn
        v-if="runtime.realm === 'tenant'"
        :to="{ name: 'settings-guide', params: { tenant: runtime.tenant } }"
        variant="text"
        >{{ t('settings.guide') }}</VBtn
      ></template
    >
    <p class="settings-scope">
      <strong>{{
        t(runtime.realm === 'platform' ? 'settings.scopePlatform' : 'settings.scopeTenant')
      }}</strong>
      · <code>{{ runtime.tenant }}</code>
    </p>
    <VAlert
      type="info"
      :title="t(runtime.realm === 'platform' ? 'settings.scopeHint' : 'settings.firstEnabled')"
      variant="tonal"
      >{{ t('settings.noAuthority') }}</VAlert
    >
    <VTabs :model-value="section" :aria-label="t('settings.title')" show-arrows>
      <VTab
        v-for="item in settingsSections"
        :key="item"
        :value="item"
        :to="{ name: 'settings-' + item, params: { tenant: runtime.tenant } }"
        >{{ t('settings.' + item) }}</VTab
      >
      <VTab
        v-if="runtime.realm === 'platform'"
        :to="{ name: 'settings-tenants', params: { tenant: runtime.tenant } }"
        >{{ t('settings.tenants') }}</VTab
      >
    </VTabs>
    <VCard
      v-if="section === 'overview' && runtime.realm === 'tenant'"
      class="my-4"
      variant="outlined"
    >
      <VCardTitle tag="h2">{{ t('telemetry.dataCollection') }}</VCardTitle>
      <VCardText>
        <p>{{ t('telemetry.metricsHint') }}</p>
        <VBtn :to="{ name: 'policy-metrics', params: { tenant: runtime.tenant } }" variant="text">{{
          t('telemetry.metricsSettings')
        }}</VBtn>
      </VCardText>
    </VCard>
    <div v-if="section === 'overview'" class="settings-overview-grid">
      <VCard class="console-panel" tag="article" variant="outlined"
        ><h2>{{ t('settings.currentTenant') }}</h2>
        <code>{{ runtime.tenant }}</code></VCard
      ><VCard class="console-panel" tag="article" variant="outlined"
        ><h2>{{ t('settings.overview') }}</h2>
        <strong>{{ nextSteps.length }}</strong>
        <p>{{ t('settings.notObserved') }}</p></VCard
      ><VCard class="console-panel" tag="article" variant="outlined"
        ><h2>{{ t('settings.inventory') }}</h2>
        <strong>{{ catalog?.items.length ?? '—' }}</strong>
        <p>{{ t('settings.sourceCustody') }}</p></VCard
      >
    </div>
    <VTextField
      v-if="section !== 'operations'"
      v-model="search"
      type="search"
      :label="t('settings.search')"
      :placeholder="t('settings.search')" />
    <VCard v-if="runtime.realm === 'tenant' && managedPages.length" variant="outlined">
      <VCardTitle tag="h2">{{ t('settings.directory.title') }}</VCardTitle>
      <VCardText class="settings-actions">
        <VBtn
          v-for="page in managedPages"
          :key="page.target"
          :to="settingsDestination(page.target, runtime.tenant)!"
          variant="tonal"
          :data-settings-page="page.target"
        >
          {{ t('settings.directory.' + page.label) }}
        </VBtn>
      </VCardText>
    </VCard>
    <p v-if="runtime.realm === 'tenant' && managedPages.some((page) => page.target === 'recovery')">
      {{ t('settings.directory.recoveryHint') }}
    </p>
    <VTable
      v-if="selected.length"
      class="settings-catalog-table"
      :aria-label="t('settings.inventory')"
    >
      <thead>
        <tr>
          <th scope="col">{{ t('settings.name') }}</th>
          <th scope="col">{{ t('settings.state') }}</th>
          <th scope="col">{{ t('devices.evidence') }}</th>
          <th scope="col">{{ t('settings.open') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in selected" :key="item.id" :data-setting="item.id">
          <th scope="row">{{ locale === 'zh-CN' ? entries[item.id].zh : entries[item.id].en }}</th>
          <td>
            <VChip>{{ t('settings.status.' + item.status) }}</VChip>
          </td>
          <td>
            <VExpansionPanels variant="accordion">
              <VExpansionPanel>
                <VExpansionPanelTitle>{{ t('devices.evidence') }}</VExpansionPanelTitle>
                <VExpansionPanelText>
                  <p>
                    {{ t('settings.savedVersion') }} {{ item.revision ?? '—' }} ·
                    {{ t('settings.requestedVersion') }} {{ item.desiredRevision ?? '—' }} ·
                    {{ t('settings.runtimeVersion') }} {{ item.appliedRevision ?? '—' }}
                  </p>
                  <p v-if="item.status === 'unknown' || item.reason">
                    {{
                      t(
                        item.custody === 'deployment_operator'
                          ? 'settings.operatorHint'
                          : 'settings.notObserved',
                      )
                    }}
                  </p>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </td>
          <td>
            <VBtn
              v-if="materials.includes(entries[item.id].target)"
              @click="material = entries[item.id].target"
              >{{ t('settings.open') }}</VBtn
            >
            <VBtn
              v-else-if="settingsDestination(entries[item.id].target, runtime.tenant)"
              :to="settingsDestination(entries[item.id].target, runtime.tenant)!"
              variant="text"
              >{{
                t(
                  item.custody === 'deployment_operator'
                    ? 'settings.operatorOnly'
                    : 'settings.open',
                )
              }}</VBtn
            >
            <span v-else>{{ t('settings.notSupported') }}</span>
          </td>
        </tr>
      </tbody>
    </VTable>
    <VAlert v-else-if="catalog && section !== 'operations'" type="info" variant="tonal">{{
      t('settings.noData')
    }}</VAlert>
    <div v-if="section === 'access' && runtime.realm === 'tenant'" class="settings-actions">
      <VBtn
        :to="{ name: 'operations-organization', params: { tenant: runtime.tenant } }"
        variant="text"
        >{{ t('settings.access') }}</VBtn
      ><VBtn
        :to="{ name: 'operations-authorization', params: { tenant: runtime.tenant } }"
        variant="text"
        >{{ t('operations.authorization') }}</VBtn
      >
    </div>
    <VDialog
      :model-value="!!material"
      max-width="1100"
      :aria-label="t('settings.title')"
      @update:model-value="!$event && (material = '')"
      ><VCard
        ><VCardTitle tag="h2">{{ t('settings.title') }}</VCardTitle
        ><VCardText
          ><MaterialPanel v-if="material" :key="material" :material="material" /></VCardText
        ><VCardActions
          ><VBtn @click="material = ''">{{ t('console.cancel') }}</VBtn></VCardActions
        ></VCard
      ></VDialog
    ><WebhookSubscriptionsPanel
      v-if="section === 'integrations' && runtime.realm === 'tenant'" /><ApiAccessPanel
      v-if="section === 'access'" /><DeploymentPanel
      v-if="section === 'deployment'" /><OperationsPanel v-if="section === 'operations'"
  /></MdmPage>
</template>
