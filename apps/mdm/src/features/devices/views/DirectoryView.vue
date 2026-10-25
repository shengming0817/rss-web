<script setup lang="ts">
import { comparison, allOf } from '../../../services/directory-query'
import {
  UiButton,
  UiTable,
  UiPagination,
  UiSelect,
  UiCheckbox,
  UiBadge,
} from '@rss/core/components'
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
import { endpointStatuses } from '../clients/endpoint-model'
import PersonDisplay from '../components/PersonDisplay.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const statisticsOperation = useOperation([], () => deviceBinding(runtime))
const statistics = ref<Awaited<ReturnType<typeof runtime.devices.views.statistics>>>()
const page = ref<Awaited<ReturnType<typeof runtime.devices.views.list>>>(),
  search = ref(''),
  platform = ref(''),
  assetState = ref(''),
  limit = ref('20'),
  status = ref(''),
  channel = ref(''),
  source = ref(''),
  descending = ref(false),
  visibleColumns = ref([
    'reference',
    'platform',
    'serialNumber',
    'registrationUser',
    'currentUser',
    'status',
    'channels',
    'endpoints',
  ])
const trail = computed(() => {
  const v = route.query['trail']
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : typeof v === 'string'
      ? [v]
      : []
})
function navigate(direction: number | 'previous' | 'next') {
  if (typeof direction === 'number') return
  const next =
    direction === 'next'
      ? [...trail.value, String(route.query['cursor'] ?? '')]
      : trail.value.slice(0, -1)
  void router.push({
    query: {
      ...route.query,
      cursor: direction === 'next' ? page.value?.nextCursor : trail.value.at(-1) || undefined,
      trail: next,
    },
  })
}
async function applyFilters() {
  if (new TextEncoder().encode(search.value.trim()).length > 256 || /\p{Cc}/u.test(search.value)) {
    failure.value = 'invalidRequest'
    return
  }
  await queryFirstPage({
    search: search.value.trim() || undefined,
    platform: platform.value || undefined,
    assetState: assetState.value || undefined,
    limit: limit.value,
    status: status.value || undefined,
    channel: channel.value || undefined,
    source: source.value || undefined,
    descending: descending.value ? 'true' : undefined,
    columns: visibleColumns.value,
  })
}
async function queryFirstPage(query: LocationQueryRaw, replace = false) {
  if (busy.value) return
  const before = route.fullPath
  const location = { query: { ...query, cursor: undefined, trail: undefined } }
  await (replace ? router.replace(location) : router.push(location))
  if (route.fullPath === before) await loadRoute()
}
async function load(cursor?: string) {
  page.value = undefined
  const filter = allOf(
    search.value.trim() ? comparison('search', '=icontains=', search.value.trim()) : undefined,
    ...(['platform', 'assetState', 'status', 'channel', 'source'] as const).map((key) => {
      const value = { platform, assetState, status, channel, source }[key].value
      return value ? comparison(key, '==', value) : undefined
    }),
  )
  if (!cursor || !statistics.value) {
    statistics.value = undefined
    void statisticsOperation.run(
      () => runtime.devices.views.statistics(filter),
      (v) => {
        statistics.value = v
      },
    )
  }
  await run(
    () =>
      runtime.devices.views.list({
        cursor,
        filter,
        sort: [descending.value ? '-key' : 'key'],
        fields: ['key', 'reference', 'association', 'endpoints'],
        limit: Number(limit.value),
      }),
    (v) => {
      page.value = v
    },
  )
}
function loadRoute() {
  search.value = typeof route.query['search'] === 'string' ? route.query['search'] : ''
  platform.value = typeof route.query['platform'] === 'string' ? route.query['platform'] : ''
  assetState.value = typeof route.query['assetState'] === 'string' ? route.query['assetState'] : ''
  limit.value = ['20', '50', '100'].includes(String(route.query['limit']))
    ? String(route.query['limit'])
    : '20'
  status.value = typeof route.query['status'] === 'string' ? route.query['status'] : ''
  channel.value = typeof route.query['channel'] === 'string' ? route.query['channel'] : ''
  source.value = typeof route.query['source'] === 'string' ? route.query['source'] : ''
  descending.value = route.query['descending'] === 'true'
  const cols = route.query['columns']
  if (cols)
    visibleColumns.value = [
      ...new Set([
        'reference',
        ...(Array.isArray(cols) ? cols : [cols]).filter((x): x is string =>
          [
            'platform',
            'serialNumber',
            'registrationUser',
            'currentUser',
            'status',
            'channels',
            'endpoints',
          ].includes(String(x)),
        ),
      ]),
    ]
  page.value = undefined
  return load(typeof route.query['cursor'] === 'string' ? route.query['cursor'] : undefined)
}
watch(() => [route.fullPath, ...deviceBinding(runtime)], loadRoute, {
  immediate: true,
  flush: 'sync',
})
type Row = NonNullable<typeof page.value>['items'][number]
const columns = computed(() =>
  [
    { key: 'reference', label: t('devices.viewIdentity') },
    ...['platform', 'serialNumber', 'registrationUser', 'currentUser'].map((key) => ({
      key,
      label: t('devices.' + key),
    })),
    { key: 'status', label: t('devices.status') },
    { key: 'channels', label: t('devices.channels') },
    { key: 'endpoints', label: t('devices.originalEndpoint') },
  ].filter((c) => visibleColumns.value.includes(c.key)),
)
const rowKey = (item: Row) => `${item.reference.kind}:${item.reference.id}`
function detail(item: Row) {
  return item.reference.kind === 'endpoint'
    ? {
        name: 'device-detail',
        params: { tenant: runtime.tenant, device: item.reference.id },
        query: { directory: JSON.stringify(route.query) },
      }
    : {
        name: 'device-view-detail',
        params: { tenant: runtime.tenant, kind: item.reference.kind, view: item.reference.id },
        query: { directory: JSON.stringify(route.query) },
      }
}
const statusOptions = computed(() => [
  { value: '', label: t('devices.all') },
  ...endpointStatuses.map((value) => ({ value, label: t(`devices.endpointState.${value}`) })),
])
const channelOptions = computed(() => [
  { value: '', label: t('devices.all') },
  { value: 'mdm', label: 'MDM' },
  { value: 'agent', label: 'Agent' },
])
const sourceOptions = computed(() => [
  { value: '', label: t('devices.all') },
  ...(['mdm.windows', 'mdm.apple', 'agent.builtin'] as const).map((value) => ({
    value,
    label: t(`devices['${value}']`),
  })),
])
</script>
<template>
  <PageFrame :title="t('devices.directory')" :busy="busy" :failure="failure">
    <template #actions
      ><RouterLink
        class="ui-button ui-button--secondary"
        :to="{ name: 'device-search', params: { tenant: runtime.tenant } }"
        >{{ t('devices.search') }}</RouterLink
      ><RouterLink
        class="ui-button ui-button--primary"
        :to="{ name: 'device-enroll', params: { tenant: runtime.tenant } }"
        >{{ t('devices.enroll') }}</RouterLink
      ></template
    >
    <form class="console-toolbar" @submit.prevent="applyFilters">
      <label
        >{{ t('devices.directorySearch')
        }}<input v-model="search" type="search" class="ui-input" maxlength="256" :disabled="busy"
      /></label>
      <label
        >{{ t('devices.platform')
        }}<select v-model="platform" class="ui-input" :disabled="busy">
          <option value="">{{ t('devices.all') }}</option>
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
        </select></label
      >
      <label
        >{{ t('devices.assetStateLabel')
        }}<select v-model="assetState" class="ui-input" :disabled="busy">
          <option value="">{{ t('devices.all') }}</option>
          <option v-for="value in ['active', 'archived', 'deleted']" :key="value" :value="value">
            {{ t('devices.state.' + value) }}
          </option>
        </select></label
      >
      <label
        >{{ t('devices.pageSize')
        }}<select v-model="limit" class="ui-input" :disabled="busy">
          <option v-for="n in ['20', '50', '100']" :key="n" :value="n">{{ n }}</option>
        </select></label
      >
      <label
        >{{ t('devices.status')
        }}<UiSelect v-model="status" :options="statusOptions" :disabled="busy"
      /></label>
      <label
        >{{ t('devices.channels')
        }}<UiSelect v-model="channel" :options="channelOptions" :disabled="busy"
      /></label>
      <label
        >{{ t('devices.source')
        }}<UiSelect v-model="source" :options="sourceOptions" :disabled="busy"
      /></label>
      <UiCheckbox v-model="descending" :label="t('devices.descending')" :disabled="busy" />
      <UiButton type="submit" :busy="busy">{{ t('devices.reload') }}</UiButton>
    </form>
    <p v-if="failure === 'cursorInvalidated'">
      {{ t('devices.restartDirectory')
      }}<UiButton :disabled="busy" @click="queryFirstPage(route.query, true)">{{
        t('devices.reload')
      }}</UiButton>
    </p>
    <details class="console-panel">
      <summary>{{ t('devices.displayColumns') }}</summary>
      <label
        v-for="key in [
          'platform',
          'serialNumber',
          'registrationUser',
          'currentUser',
          'status',
          'channels',
          'endpoints',
        ]"
        :key="key"
        ><input v-model="visibleColumns" type="checkbox" :value="key" />{{
          t('devices.' + (key === 'endpoints' ? 'originalEndpoint' : key))
        }}</label
      ><UiButton @click="applyFilters">{{ t('devices.save') }}</UiButton>
    </details>
    <p v-if="statisticsOperation.failure.value" role="alert">
      {{ t('devices.' + statisticsOperation.failure.value) }}
    </p>
    <div v-if="statistics" class="console-stat-grid" :aria-label="t('console.queryStatistics')">
      <article
        v-for="key in ['deviceViewCount', 'endpointCount'] as const"
        :key="key"
        class="console-stat"
      >
        <h2>{{ t(`devices.${key}`) }}</h2>
        <strong>{{ statistics.statistics[key] }}</strong>
      </article>
    </div>
    <div class="console-results">
      <UiTable
        v-if="page || busy"
        :label="t('devices.directory')"
        :rows="page?.items ?? []"
        :columns="columns"
        :row-key="rowKey"
        :busy="busy"
        :busy-label="t('devices.loading')"
        :empty-label="t('devices.empty')"
      >
        <template #cell-reference="{ row }"
          ><RouterLink :to="detail(row)"
            >{{
              t(
                row.reference.kind === 'association'
                  ? 'devices.unifiedView'
                  : 'devices.originalEndpoint',
              )
            }}
            ·
            {{
              row.endpoints
                .map((e) =>
                  e.displayName?.state.kind === 'known'
                    ? e.displayName.state.value.value
                    : t('devices.unnamedDevice'),
                )
                .join(' / ')
            }}
          </RouterLink>
          <details>
            <summary>{{ t('devices.evidence') }}</summary>
            {{ row.reference.id }}
          </details></template
        >
        <template #cell-platform="{ row }"
          ><p v-for="e in row.endpoints" :key="e.id">
            {{
              e.platform.state === 'known'
                ? e.platform.values[0]
                : t('devices.state.' + (e.platform.state === 'unknown' ? 'missing' : 'conflict'))
            }}
          </p></template
        >
        <template #cell-serialNumber="{ row }"
          ><p v-for="e in row.endpoints" :key="e.id">
            {{
              e.serialNumber?.state.kind === 'known'
                ? e.serialNumber.state.value.value
                : t('devices.notProvided')
            }}
          </p></template
        >
        <template #cell-registrationUser="{ row }"
          ><p v-for="e in row.endpoints" :key="e.id">
            <template v-if="e.registrationUser === undefined">{{
              t('devices.notProvided')
            }}</template>
            <PersonDisplay
              v-else-if="e.registrationUser.user"
              :display="e.registrationUser.display"
            />
            <template v-else>{{ t('registration.empty') }}</template>
          </p></template
        >
        <template #cell-currentUser="{ row }"
          ><p v-for="e in row.endpoints" :key="e.id">
            {{
              e.currentUser === undefined
                ? t('devices.notProvided')
                : t('devices.currentUserState.' + e.currentUser.state)
            }}<PersonDisplay v-if="e.currentUser?.user" :display="e.currentUser.display" /></p
        ></template>
        <template #cell-status="{ row }"
          ><UiBadge>{{
            row.association
              ? t(`devices.associationState.${row.association.state}`)
              : t(`devices.endpointState.${row.endpoints[0]?.status}`)
          }}</UiBadge></template
        >
        <template #cell-channels="{ row }">{{
          row.endpoints.flatMap((e) => e.channels.map((c) => c.channel)).join(' + ')
        }}</template>
        <template #cell-endpoints="{ row }"
          ><ul>
            <li v-for="endpoint in row.endpoints" :key="endpoint.id">
              <RouterLink
                :to="{
                  name: 'device-detail',
                  params: { tenant: runtime.tenant, device: endpoint.id },
                  query: { directory: JSON.stringify(route.query) },
                }"
                >{{ endpoint.id }}</RouterLink
              >
            </li>
          </ul></template
        >
      </UiTable>
    </div>
    <UiPagination
      v-if="page && (page.nextCursor || trail.length)"
      :state="{ kind: 'cursor', hasPrevious: trail.length > 0, hasNext: !!page?.nextCursor }"
      :label="t('devices.directory')"
      :previous-label="t('devices.previous')"
      :next-label="t('devices.next')"
      :busy="busy"
      @navigate="navigate"
    />
  </PageFrame>
</template>
