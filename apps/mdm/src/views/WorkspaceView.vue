<script setup lang="ts">
import { ref, watch } from 'vue'
import { isRssApiError } from '@rss/api/mdm'
import { UiButton, UiBadge, UiMessage } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../context'
import { useOperation } from '../services/useOperation'
import { deviceBinding } from '../features/devices/useDeviceBinding'
import PageFrame from '../components/PageFrame.vue'
import { features } from '../features'
import { moduleIds, type Workspace, type ModuleId } from '../services/workspace'
const { t } = useI18n(),
  runtime = useMdm()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
type Part<T> = { status: 'ready'; value: T } | { status: 'denied' | 'unavailable' | 'unsupported' }
const navigation = ref<Part<Workspace>>()
const directory = ref<Part<Awaited<ReturnType<typeof runtime.devices.views.list>>>>()
const approvals = ref<Part<Awaited<ReturnType<typeof runtime.policies.catalog.approvals>>>>()
const deployments = ref<Part<Awaited<ReturnType<typeof runtime.software.assignments.list>>>>()
const activity = ref<Part<Awaited<ReturnType<typeof runtime.operations.audit.list>>>>()
const readAt = ref('')
async function part<T>(read: () => Promise<T>): Promise<Part<T>> {
  try {
    return { status: 'ready', value: await read() }
  } catch (error) {
    return {
      status:
        isRssApiError(error) && error.status === 403
          ? 'denied'
          : isRssApiError(error) && error.status === 501
            ? 'unsupported'
            : 'unavailable',
    }
  }
}
function clear() {
  navigation.value = undefined
  directory.value = undefined
  approvals.value = undefined
  deployments.value = undefined
  activity.value = undefined
  readAt.value = ''
}
async function load() {
  if (busy.value) return
  clear()
  await run(
    async () => {
      const [nav, devices, requests, policies, events] = await Promise.all([
        part(() => runtime.workspace.read()),
        part(() => runtime.devices.views.list({})),
        part(() => runtime.policies.catalog.approvals()),
        part(() => runtime.software.assignments.list()),
        part(() => runtime.operations.audit.list()),
      ])
      return { nav, devices, requests, policies, events }
    },
    (result) => {
      navigation.value = result.nav
      directory.value = result.devices
      approvals.value = result.requests
      deployments.value = result.policies
      activity.value = result.events
      readAt.value = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    },
  )
}
function moduleState(id: ModuleId) {
  return navigation.value?.status === 'ready'
    ? navigation.value.value.modules.find((module) => module.id === id)
    : undefined
}
function areaRoute(id: ModuleId) {
  if (!features[id]) return undefined
  return {
    name: {
      devices: 'devices',
      policies: 'policy-policies',
      software: 'software-catalog',
      security: 'security-compliance',
      operations: 'operations-organization',
    }[id],
    params: { tenant: runtime.tenant },
  }
}
const at = (value: number) =>
  new Date(value * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
watch(
  () => deviceBinding(runtime),
  () => {
    clear()
    if (runtime.session.state.value.status === 'authenticated') void load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <PageFrame
    :title="t('console.overview')"
    :description="t('mdm.intro')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><UiButton :busy="busy" @click="load">{{ t('mdm.reload') }}</UiButton></template
    >
    <p v-if="readAt" class="console-reading-time">{{ t('console.readAt') }} · {{ readAt }}</p>
    <div class="console-stat-grid">
      <article
        v-for="key in ['deviceViewCount', 'endpointCount'] as const"
        :key="key"
        class="console-stat"
      >
        <h2>{{ t(`devices.${key}`) }}</h2>
        <strong>{{ directory?.status === 'ready' ? directory.value.statistics[key] : '—' }}</strong>
        <p>
          {{
            directory?.status === 'ready'
              ? t('console.authorizedDirectory')
              : directory
                ? t(`devices.${directory.status}`)
                : t('console.reading')
          }}
        </p>
        <RouterLink :to="{ name: 'devices', params: { tenant: runtime.tenant } }"
          >{{ t('console.openSource') }} ↗</RouterLink
        >
      </article>
      <article class="console-stat">
        <h2>{{ t('operations.workflowRequests') }}</h2>
        <strong class="console-stat-word">{{
          approvals?.status === 'ready'
            ? t(approvals.value.items.length ? 'console.pendingRequests' : 'console.emptyPage')
            : '—'
        }}</strong>
        <p>
          {{
            approvals?.status === 'ready'
              ? t('console.pageNotTotal')
              : approvals
                ? t(`devices.${approvals.status}`)
                : t('console.reading')
          }}
        </p>
        <RouterLink :to="{ name: 'operations-approvals', params: { tenant: runtime.tenant } }"
          >{{ t('operations.approvals') }} ↗</RouterLink
        >
      </article>
      <article class="console-stat">
        <h2>{{ t('software.deployments') }}</h2>
        <strong class="console-stat-word">{{
          deployments?.status === 'ready'
            ? t(
                deployments.value.items.length
                  ? 'console.configuredDeployments'
                  : 'console.emptyPage',
              )
            : '—'
        }}</strong>
        <p>{{ t('console.deploymentEvidence') }}</p>
        <RouterLink :to="{ name: 'software-deployments', params: { tenant: runtime.tenant } }"
          >{{ t('console.openSource') }} ↗</RouterLink
        >
      </article>
    </div>
    <div class="console-overview-columns">
      <section class="console-panel">
        <div class="console-page-header">
          <h2>{{ t('console.attention') }}</h2>
          <RouterLink :to="{ name: 'operations-approvals', params: { tenant: runtime.tenant } }">{{
            t('console.browse')
          }}</RouterLink>
        </div>
        <p v-if="approvals?.status !== 'ready'">
          {{ approvals ? t(`devices.${approvals.status}`) : t('console.reading') }}
        </p>
        <template v-else
          ><p v-if="!approvals.value.items.length">{{ t('console.emptyPage') }}</p>
          <ul v-else class="console-activity-list">
            <li v-for="item in approvals.value.items.slice(0, 5)" :key="item.run">
              <span class="console-activity-dot" aria-hidden="true" />
              <div>
                <RouterLink
                  :to="{
                    name: 'policy-workflows',
                    params: { tenant: runtime.tenant },
                    query: { id: item.id, run: item.run },
                  }"
                  >{{ item.label }}</RouterLink
                ><small>{{ t('policies.revision') }} {{ item.revision }}</small>
              </div>
              <UiBadge tone="warning">{{ t('console.pendingRequests') }}</UiBadge>
            </li>
          </ul>
          <p class="console-reading-time">{{ t('console.pageNotTotal') }}</p></template
        >
      </section>
      <section class="console-panel">
        <div class="console-page-header">
          <h2>{{ t('operations.audit') }}</h2>
          <RouterLink :to="{ name: 'operations-audit', params: { tenant: runtime.tenant } }">{{
            t('console.browse')
          }}</RouterLink>
        </div>
        <p v-if="activity?.status !== 'ready'">
          {{ activity ? t(`devices.${activity.status}`) : t('console.reading') }}
        </p>
        <template v-else
          ><p v-if="!activity.value.items.length">{{ t('console.emptyPage') }}</p>
          <ul v-else class="console-activity-list">
            <li v-for="entry in activity.value.items.slice(0, 5)" :key="entry.id">
              <span class="console-activity-dot" aria-hidden="true" />
              <div>
                <RouterLink
                  :to="{
                    name: 'operations-audit',
                    params: { tenant: runtime.tenant },
                    query: { id: entry.id },
                  }"
                  >{{ t(`operations.actionName.${entry.action}`) }}</RouterLink
                ><small>{{ at(entry.at) }}</small>
              </div>
              <UiBadge>{{ t(`operations.outcomes.${entry.outcome}`) }}</UiBadge>
            </li>
          </ul></template
        >
      </section>
    </div>
    <section class="console-panel">
      <div class="console-page-header">
        <h2>{{ t('software.deployments') }}</h2>
        <RouterLink :to="{ name: 'software-deployments', params: { tenant: runtime.tenant } }">{{
          t('console.browse')
        }}</RouterLink>
      </div>
      <p v-if="deployments?.status !== 'ready'">
        {{ deployments ? t(`devices.${deployments.status}`) : t('console.reading') }}
      </p>
      <template v-else
        ><p v-if="!deployments.value.items.length">{{ t('console.emptyPage') }}</p>
        <ul v-else class="console-deployment-list">
          <li v-for="policy in deployments.value.items.slice(0, 4)" :key="policy.id">
            <RouterLink
              :to="{
                name: 'software-deployments',
                params: { tenant: runtime.tenant },
                query: { id: policy.id },
              }"
              ><strong>{{ t(`software.intent_${policy.definition.action.intent}`) }}</strong
              ><small
                >{{ policy.definition.action.resource.id }} /
                {{ policy.definition.action.resource.version }}</small
              ></RouterLink
            ><UiBadge>{{ t(policy.enabled ? 'software.enabled' : 'software.paused') }}</UiBadge
            ><RouterLink
              :to="{
                name: 'software-deployments',
                params: { tenant: runtime.tenant },
                query: { id: policy.id },
              }"
              >{{ t('software.rollout') }} ↗</RouterLink
            >
          </li>
        </ul></template
      >
    </section>
    <section>
      <h2 class="console-section-title">{{ t('console.modules') }}</h2>
      <UiMessage
        v-if="navigation && navigation.status !== 'ready'"
        tone="warning"
        :title="t(navigation.status === 'denied' ? 'mdm.queryDenied' : 'mdm.unavailable')"
      />
      <div class="console-area-grid">
        <article v-for="id in moduleIds" :key="id" class="console-area">
          <h3>{{ t(`mdm.${id}`) }}</h3>
          <small
            >{{ t('mdm.source') }} ·
            {{ t(`mdm.${moduleState(id)?.source ?? 'unknownSource'}`) }}</small
          >
          <p v-if="moduleState(id)?.available == null">{{ t('mdm.unknown') }}</p>
          <p v-else-if="!moduleState(id)?.available">{{ t('mdm.denied') }}</p>
          <RouterLink v-else-if="areaRoute(id)" :to="areaRoute(id)!"
            >{{ t('mdm.open') }} ↗</RouterLink
          >
          <p v-else>{{ t('mdm.planned') }}</p>
        </article>
      </div>
    </section>
    <p class="console-reading-time">{{ t('mdm.boundary') }}</p>
  </PageFrame>
</template>
