<script setup lang="ts">
import { comparison, allOf } from '../../../services/directory-query'
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import DevicePage from '../components/DevicePage.vue'
import { endpointStatuses } from '../clients/endpoint-model'
import PersonDisplay from '../components/PersonDisplay.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const statisticsOperation = useOperation([], () => deviceBinding(runtime))
const statistics = ref<Awaited<ReturnType<typeof runtime.devices.views.statistics>>>()
let statisticsBinding = ''
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
  const binding = JSON.stringify([deviceBinding(runtime), filter])
  if (!cursor || !statistics.value || binding !== statisticsBinding) {
    statisticsBinding = binding
    statistics.value = undefined
    void statisticsOperation.run(
      () => runtime.devices.views.statistics(filter),
      (v) => {
        if (binding === statisticsBinding) statistics.value = v
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
  if (['denied', 'cursorInvalidated', 'conflict'].includes(failure.value ?? '')) {
    statisticsBinding = ''
    statistics.value = undefined
  }
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
  <DevicePage
    :title="t('devices.directory')"
    :description="t('devices.workspace.directoryNote')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions>
      <v-btn
        variant="outlined"
        :to="{ name: 'device-search', params: { tenant: runtime.tenant } }"
        >{{ t('devices.search') }}</v-btn
      >
      <v-btn color="primary" :to="{ name: 'device-enroll', params: { tenant: runtime.tenant } }">{{
        t('devices.enroll')
      }}</v-btn>
    </template>
    <form class="console-toolbar device-filters" @submit.prevent="applyFilters">
      <v-text-field
        v-model="search"
        type="search"
        :label="t('devices.directorySearch')"
        maxlength="256"
        :disabled="busy"
      />
      <v-select
        v-model="platform"
        data-testid="directory-platform"
        :label="t('devices.platform')"
        :items="[
          { value: '', title: t('devices.all') },
          { value: 'windows', title: 'Windows' },
          { value: 'macos', title: 'macOS' },
        ]"
        :disabled="busy"
      />
      <v-btn type="submit" color="primary" :loading="busy">{{ t('devices.reload') }}</v-btn>
      <details class="device-filter-details">
        <summary>{{ t('devices.workspace.moreFilters') }}</summary>
        <div class="device-filter-grid">
          <v-select
            v-model="assetState"
            data-testid="directory-asset-state"
            :label="t('devices.assetStateLabel')"
            :items="[
              { value: '', title: t('devices.all') },
              ...['active', 'archived', 'deleted'].map((value) => ({
                value,
                title: t('devices.state.' + value),
              })),
            ]"
            :disabled="busy"
          />
          <v-select
            v-model="status"
            data-testid="directory-status"
            :label="t('devices.status')"
            :items="statusOptions"
            item-title="label"
            :disabled="busy"
          />
          <v-select
            v-model="channel"
            data-testid="directory-channel"
            :label="t('devices.channels')"
            :items="channelOptions"
            item-title="label"
            :disabled="busy"
          />
          <v-select
            v-model="source"
            data-testid="directory-source"
            :label="t('devices.source')"
            :items="sourceOptions"
            item-title="label"
            :disabled="busy"
          />
          <v-select
            v-model="limit"
            data-testid="directory-limit"
            :label="t('devices.pageSize')"
            :items="['20', '50', '100']"
            :disabled="busy"
          />
          <v-checkbox v-model="descending" :label="t('devices.descending')" :disabled="busy" />
        </div>
      </details>
    </form>
    <p v-if="failure === 'cursorInvalidated'" class="device-notice">
      {{ t('devices.restartDirectory')
      }}<v-btn :disabled="busy" variant="outlined" @click="queryFirstPage(route.query, true)">{{
        t('devices.reload')
      }}</v-btn>
    </p>
    <details class="device-section">
      <summary>{{ t('devices.displayColumns') }}</summary>
      <div class="device-columns">
        <v-checkbox
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
          v-model="visibleColumns"
          :value="key"
          :label="t('devices.' + (key === 'endpoints' ? 'originalEndpoint' : key))"
        />
        <v-btn variant="outlined" @click="applyFilters">{{ t('devices.save') }}</v-btn>
      </div>
    </details>
    <v-alert v-if="statisticsOperation.failure.value" type="warning" variant="tonal" role="alert">{{
      t('devices.' + statisticsOperation.failure.value)
    }}</v-alert>
    <div v-if="statistics" class="device-statistics" :aria-label="t('console.queryStatistics')">
      <article v-for="key in ['deviceViewCount', 'endpointCount'] as const" :key="key">
        <h2>{{ t(`devices.${key}`) }}</h2>
        <strong>{{ statistics.statistics[key] }}</strong>
      </article>
    </div>
    <div class="console-results device-directory">
      <v-table v-if="page || busy" :aria-label="t('devices.directory')">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column.key" scope="col">{{ column.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in page?.items ?? []" :key="rowKey(row)">
            <td v-for="column in columns" :key="column.key">
              <template v-if="column.key === 'reference'">
                <RouterLink class="device-name" :to="detail(row)">{{
                  row.endpoints
                    .map((e) =>
                      e.displayName?.state.kind === 'known'
                        ? e.displayName.state.value.value
                        : `${t('devices.unnamedDevice')} · ${e.id}`,
                    )
                    .join(' / ')
                }}</RouterLink>
                <small>{{
                  t(
                    row.reference.kind === 'association'
                      ? 'devices.unifiedView'
                      : 'devices.originalEndpoint',
                  )
                }}</small>
                <details>
                  <summary>{{ t('devices.evidence') }}</summary>
                  {{ row.reference.id }}
                </details>
              </template>
              <template v-else-if="column.key === 'platform'"
                ><p v-for="e in row.endpoints" :key="e.id">
                  {{
                    e.platform.state === 'known'
                      ? e.platform.values[0]
                      : t(
                          'devices.state.' +
                            (e.platform.state === 'unknown' ? 'missing' : 'conflict'),
                        )
                  }}
                </p></template
              >
              <template v-else-if="column.key === 'serialNumber'"
                ><p v-for="e in row.endpoints" :key="e.id">
                  {{
                    e.serialNumber?.state.kind === 'known'
                      ? e.serialNumber.state.value.value
                      : t('devices.notProvided')
                  }}
                </p></template
              >
              <template v-else-if="column.key === 'registrationUser'"
                ><p v-for="e in row.endpoints" :key="e.id">
                  <template v-if="e.registrationUser === undefined">{{
                    t('devices.notProvided')
                  }}</template
                  ><PersonDisplay
                    v-else-if="e.registrationUser.user"
                    :display="e.registrationUser.display"
                  /><template v-else>{{ t('registration.empty') }}</template>
                </p></template
              >
              <template v-else-if="column.key === 'currentUser'"
                ><p v-for="e in row.endpoints" :key="e.id">
                  {{
                    e.currentUser === undefined
                      ? t('devices.notProvided')
                      : t('devices.currentUserState.' + e.currentUser.state)
                  }}<PersonDisplay v-if="e.currentUser?.user" :display="e.currentUser.display" /></p
              ></template>
              <v-chip v-else-if="column.key === 'status'">{{
                row.association
                  ? t(`devices.associationState.${row.association.state}`)
                  : t(`devices.endpointState.${row.endpoints[0]?.status}`)
              }}</v-chip>
              <template v-else-if="column.key === 'channels'">{{
                row.endpoints.flatMap((e) => e.channels.map((c) => c.channel)).join(' + ')
              }}</template>
              <template v-else-if="column.key === 'endpoints'"
                ><p v-for="endpoint in row.endpoints" :key="endpoint.id">
                  <RouterLink
                    :to="{
                      name: 'device-detail',
                      params: { tenant: runtime.tenant, device: endpoint.id },
                      query: { directory: JSON.stringify(route.query) },
                    }"
                    >{{ endpoint.id }}</RouterLink
                  >
                </p></template
              >
            </td>
          </tr>
          <tr v-if="page && !page.items.length">
            <td :colspan="columns.length">{{ t('devices.empty') }}</td>
          </tr>
        </tbody>
      </v-table>
    </div>
    <nav
      v-if="page && (page.nextCursor || trail.length)"
      class="device-pagination"
      :aria-label="t('devices.directory')"
    >
      <v-btn variant="outlined" :disabled="busy || !trail.length" @click="navigate('previous')">{{
        t('devices.previous')
      }}</v-btn>
      <v-btn variant="outlined" :disabled="busy || !page.nextCursor" @click="navigate('next')">{{
        t('devices.next')
      }}</v-btn>
    </nav>
  </DevicePage>
</template>
