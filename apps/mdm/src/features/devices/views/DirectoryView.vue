<script setup lang="ts">
import { ref, watch } from 'vue'
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
</script>
<template>
  <DeviceFrame :title="t('devices.directory')" :busy="busy" :failure="failure">
    <form @submit.prevent="load()">
      <fieldset :disabled="busy">
        <label
          >{{ t('devices.status')
          }}<select v-model="status">
            <option value="">{{ t('devices.all') }}</option>
            <option v-for="s in endpointStatuses" :key="s" :value="s">{{ s }}</option>
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
              {{ s }}
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
    <table v-if="page?.items.length">
      <thead>
        <tr>
          <th>{{ t('devices.viewIdentity') }}</th>
          <th>{{ t('devices.status') }}</th>
          <th>{{ t('devices.channels') }}</th>
          <th>{{ t('devices.originalEndpoint') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in page.items" :key="`${item.reference.kind}:${item.reference.id}`">
          <td>
            <RouterLink
              :to="
                item.reference.kind === 'endpoint'
                  ? {
                      name: 'device-detail',
                      params: { tenant: runtime.tenant, device: item.reference.id },
                    }
                  : {
                      name: 'device-view-detail',
                      params: {
                        tenant: runtime.tenant,
                        kind: item.reference.kind,
                        view: item.reference.id,
                      },
                    }
              "
              >{{
                t(
                  item.reference.kind === 'association'
                    ? 'devices.unifiedView'
                    : 'devices.originalEndpoint',
                )
              }}
              · {{ item.reference.id }}</RouterLink
            >
          </td>
          <td>{{ item.association?.state ?? item.endpoints[0]?.status }}</td>
          <td>{{ item.endpoints.flatMap((e) => e.channels.map((c) => c.channel)).join(' + ') }}</td>
          <td>
            <ul>
              <li v-for="endpoint in item.endpoints" :key="endpoint.id">
                <RouterLink
                  :to="{
                    name: 'device-detail',
                    params: { tenant: runtime.tenant, device: endpoint.id },
                  }"
                  >{{ endpoint.id }}</RouterLink
                >
              </li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="page">{{ t('devices.empty') }}</p>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
  </DeviceFrame>
</template>
