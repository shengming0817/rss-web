<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Certificate } from '../clients/certificates-model'
defineProps<{ certificate: Certificate }>()
const { t } = useI18n()
const at = (v: number | null) =>
  v === null ? '—' : v <= 253402300799 ? new Date(v * 1000).toISOString() : String(v)
</script>
<template>
  <dl>
    <dt>{{ t('security.certificateProfile') }}</dt>
    <dd>
      {{ certificate.profile.name }} / {{ certificate.profile.id }} ·
      {{ certificate.profile.platform }} · {{ certificate.profile.protocol }}
    </dd>
    <dt>{{ t('security.certificateIssuer') }}</dt>
    <dd>
      {{ certificate.profile.issuer }} ·
      {{ t(`security.certificatePurpose.${certificate.profile.purpose}`) }}
    </dd>
    <dt>{{ t('devices.revision') }}</dt>
    <dd>{{ certificate.revision }}</dd>
    <dt>{{ t('security.asOf') }}</dt>
    <dd>{{ at(certificate.evaluatedAt) }}</dd>
    <dt>{{ t('security.frozenSource') }}</dt>
    <dd>
      {{
        certificate.source
          ? `${certificate.source.source} · ${certificate.source.registrationId} / ${certificate.source.generation}`
          : t('security.state.unknown')
      }}
    </dd>
    <dt>{{ t('security.certificateValidity') }}</dt>
    <dd data-testid="certificate-validity">
      {{ t(`security.certificateStates.${certificate.validity}`) }}
    </dd>
  </dl>
  <section>
    <h3>{{ t('security.certificateIssuance') }}</h3>
    <p data-testid="certificate-issuance">
      {{
        certificate.issuance
          ? t(`security.issuanceStates.${certificate.issuance.state}`)
          : t('security.noIssuance')
      }}
    </p>
    <dl v-if="certificate.issuance">
      <dt>{{ t('operations.operation') }}</dt>
      <dd>{{ certificate.issuance.operation }}</dd>
      <dt>{{ t('security.createdAt') }}</dt>
      <dd>{{ at(certificate.issuance.requestedAt) }}</dd>
      <dt>{{ t('security.resultAt') }}</dt>
      <dd>{{ at(certificate.issuance.resultAt) }}</dd>
    </dl>
  </section>
  <section
    v-for="entry in [
      { name: 'issuedCredential', credential: certificate.issuance?.credential },
      { name: 'installedCredential', credential: certificate.installed?.credential },
    ]"
    :key="entry.name"
  >
    <h3>{{ t(`security.${entry.name}`) }}</h3>
    <p v-if="!entry.credential">{{ t('security.state.unknown') }}</p>
    <dl v-else>
      <dt>{{ t('security.certificateSubject') }}</dt>
      <dd>{{ entry.credential.subject }}</dd>
      <dt>{{ t('security.certificateSerial') }}</dt>
      <dd>{{ entry.credential.serial }}</dd>
      <dt>{{ t('security.certificateFingerprint') }}</dt>
      <dd>{{ entry.credential.fingerprint }}</dd>
      <dt>{{ t('security.validFrom') }}</dt>
      <dd>{{ at(entry.credential.notBefore) }}</dd>
      <dt>{{ t('security.validUntil') }}</dt>
      <dd>{{ at(entry.credential.notAfter) }}</dd>
    </dl>
  </section>
  <dl v-if="certificate.installed">
    <dt>{{ t('security.detectedAt') }}</dt>
    <dd>{{ at(certificate.installed.observedAt) }}</dd>
    <dt>{{ t('security.observedCertificateSource') }}</dt>
    <dd>
      {{ certificate.installed.source.source }} ·
      {{ certificate.installed.source.registrationId }} /
      {{ certificate.installed.source.generation }}
    </dd>
  </dl>
</template>
