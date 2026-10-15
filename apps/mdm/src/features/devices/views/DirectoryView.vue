<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { UiTable, UiPagination } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import DeviceFrame from '../components/DeviceFrame.vue'
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
</script>
<template>
  <DeviceFrame :title="t('devices.directory')" :busy="busy" :failure="failure">
    <form @submit.prevent="load()">
      <fieldset :disabled="busy">
        <label
          >{{ t('devices.status')
          }}<select v-model="status">
            <option value="">{{ t('devices.all') }}</option>
            <option v-for="s in endpointStatuses" :key="s" :value="s">
              {{ t(`devices.endpointState.${s}`) }}
            </option>
          </select></label
        ><label
          >{{ t('devices.channels')
          }}<select v-model="channel">
            <option value="">{{ t('devices.all') }}</option>
            <option value="mdm">MDM</option>
            <option value="agent">Agent</option>
          </select></label
        ><label
          >{{ t('devices.source')
          }}<select v-model="source">
            <option value="">{{ t('devices.all') }}</option>
            <option v-for="s in ['mdm.windows', 'mdm.apple', 'agent.builtin']" :key="s" :value="s">
              {{ t(`devices['${s}']`) }}
            </option>
          </select></label
        ><label><input v-model="descending" type="checkbox" />{{ t('devices.descending') }}</label
        ><button>{{ t('devices.reload') }}</button>
      </fieldset>
    </form>
    <p v-if="failure === 'cursorInvalidated'">{{ t('devices.restartDirectory') }}</p>
    <div v-if="page" class="mdm-grid">
      <article
        v-for="key in ['deviceViewCount', 'endpointCount'] as const"
        :key="key"
        class="identity-card"
      >
        <h2>{{ t(`devices.${key}`) }}</h2>
        <strong>{{ page.statistics[key] }}</strong>
      </article>
    </div>
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
      <template #cell-status="{ row }">{{
        row.association
          ? t(`devices.associationState.${row.association.state}`)
          : t(`devices.endpointState.${row.endpoints[0]?.status}`)
      }}</template>
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
    <UiPagination
      v-if="page?.nextCursor"
      :state="{ kind: 'cursor', hasPrevious: false, hasNext: true }"
      :label="t('devices.directory')"
      :previous-label="t('devices.previous')"
      :next-label="t('devices.next')"
      :busy="busy"
      @navigate="$event === 'next' && load(page?.nextCursor ?? undefined)"
    />
  </DeviceFrame>
</template>
