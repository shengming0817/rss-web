<script setup lang="ts">
import { comparison } from '../services/directory-query'
import { ref, watch } from 'vue'
import { isRssApiError } from '@rss/api/mdm'
import { VBtn, VChip, VAlert, VCard } from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../context'
import { useOperation } from '../services/useOperation'
import { deviceBinding } from '../features/devices/useDeviceBinding'
import MdmPage from '../ui/MdmPage.vue'
import { features } from '../features'
import { moduleIds, type Workspace, type ModuleId } from '../services/workspace'
const { t } = useI18n(),
  runtime = useMdm()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
type Part<T> = { status: 'ready'; value: T } | { status: 'denied' | 'unavailable' | 'unsupported' }
const navigation = ref<Part<Workspace>>()
const directory = ref<Part<Awaited<ReturnType<typeof runtime.devices.views.statistics>>>>()
const deployments = ref<Part<Awaited<ReturnType<typeof runtime.policies.policies.list>>>>()
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
  deployments.value = undefined
  readAt.value = ''
}
async function load() {
  if (busy.value) return
  clear()
  await run(
    async () => {
      const [nav, devices, policies] = await Promise.all([
        part(() => runtime.workspace.read()),
        part(() => runtime.devices.views.statistics()),
        part(() =>
          runtime.policies.policies.list({ filter: comparison('action', '==', 'software') }),
        ),
      ])
      return { nav, devices, policies }
    },
    (result) => {
      navigation.value = result.nav
      directory.value = result.devices
      deployments.value = result.policies
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
  <MdmPage
    :title="t('console.overview')"
    :description="t('mdm.intro')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><VBtn :loading="busy" @click="load">{{ t('mdm.reload') }}</VBtn></template
    >
    <p v-if="readAt" class="console-reading-time">{{ t('console.readAt') }} · {{ readAt }}</p>
    <div class="console-stat-grid">
      <VCard
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
      </VCard>
      <VCard class="console-stat">
        <h2>{{ t('console.softwarePolicies') }}</h2>
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
        <RouterLink :to="{ name: 'policy-policies', params: { tenant: runtime.tenant } }"
          >{{ t('console.openSource') }} ↗</RouterLink
        >
      </VCard>
    </div>
    <section class="console-panel">
      <div class="console-page-header">
        <h2>{{ t('console.softwarePolicies') }}</h2>
        <RouterLink :to="{ name: 'policy-policies', params: { tenant: runtime.tenant } }">{{
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
                name: 'policy-policies',
                params: { tenant: runtime.tenant },
                query: { action: 'software', id: policy.id },
              }"
              ><strong>{{
                policy.definition.action.kind === 'software'
                  ? t(`software.intent_${policy.definition.action.intent}`)
                  : '—'
              }}</strong
              ><small
                >{{
                  policy.definition.action.kind === 'software'
                    ? policy.definition.action.resource.id
                    : policy.id
                }}
                /
                {{
                  policy.definition.action.kind === 'software'
                    ? policy.definition.action.resource.version
                    : '—'
                }}</small
              ></RouterLink
            ><VChip>{{
              t(policy.state === 'enabled' ? 'software.enabled' : 'software.paused')
            }}</VChip
            ><RouterLink
              :to="{
                name: 'policy-policies',
                params: { tenant: runtime.tenant },
                query: { action: 'software', id: policy.id },
              }"
              >{{ t('software.rollout') }} ↗</RouterLink
            >
          </li>
        </ul></template
      >
    </section>
    <section>
      <h2 class="console-section-title">{{ t('console.modules') }}</h2>
      <VAlert
        v-if="navigation && navigation.status !== 'ready'"
        type="warning"
        variant="tonal"
        :title="t(navigation.status === 'denied' ? 'mdm.queryDenied' : 'mdm.unavailable')"
      />
      <div class="console-area-grid">
        <VCard v-for="id in moduleIds" :key="id" class="console-area">
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
        </VCard>
      </div>
    </section>
    <p class="console-reading-time">{{ t('mdm.boundary') }}</p>
  </MdmPage>
</template>
