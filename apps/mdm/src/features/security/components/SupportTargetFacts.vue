<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SupportTarget } from '../clients/support-model'
defineProps<{ target: SupportTarget }>()
const { t } = useI18n()
</script>
<template>
  <p>
    {{ t(`security.supportKinds.${target.kind}`) }} · {{ target.device }} /
    {{ target.contextRevision }}
  </p>
  <dl v-if="target.kind === 'elevation'">
    <dt>{{ t('security.supportAccount') }}</dt>
    <dd>{{ target.account }}</dd>
    <dt>{{ t('security.supportProgram') }}</dt>
    <dd>{{ target.program.name }} · {{ target.program.id }} · {{ target.program.path }}</dd>
    <dt>SHA-256</dt>
    <dd>{{ target.program.sha256 }}</dd>
    <dt>{{ t('security.supportPublisher') }}</dt>
    <dd>{{ target.program.publisher }}</dd>
  </dl>
  <p v-else-if="target.kind === 'remote_support'">
    {{ t('security.remoteMode') }}: {{ t(`security.remoteModes.${target.mode}`) }}
  </p>
  <p v-else>
    {{ target.artifacts.map((a) => t(`security.diagnosticKinds.${a}`)).join(' · ') }} ·
    {{ t('security.retentionSeconds') }} {{ target.retentionSeconds }}
  </p>
</template>
