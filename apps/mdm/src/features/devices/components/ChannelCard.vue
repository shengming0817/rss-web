<script setup lang="ts">
import { VBtn, VCard, VCardText, VCardTitle, VList, VListItem } from 'vuetify/components'
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
function communication(at: number | null) {
  if (at === null) return t('devices.noCommunication')
  const date = new Date(at * 1000)
  return Number.isNaN(date.getTime())
    ? String(at)
    : date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}
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
  <v-card variant="outlined" :data-endpoint="endpoint.id"
    ><v-card-title>{{ endpoint.id }}</v-card-title
    ><v-card-text>
      <v-btn
        variant="text"
        :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device: endpoint.id } }"
        >{{ t('devices.originalEndpoint') }}</v-btn
      >
      <p>{{ t('devices.endpointStatus') }}: {{ t(`devices.endpointState.${endpoint.status}`) }}</p>
      <article v-for="channel in endpoint.channels" :key="channel.channel">
        <h3>{{ channel.channel === 'mdm' ? 'MDM' : 'Agent' }}</h3>
        <dl>
          <dt>{{ t('devices.deviceId') }}</dt>
          <dd>{{ endpoint.id }}</dd>
          <dt>
            {{
              t(
                channel.status === 'active'
                  ? 'devices.currentRegistration'
                  : 'devices.previousRegistration',
              )
            }}
          </dt>
          <dd>
            {{ channel.registrationId }} ·
            {{ t(`devices.endpointState.${channel.status}`) }}
          </dd>
          <dt>{{ t('devices.source') }}</dt>
          <dd>{{ channel.source }}</dd>
          <dt>{{ t('devices.lastCommunication') }}</dt>
          <dd>
            {{ communication(channel.lastCommunicationReceivedAt) }}
          </dd>
          <dt>{{ t('devices.received') }}</dt>
          <dd>{{ received(channel.registrationId, channel.generation) }}</dd>
        </dl>
        <v-list density="compact">
          <v-list-item v-for="child in channel.children" :key="child.registrationId">
            {{ child.purpose }} · {{ child.registrationId }} ·
            {{ t(`devices.endpointState.${child.status}`) }} ·
            {{ t(child.ready ? 'devices.ready' : 'devices.unknown') }}
          </v-list-item>
        </v-list>
        <p v-if="channel.userContext">
          {{ t('devices.userContext') }} · {{ channel.userContext.id }} ·
          {{ t(`devices.endpointState.${channel.userContext.registrationStatus}`) }}
        </p>
        <v-list density="compact">
          <v-list-item v-for="capability in capabilities(channel.channel)" :key="capability.action">
            {{ capability.action }} · {{ t('devices.productSupport') }}:
            {{ t(`devices.supportState.${capability.productSupport.state}`) }} ({{
              capability.productSupport.reason ?? '—'
            }}) · {{ t('devices.devicePrerequisite') }}:
            {{ t(`devices.supportState.${capability.devicePrerequisite.state}`) }} ({{
              capability.devicePrerequisite.reason ?? '—'
            }}) · {{ t('devices.permission') }}:
            {{ t(capability.permission.allowed ? 'devices.yes' : 'devices.no') }}
          </v-list-item>
        </v-list>
      </article>
      <p v-if="!endpoint.channels.length">{{ t('devices.not_registered') }}</p>
      <p>{{ t('devices.registrationAssetsSeparate') }}</p>
      <v-btn
        v-for="enrollment in endpoint.enrollments.filter((e) => e.source !== 'agent.builtin')"
        :key="enrollment.enrollmentId"
        variant="outlined"
        :to="{
          name: 'device-management',
          params: { tenant: runtime.tenant, device: endpoint.id },
          query: { enrollment: enrollment.enrollmentId },
        }"
        >{{ t('console.enrollmentProgress') }} · {{ t(`devices.${enrollment.status}`) }}</v-btn
      >
    </v-card-text></v-card
  >
</template>
