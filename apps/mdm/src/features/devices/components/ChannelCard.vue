<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { DeviceView } from '../clients/device-views'
import type { EndpointDetail } from '../clients/endpoint-model'
const props = defineProps<{
  endpoint: DeviceView['endpoints'][number]
  detail?: EndpointDetail | undefined
  view: DeviceView
}>()
const { t } = useI18n(),
  runtime = useMdm()
function received(registration: string, generation: number) {
  const times = Object.values(props.view.fields)
    .flatMap((f) => f.sources)
    .filter(
      (s) =>
        s.endpoint === props.endpoint.id &&
        s.fact.evidence.source !== 'manual' &&
        s.fact.evidence.registration === registration &&
        s.fact.evidence.registrationGeneration === generation,
    )
    .map((s) => s.fact.evidence.receivedAt)
  return times.length ? times.reduce((a, b) => Math.max(a, b)) : t('devices.unknown')
}
function capabilities(channel: string) {
  if (
    !props.detail ||
    props.endpoint.channels.some(
      (c) =>
        !props.detail?.channels.some(
          (d) =>
            d.channel === c.channel &&
            d.registrationId === c.registrationId &&
            d.generation === c.generation &&
            d.status === c.status,
        ),
    )
  )
    return []
  return props.detail.capabilities.filter((c) => c.channel === channel)
}
</script>
<template>
  <section class="identity-card" :data-endpoint="endpoint.id">
    <h2>{{ endpoint.id }}</h2>
    <RouterLink
      :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device: endpoint.id } }"
      >{{ t('devices.originalEndpoint') }}</RouterLink
    >
    <p>{{ t('devices.endpointStatus') }}: {{ t(`devices.endpointState.${endpoint.status}`) }}</p>
    <article v-for="channel in endpoint.channels" :key="channel.channel">
      <h3>{{ channel.channel === 'mdm' ? 'MDM' : 'Agent' }}</h3>
      <dl>
        <dt>{{ t('devices.deviceId') }}</dt>
        <dd>{{ endpoint.id }}</dd>
        <dt>{{ t('devices.registration') }}</dt>
        <dd>
          {{ channel.registrationId }} / {{ channel.generation }} ·
          {{ t(`devices.endpointState.${channel.status}`) }}
        </dd>
        <dt>{{ t('devices.source') }}</dt>
        <dd>{{ channel.source }}</dd>
        <dt>{{ t('devices.lastCommunication') }}</dt>
        <dd>
          {{ t('devices.notProvided')
          }}<span v-if="runtime.demo">
            · {{ t('mdm.mock') }}: {{ t('devices.demoCommunication') }}</span
          >
        </dd>
        <dt>{{ t('devices.received') }}</dt>
        <dd>{{ received(channel.registrationId, channel.generation) }}</dd>
      </dl>
      <ul>
        <li v-for="child in channel.children" :key="child.registrationId">
          {{ child.purpose }} · {{ child.registrationId }} / {{ child.generation }} ·
          {{ t(`devices.endpointState.${child.status}`) }} ·
          {{ t(child.ready ? 'devices.ready' : 'devices.unknown') }}
        </li>
      </ul>
      <p v-if="channel.userContext">
        {{ t('devices.userContext') }} · {{ channel.userContext.id }} /
        {{ channel.userContext.parentGeneration }} ·
        {{ t(`devices.endpointState.${channel.userContext.registrationStatus}`) }}
      </p>
      <ul>
        <li v-for="capability in capabilities(channel.channel)" :key="capability.action">
          {{ capability.action }} · {{ t('devices.productSupport') }}:
          {{ t(`devices.supportState.${capability.productSupport.state}`) }} ({{
            capability.productSupport.reason ?? '—'
          }}) · {{ t('devices.devicePrerequisite') }}:
          {{ t(`devices.supportState.${capability.devicePrerequisite.state}`) }} ({{
            capability.devicePrerequisite.reason ?? '—'
          }}) · {{ t('devices.permission') }}:
          {{ t(capability.permission.allowed ? 'devices.yes' : 'devices.no') }}
        </li>
      </ul>
    </article>
    <p v-if="!endpoint.channels.length">{{ t('devices.not_registered') }}</p>
    <p>{{ t('devices.registrationAssetsSeparate') }}</p>
  </section>
</template>
