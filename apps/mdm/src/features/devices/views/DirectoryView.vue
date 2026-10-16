<script setup lang="ts">
import {
  UiButton,
  UiTable,
  UiPagination,
  UiSelect,
  UiCheckbox,
  UiBadge,
} from '@rss/core/components'
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
import { endpointStatuses } from '../clients/endpoint-model'
const { t } = useI18n(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const page = ref<Awaited<ReturnType<typeof runtime.devices.views.list>>>(),
  status = ref(''),
  channel = ref(''),
  source = ref(''),
  descending = ref(false)
async function load(cursor?: string) {
  page.value = undefined
  await run(
    () =>
      runtime.devices.views.list({
        cursor,
        status: status.value || undefined,
        channel: channel.value || undefined,
        source: source.value || undefined,
        descending: descending.value,
      }),
    (v) => (page.value = v),
  )
}
watch(
  [status, channel, source, descending],
  () => {
    page.value = undefined
  },
  { flush: 'sync' },
)
watch(
  () => deviceBinding(runtime),
  () => {
    page.value = undefined
    void load()
  },
  { immediate: true, flush: 'sync' },
)
type Row = NonNullable<typeof page.value>['items'][number]
const columns = computed(() => [
  { key: 'reference', label: t('devices.viewIdentity') },
  { key: 'status', label: t('devices.status') },
  { key: 'channels', label: t('devices.channels') },
  { key: 'endpoints', label: t('devices.originalEndpoint') },
])
const rowKey = (item: Row) => `${item.reference.kind}:${item.reference.id}`
function detail(item: Row) {
  return item.reference.kind === 'endpoint'
    ? { name: 'device-detail', params: { tenant: runtime.tenant, device: item.reference.id } }
    : {
        name: 'device-view-detail',
        params: { tenant: runtime.tenant, kind: item.reference.kind, view: item.reference.id },
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
  ...['mdm.windows', 'mdm.apple', 'agent.builtin'].map((value) => ({
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
    <form class="console-toolbar" @submit.prevent="load()">
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
    <p v-if="failure === 'cursorInvalidated'">{{ t('devices.restartDirectory') }}</p>
    <div v-if="page" class="console-stat-grid" :aria-label="t('console.queryStatistics')">
      <article
        v-for="key in ['deviceViewCount', 'endpointCount'] as const"
        :key="key"
        class="console-stat"
      >
        <h2>{{ t(`devices.${key}`) }}</h2>
        <strong>{{ page.statistics[key] }}</strong>
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
            · {{ row.reference.id }}</RouterLink
          ></template
        >
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
                }"
                >{{ endpoint.id }}</RouterLink
              >
            </li>
          </ul></template
        >
      </UiTable>
    </div>
    <UiPagination
      v-if="page?.nextCursor"
      :state="{ kind: 'cursor', hasPrevious: false, hasNext: true }"
      :label="t('devices.directory')"
      :previous-label="t('devices.previous')"
      :next-label="t('devices.next')"
      :busy="busy"
      @navigate="$event === 'next' && load(page?.nextCursor ?? undefined)"
    />
  </PageFrame>
</template>
