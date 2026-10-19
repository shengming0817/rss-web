<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { UiButton, UiInput, UiMessage, UiStepIndicator } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
import { useMdm } from '../../../context'
import { entries } from '../entries'
import { settingsSections } from '../routes'
import { settingsDestination } from '../destinations'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import type { SettingsCatalog } from '../clients/catalog'
import MaterialPanel from '../components/MaterialPanel.vue'
import DeploymentPanel from '../components/DeploymentPanel.vue'
import OperationsPanel from '../components/OperationsPanel.vue'
const runtime = useMdm(),
  route = useRoute(),
  { t, locale } = useI18n(),
  { run, busy, failure } = useSettingsAction(() => 'catalog')
const catalog = ref<SettingsCatalog>(),
  search = ref(''),
  step = ref(0),
  agent = ref(true),
  windows = ref(false),
  apple = ref(false)
const guide = computed(() => route.name === 'settings-guide')
const section = computed(() =>
  guide.value
    ? (['access', 'enrollment', 'integrations'][step.value] ?? 'overview')
    : String(route.name).replace('settings-', ''),
)
const selected = computed(
  () =>
    catalog.value?.items.filter(
      (item) =>
        (section.value === 'overview' || entries[item.id].section === section.value) &&
        (!guide.value ||
          step.value !== 1 ||
          ![
            'apns',
            'profile',
            'managed_account',
            'ade',
            'appleAccount',
            'pki',
            'wns',
            'task',
            'packages',
          ].includes(entries[item.id].target) ||
          (apple.value &&
            ['apns', 'profile', 'managed_account', 'ade', 'appleAccount', 'pki'].includes(
              entries[item.id].target,
            )) ||
          (windows.value && ['wns', 'pki'].includes(entries[item.id].target)) ||
          (agent.value && ['task', 'packages', 'pki'].includes(entries[item.id].target))) &&
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
  <PageFrame
    :title="t(guide ? 'settings.guide' : 'settings.' + section)"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><UiButton @click="load">{{ t('settings.reload') }}</UiButton
      ><RouterLink
        v-if="!guide && runtime.realm === 'tenant'"
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
    <template v-if="guide">
      <UiStepIndicator
        :steps="[t('settings.access'), t('settings.enrollment'), t('settings.integrations')]"
        :current="step"
        :label="t('settings.guide')"
      />
      <p>{{ t('settings.firstLogin') }}</p>
      <fieldset v-if="step === 1" class="settings-actions">
        <legend>{{ t('settings.selectChannels') }}</legend>
        <label><input v-model="agent" type="checkbox" />{{ t('settings.channelAgent') }}</label
        ><label><input v-model="windows" type="checkbox" />{{ t('settings.channelWindows') }}</label
        ><label><input v-model="apple" type="checkbox" />{{ t('settings.channelApple') }}</label>
      </fieldset>
      <div v-if="step === 1" class="settings-actions">
        <RouterLink
          v-if="agent"
          :to="{ name: 'agent-configurations', params: { tenant: runtime.tenant } }"
          >{{ t('settings.channelAgent') }}</RouterLink
        ><RouterLink
          v-if="windows"
          :to="{ name: 'operations-windowsEntra', params: { tenant: runtime.tenant } }"
          >{{ t('settings.channelWindows') }}</RouterLink
        ><RouterLink v-if="apple" :to="settingsDestination('apns', runtime.tenant)">{{
          t('settings.channelApple')
        }}</RouterLink>
      </div>
      <p>{{ t('settings.allEntries') }}</p>
    </template>
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
          <p>
            {{ t('settings.owner') }}: {{ item.owner }} · {{ t('settings.custody') }}:
            {{ item.custody }}
          </p>
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
        </div>
        <div class="settings-catalog-state">
          <span class="ui-badge">{{ t('settings.status.' + item.status) }}</span
          ><RouterLink
            class="ui-button"
            :to="settingsDestination(entries[item.id].target, runtime.tenant)"
            >{{
              t(item.custody === 'deployment_operator' ? 'settings.operatorOnly' : 'settings.open')
            }}</RouterLink
          >
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
    <DeploymentPanel v-if="section === 'deployment'" />
    <OperationsPanel v-if="section === 'operations'" />
    <template v-if="guide && runtime.realm === 'tenant'">
      <template v-if="step === 1"
        ><details v-if="agent" class="console-panel">
          <summary>{{ t('settings.channelAgent') }}</summary>
          <MaterialPanel material="task" /><MaterialPanel material="packages" />
        </details>
        <details v-if="apple" class="console-panel">
          <summary>{{ t('settings.channelApple') }}</summary>
          <MaterialPanel material="apns" /><MaterialPanel material="profile" /><MaterialPanel
            material="managed_account"
          />
        </details>
        <details v-if="windows" class="console-panel">
          <summary>{{ t('settings.channelWindows') }}</summary>
          <MaterialPanel material="wns" /></details
      ></template>
      <template v-if="step === 2"
        ><details
          v-for="material in ['pki', 'storage', 'smtp', 'webhook']"
          :key="material"
          class="console-panel"
        >
          <summary>{{ t('settings.materialNames.' + material) }}</summary>
          <MaterialPanel :material="material" /></details
      ></template>
    </template>
    <div v-if="guide" class="settings-actions">
      <UiButton :disabled="step === 0" @click="step--">{{ t('settings.previous') }}</UiButton
      ><UiButton v-if="step < 2" @click="step++">{{ t('settings.next') }}</UiButton
      ><RouterLink
        v-else
        class="ui-button"
        :to="{ name: 'settings-overview', params: { tenant: runtime.tenant } }"
        >{{ t('settings.finish') }}</RouterLink
      >
    </div>
  </PageFrame>
</template>
