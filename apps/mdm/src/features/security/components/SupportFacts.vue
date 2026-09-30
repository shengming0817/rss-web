<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SupportRecord } from '../clients/support-model'
defineProps<{ support: SupportRecord }>()
const { t } = useI18n(),
  at = (v: number | null) =>
    v === null ? '—' : v <= 253402300799 ? new Date(v * 1000).toISOString() : String(v)
</script>
<template>
  <dl>
    <dt>{{ t('security.frozenSource') }}</dt>
    <dd>
      {{
        support.source
          ? `${support.source.source} · ${support.source.registrationId} / ${support.source.generation}`
          : t('security.state.unknown')
      }}
    </dd>
  </dl>
  <section v-if="support.details.kind === 'elevation'">
    <h3>{{ t('security.deviceGrant') }}</h3>
    <p>{{ t('security.elevationHint') }}</p>
    <dl>
      <dt>{{ t('security.grantState') }}</dt>
      <dd data-testid="grant-state">
        {{ t(`security.grantStates.${support.details.grant.state}`) }}
      </dd>
      <dt>{{ t('security.detectedAt') }}</dt>
      <dd>{{ at(support.details.grant.observedAt) }}</dd>
      <dt>{{ t('security.elevationUsage') }}</dt>
      <dd>{{ t(`security.usageStates.${support.details.usage.state}`) }}</dd>
      <dt>{{ t('security.supportStarted') }}</dt>
      <dd>{{ at(support.details.usage.startedAt) }}</dd>
      <dt>{{ t('security.supportEnded') }}</dt>
      <dd>{{ at(support.details.usage.endedAt) }}</dd>
    </dl>
  </section>
  <section v-else-if="support.details.kind === 'remote_support'">
    <h3>{{ t('security.remoteConsent') }}</h3>
    <p>{{ t('security.remoteHint') }}</p>
    <dl>
      <dt>{{ t('security.remoteAttempt') }}</dt>
      <dd>{{ support.details.attempt }}</dd>
      <dt>{{ t('security.remoteHelper') }}</dt>
      <dd>{{ support.details.helper }}</dd>
      <dt>{{ t('security.remoteMode') }}</dt>
      <dd>{{ t(`security.remoteModes.${support.details.mode}`) }}</dd>
      <dt>{{ t('security.remoteConsent') }}</dt>
      <dd data-testid="consent-state">
        {{ t(`security.consentStates.${support.details.consent.state}`) }}
      </dd>
      <dt>{{ t('security.detectedAt') }}</dt>
      <dd>{{ at(support.details.consent.at) }}</dd>
      <dt>{{ t('security.validUntil') }}</dt>
      <dd>{{ at(support.details.consent.validUntil) }}</dd>
      <dt>{{ t('security.remoteSession') }}</dt>
      <dd data-testid="remote-session">
        {{ t(`security.remoteStates.${support.details.session.state}`) }}
      </dd>
      <dt>{{ t('security.supportStarted') }}</dt>
      <dd>{{ at(support.details.session.startedAt) }}</dd>
      <dt>{{ t('security.supportEnded') }}</dt>
      <dd>{{ at(support.details.session.endedAt) }}</dd>
    </dl>
  </section>
  <section v-else>
    <h3>{{ t('security.diagnosticCollection') }}</h3>
    <p>{{ t('security.diagnosticHint') }}</p>
    <dl>
      <dt>{{ t('security.diagnosticState') }}</dt>
      <dd>{{ t(`security.diagnosticStates.${support.details.state}`) }}</dd>
      <dt>{{ t('security.collectedAt') }}</dt>
      <dd>{{ at(support.details.collection?.at ?? null) }}</dd>
      <dt>{{ t('security.uploadedAt') }}</dt>
      <dd>{{ at(support.details.uploadedAt) }}</dd>
      <dt>{{ t('security.scanState') }}</dt>
      <dd>
        {{ t(`security.scanStates.${support.details.scan.state}`) }} ·
        {{ at(support.details.scan.at) }}
      </dd>
      <dt>{{ t('security.retainedUntil') }}</dt>
      <dd>{{ at(support.details.availableUntil) }}</dd>
    </dl>
    <table v-if="support.details.collection">
      <thead>
        <tr>
          <th>{{ t('security.diagnosticArtifact') }}</th>
          <th>{{ t('security.diagnosticRecords') }}</th>
          <th>{{ t('security.diagnosticBytes') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in support.details.collection.artifacts" :key="a.kind">
          <td>{{ t(`security.diagnosticKinds.${a.kind}`) }}</td>
          <td>{{ a.records }}</td>
          <td>{{ a.bytes }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
