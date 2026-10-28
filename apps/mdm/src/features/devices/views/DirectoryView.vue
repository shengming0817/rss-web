<script setup lang="ts">
import { QueryRows as DirectoryResults } from '@rss/core'
import { objectRef } from '../clients/objects'
import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import { comparison, allOf } from '@rss/api/mdm-query'
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
import InventoryQuery from '../components/InventoryQuery.vue'
import { groupMessages } from '../group-i18n'
import {
  VBtn,
  VTextField,
  VSelect,
  VCheckbox,
  VAlert,
  VTable,
  VChip,
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelText,
} from 'vuetify/components'
import { endpointStatuses } from '../clients/endpoint-model'
import PersonDisplay from '../components/PersonDisplay.vue'
const { t } = useI18n({ useScope: 'local', messages: groupMessages }),
  runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const statisticsBinding = ref('')
const statisticsOperation = useOperation(
  [],
  () => [...deviceBinding(runtime), statisticsBinding.value],
  () => route.path,
)
const statistics = ref<Awaited<ReturnType<typeof runtime.devices.views.statistics>>>()
const page = ref<Awaited<ReturnType<typeof runtime.devices.views.list>>>(),
  search = ref(''),
  rsql = ref(''),
  platform = ref(''),
  assetState = ref(''),
  limit = ref('50'),
  status = ref(''),
  channel = ref(''),
  source = ref(''),
  serverFields = ref<string[]>(['key', 'reference', 'association', 'endpoints']),
  acceptedFields = ref<string[]>(['key', 'reference', 'association', 'endpoints']),
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
async function navigate(direction: number | 'previous' | 'next') {
  if (typeof direction === 'number') return
  const next =
    direction === 'next'
      ? [...trail.value, String(route.query['cursor'] ?? '')]
      : trail.value.slice(0, -1)
  const query = {
    ...route.query,
    cursor: direction === 'next' ? page.value?.nextCursor : trail.value.at(-1) || undefined,
    trail: next,
  }
  if (await load(query)) await commitRoute(query)
}
async function applyFilters() {
  if (new TextEncoder().encode(search.value.trim()).length > 256 || /\p{Cc}/u.test(search.value)) {
    failure.value = 'invalidRequest'
    return
  }
  await queryFirstPage({
    search: search.value.trim() || undefined,
    filter: rsql.value.trim() || undefined,
    platform: platform.value || undefined,
    assetState: assetState.value || undefined,
    limit: limit.value,
    status: status.value || undefined,
    channel: channel.value || undefined,
    source: source.value || undefined,
    descending: descending.value ? 'true' : undefined,
    columns: visibleColumns.value,
    fields: serverFields.value,
  })
}
let navigating = false
async function commitRoute(query: LocationQueryRaw, replace = false) {
  navigating = true
  try {
    await (replace ? router.replace({ query }) : router.push({ query }))
  } finally {
    navigating = false
  }
}
async function queryFirstPage(query: LocationQueryRaw, replace = false) {
  if (busy.value) return
  const candidate = { ...query, cursor: undefined, trail: undefined }
  if (await load(candidate)) await commitRoute(candidate, replace)
}
function queryText(query: LocationQueryRaw, key: string) {
  const value = query[key]
  return typeof value === 'string' ? value : ''
}
function fieldsFor(query: LocationQueryRaw) {
  const fields = query['fields']
  return fields === undefined
    ? (['key', 'reference', 'association', 'endpoints'] as const)
    : (Array.isArray(fields) ? fields : [fields]).filter(
        (field): field is 'key' | 'reference' | 'association' | 'endpoints' =>
          ['key', 'reference', 'association', 'endpoints'].includes(String(field)),
      )
}
async function load(query: LocationQueryRaw = route.query) {
  if (busy.value) return false
  page.value = undefined
  const cursor = queryText(query, 'cursor') || undefined
  const filter = allOf(
    queryText(query, 'filter') || undefined,
    queryText(query, 'search')
      ? comparison('search', '=icontains=', queryText(query, 'search'))
      : undefined,
    ...(['platform', 'assetState', 'status', 'channel', 'source'] as const).map((key) =>
      queryText(query, key) ? comparison(key, '==', queryText(query, key)) : undefined,
    ),
  )
  const binding = JSON.stringify([deviceBinding(runtime), filter])
  if (!cursor || !statistics.value || binding !== statisticsBinding.value) {
    statisticsBinding.value = binding
    statistics.value = undefined
    void statisticsOperation.run(
      () => runtime.devices.views.statistics(filter),
      (value) => {
        if (binding === statisticsBinding.value) statistics.value = value
      },
    )
  }
  const fields = fieldsFor(query)
  const ok = await run(
    () =>
      runtime.devices.views.list({
        cursor,
        filter,
        sort: [query['descending'] === 'true' ? '-key' : 'key'],
        fields,
        limit: Number(queryText(query, 'limit') || '50'),
      }),
    (value) => {
      page.value = value
      acceptedFields.value = [...fields]
    },
  )
  if (!ok) {
    statisticsBinding.value = ''
    statistics.value = undefined
  }
  return ok
}
function readProjected(row: Record<string, unknown>) {
  if (!row['reference']) return
  void router.push(detail({ reference: objectRef(row['reference']) }))
}
function loadRoute() {
  rsql.value = typeof route.query['filter'] === 'string' ? route.query['filter'] : ''
  search.value = typeof route.query['search'] === 'string' ? route.query['search'] : ''
  platform.value = typeof route.query['platform'] === 'string' ? route.query['platform'] : ''
  assetState.value = typeof route.query['assetState'] === 'string' ? route.query['assetState'] : ''
  limit.value = typeof route.query['limit'] === 'string' ? route.query['limit'] : '50'
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
  serverFields.value = [...fieldsFor(route.query)]
  page.value = undefined
  return load(route.query)
}
watch(
  () => [route.fullPath, ...deviceBinding(runtime)],
  () => {
    if (!navigating) void loadRoute()
  },
  {
    immediate: true,
    flush: 'sync',
  },
)
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
function detail(item: Pick<Row, 'reference'>) {
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
  <MdmPage
    :title="t('devices.directory')"
    :description="t('devices.workspace.directoryNote')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions>
      <v-btn
        color="primary"
        :to="{ name: 'self-enrollments', params: { tenant: runtime.tenant } }"
        >{{ t('devices.enroll') }}</v-btn
      >
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
      <MdmDisclosure class="device-filter-details">
        <template #title>{{ t('devices.workspace.moreFilters') }}</template>
        <div class="device-filter-grid">
          <v-text-field
            v-model="rsql"
            data-testid="directory-rsql"
            :label="t('groupModule.rsql')"
            :hint="t('groupModule.rsqlHint')"
            persistent-hint
            :disabled="busy"
            maxlength="8192"
          />
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
          <v-text-field
            v-model="limit"
            type="number"
            min="1"
            max="100"
            required
            data-testid="directory-limit"
            :label="t('devices.pageSize')"
            :disabled="busy"
          />
          <v-select
            v-model="serverFields"
            multiple
            :items="['key', 'reference', 'association', 'endpoints']"
            :label="t('devices.columns')"
            :disabled="busy"
          />
          <v-checkbox v-model="descending" :label="t('devices.descending')" :disabled="busy" />
        </div>
      </MdmDisclosure>
    </form>
    <v-expansion-panels
      ><v-expansion-panel :title="t('groupModule.advanced')"
        ><v-expansion-panel-text eager
          ><InventoryQuery /></v-expansion-panel-text></v-expansion-panel
    ></v-expansion-panels>
    <p v-if="failure === 'cursorInvalidated'" class="device-notice">
      {{ t('devices.restartDirectory')
      }}<v-btn :disabled="busy" variant="outlined" @click="queryFirstPage(route.query, true)">{{
        t('devices.reload')
      }}</v-btn>
    </p>
    <MdmDisclosure class="device-section">
      <template #title>{{ t('devices.displayColumns') }}</template>
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
    </MdmDisclosure>
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
      <DirectoryResults
        :disabled="busy"
        :required="['reference']"
        v-if="page && acceptedFields.length < 4"
        :items="page.items"
        @open="readProjected"
      />
      <v-table
        v-if="acceptedFields.length === 4 && (page || busy)"
        :aria-label="t('devices.directory')"
      >
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
                <MdmDisclosure>
                  <template #title>{{ t('devices.evidence') }}</template>
                  {{ row.reference.id }}
                </MdmDisclosure>
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
      <v-btn variant="outlined" :disabled="busy" @click="queryFirstPage(route.query)">{{
        t('devices.reload')
      }}</v-btn>
      <v-btn variant="outlined" :disabled="busy || !trail.length" @click="navigate('previous')">{{
        t('devices.previous')
      }}</v-btn>
      <v-btn variant="outlined" :disabled="busy || !page.nextCursor" @click="navigate('next')">{{
        t('devices.next')
      }}</v-btn>
    </nav>
  </MdmPage>
</template>
