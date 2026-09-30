<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Material } from '../clients/materials-model'
defineProps<{ material: Material }>()
const { t } = useI18n()
const at = (n: number | null) =>
  n === null ? '—' : n <= 253402300799 ? new Date(n * 1000).toISOString() : String(n)
const booleanText = (v: boolean | null) =>
  t(
    v === null
      ? 'security.state.unknown'
      : v
        ? 'security.materialState.yes'
        : 'security.materialState.no',
  )
</script>
<template>
  <dl>
    <dt>{{ t('devices.revision') }}</dt>
    <dd>{{ material.revision }}</dd>
    <dt>{{ t('security.materialStatus') }}</dt>
    <dd>{{ t(`security.materialState.${material.state}`) }}</dd>
    <dt>{{ t('security.evaluatedAt') }}</dt>
    <dd>{{ at(material.evaluatedAt) }}</dd>
    <dt>{{ t('security.platform') }}</dt>
    <dd>{{ material.platform }}</dd>
    <dt>{{ t('security.frozenSource') }}</dt>
    <dd>
      {{
        material.source
          ? `${material.source.source} · ${material.source.registrationId} / ${material.source.generation}`
          : t('security.state.unknown')
      }}
    </dd>
    <dt>{{ t('security.prerequisites') }}</dt>
    <dd>
      {{ t(`security.materialState.${material.prerequisites.status}`) }}
      <span v-for="reason in material.prerequisites.reasons" :key="reason"
        >· {{ t(`security.materialReason.${reason}`) }}</span
      >
    </dd>
  </dl>
  <template v-if="material.kind === 'bitlocker' && material.details"
    ><p>TPM · {{ t(`security.materialState.${material.details.tpm}`) }}</p>
    <table>
      <thead>
        <tr>
          <th>{{ t('security.volume') }}</th>
          <th>{{ t('security.encryption') }}</th>
          <th>{{ t('security.escrow') }}</th>
          <th>{{ t('security.keyReference') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="v in material.details.volumes" :key="v.id">
          <td>{{ v.id }} · {{ t(`security.volumeRole.${v.role}`) }}</td>
          <td>{{ t(`security.materialState.${v.encryption}`) }}</td>
          <td>{{ t(`security.materialState.${v.escrow}`) }}</td>
          <td>{{ v.keyId ?? '—' }}</td>
        </tr>
      </tbody>
    </table></template
  >
  <dl v-else-if="material.kind === 'filevault' && material.details">
    <dt>{{ t('security.encryption') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.encryption}`) }}</dd>
    <dt>{{ t('security.keyType') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.keyType}`) }}</dd>
    <dt>{{ t('security.escrow') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.escrow}`) }}</dd>
    <dt>{{ t('security.keyReference') }}</dt>
    <dd>{{ material.details.keyId ?? '—' }}</dd>
    <dt>{{ t('security.profileState') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.profile}`) }}</dd>
  </dl>
  <dl v-else-if="material.kind === 'laps' && material.details">
    <dt>{{ t('security.managedAccount') }}</dt>
    <dd>{{ material.details.account }}</dd>
    <dt>{{ t('security.backupTarget') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.backup}`) }}</dd>
    <dt>{{ t('security.policyState') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.policy}`) }}</dd>
    <dt>{{ t('security.escrow') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.escrow}`) }}</dd>
    <dt>{{ t('security.lastRotation') }}</dt>
    <dd>{{ at(material.details.lastRotatedAt) }}</dd>
    <dt>{{ t('security.nextRotation') }}</dt>
    <dd>{{ at(material.details.nextRotationAt) }}</dd>
  </dl>
  <dl v-else-if="material.kind === 'bootstrap_token' && material.details">
    <dt>{{ t('security.capability') }}</dt>
    <dd>{{ booleanText(material.details.supported) }}</dd>
    <dt>{{ t('security.supervised') }}</dt>
    <dd>{{ booleanText(material.details.supervised) }}</dd>
    <dt>ADE</dt>
    <dd>{{ booleanText(material.details.ade) }}</dd>
    <dt>{{ t('security.deviceChannel') }}</dt>
    <dd>{{ booleanText(material.details.deviceChannel) }}</dd>
    <dt>{{ t('security.awaitingConfiguration') }}</dt>
    <dd>{{ booleanText(material.details.awaitingConfiguration) }}</dd>
    <dt>{{ t('security.escrow') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.escrow}`) }}</dd>
  </dl>
  <dl v-else-if="material.kind === 'recovery_lock' && material.details">
    <dt>Apple silicon</dt>
    <dd>{{ booleanText(material.details.appleSilicon) }}</dd>
    <dt>{{ t('security.supervised') }}</dt>
    <dd>{{ booleanText(material.details.supervised) }}</dd>
    <dt>{{ t('security.deviceChannel') }}</dt>
    <dd>{{ booleanText(material.details.deviceChannel) }}</dd>
    <dt>{{ t('security.accessRight') }}</dt>
    <dd>{{ booleanText(material.details.accessRight) }}</dd>
    <dt>{{ t('security.configured') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.configured}`) }}</dd>
    <dt>{{ t('security.escrow') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.escrow}`) }}</dd>
    <dt>{{ t('security.verification') }}</dt>
    <dd>{{ t(`security.materialState.${material.details.verification}`) }}</dd>
  </dl>
</template>
