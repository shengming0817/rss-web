<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { DeviceView } from '../clients/device-views'
import { addresses, currentEvidence, receivedAt, utc } from '../presentation'
import PersonDisplay from './PersonDisplay.vue'
const props = defineProps<{ view: DeviceView }>()
const emit = defineEmits<{ invalidated: [reason: 'cursorInvalidated' | 'denied' | 'notFound'] }>()
const { t } = useI18n(),
  runtime = useMdm()
const ip = ref<Record<string, { source: string; addresses: string[]; observedAt: number }[]>>({})
const { run, failure, busy } = useOperation(
  [],
  () => [...deviceBinding(runtime), JSON.stringify(props.view)],
  () => JSON.stringify(props.view.reference),
)
async function readIps() {
  ip.value = {}
  failure.value = null
  const view = props.view
  const lists = ['device.network.interfaces', 'device.network.windows.identifiers'].flatMap(
    (field) =>
      (view.lists[field]?.sources ?? [])
        .filter(
          (source) =>
            source.state.kind === 'known' &&
            currentEvidence(view, source.endpoint, source.evidence),
        )
        .map((source) => ({ field, source })),
  )
  if (!lists.length) return
  await run(
    async () =>
      Promise.all(
        lists.map(async ({ field, source }) => ({
          source,
          result: await runtime.devices.views.items(view.reference, field, source),
        })),
      ),
    (results) => {
      ip.value = Object.fromEntries(
        view.endpoints.map((e) => [
          e.id,
          results
            .filter((r) => r.source.endpoint === e.id)
            .map((r) => ({
              source: r.source.evidence.source,
              addresses: addresses(r.result.items),
              observedAt: r.source.evidence.observedAt,
            })),
        ]),
      )
    },
  ).then(() => {
    if (
      failure.value === 'denied' ||
      failure.value === 'notFound' ||
      failure.value === 'cursorInvalidated'
    )
      emit('invalidated', failure.value)
  })
}
watch(
  () => JSON.stringify([props.view, ...deviceBinding(runtime)]),
  () => {
    void readIps()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <dl class="device-summary">
    <div>
      <dt>{{ t('devices.workspace.lastCommunication') }}</dt>
      <dd v-for="endpoint in view.endpoints" :key="endpoint.id">
        <template
          v-for="channel in endpoint.channels.filter((c) => c.status === 'active')"
          :key="channel.registrationId"
          ><strong>{{ utc(channel.lastCommunicationReceivedAt) }}</strong
          ><small
            >{{ view.endpoints.length > 1 ? endpoint.id + ' · ' : ''
            }}{{ channel.channel === 'mdm' ? 'MDM' : 'Agent' }}</small
          ></template
        ><span v-if="!endpoint.channels.some((c) => c.status === 'active')">{{
          t('devices.noCommunication')
        }}</span>
      </dd>
    </div>
    <div>
      <dt>{{ t('devices.workspace.reportedIp') }}</dt>
      <dd v-for="endpoint in view.endpoints" :key="endpoint.id">
        <template v-for="source in ip[endpoint.id]" :key="source.source"
          ><strong>{{ source.addresses.join(', ') || t('devices.workspace.noReport') }}</strong
          ><small
            >{{ view.endpoints.length > 1 ? endpoint.id + ' · ' : '' }}{{ source.source }} ·
            {{ utc(source.observedAt) }}</small
          ></template
        ><span v-if="busy" role="status">{{ t('devices.loading') }}</span
        ><span v-else-if="failure" role="alert">{{ t('devices.' + failure) }}</span
        ><span v-else-if="!ip[endpoint.id]?.length">{{ t('devices.workspace.noReport') }}</span>
      </dd>
      <v-btn v-if="failure" variant="text" :disabled="busy" @click="readIps">{{
        t('devices.reload')
      }}</v-btn>
      <small>{{ t('devices.workspace.observedIpNote') }}</small>
    </div>
    <div>
      <dt>{{ t('devices.workspace.assetReported') }}</dt>
      <dd v-for="endpoint in view.endpoints" :key="endpoint.id">
        <strong>{{ utc(receivedAt(view, endpoint.id)) }}</strong
        ><small v-if="view.endpoints.length > 1">{{ endpoint.id }}</small>
      </dd>
    </div>
    <div>
      <dt>{{ t('devices.currentUser') }}</dt>
      <dd v-for="endpoint in view.endpoints" :key="endpoint.id">
        <PersonDisplay
          v-if="endpoint.currentUser?.user"
          :display="endpoint.currentUser.display"
        /><span v-else>{{ t('devices.notProvided') }}</span
        ><small
          >{{
            endpoint.currentUser
              ? t('devices.currentUserState.' + endpoint.currentUser.state)
              : t('devices.notProvided')
          }}{{ view.endpoints.length > 1 ? ' · ' + endpoint.id : '' }}</small
        >
      </dd>
    </div>
  </dl>
</template>
