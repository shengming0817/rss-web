<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useSettingsAction(() => 'deployment-readiness')
const readiness = ref<Awaited<ReturnType<typeof runtime.settings.catalog.readiness>>>(),
  diagnostics = ref<Awaited<ReturnType<typeof runtime.settings.runtime.read>>>()
async function load() {
  readiness.value = undefined
  await run(
    () => runtime.settings.catalog.readiness(),
    (v) => {
      if (v.observation?.tenantId !== runtime.businessTenant) throw new Error('Wrong host')
      readiness.value = v
    },
  )
}
async function health() {
  diagnostics.value = undefined
  await run(
    () => runtime.settings.runtime.read(),
    (v) => (diagnostics.value = v),
  )
}
onMounted(load)
useSettingsFacts(() => {
  readiness.value = undefined
  diagnostics.value = undefined
})
</script>
<template>
  <section class="console-panel">
    <h2>{{ t('settings.maintenance') }}</h2>
    <p>{{ t('settings.operatorHint') }}</p>
    <p>{{ t('settings.readinessHint') }}</p>
    <UiButton :disabled="busy" @click="load">{{ t('settings.reload') }}</UiButton>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <dl v-if="readiness" class="settings-facts">
      <dt>{{ t('settings.state') }}</dt>
      <dd>{{ readiness.ready ? t('settings.hostReady') : t('settings.status.unavailable') }}</dd>
      <template v-if="readiness.observation"
        ><dt>{{ t('settings.host') }}</dt>
        <dd>{{ readiness.observation.hostId }}</dd>
        <dt>{{ t('settings.operationId') }}</dt>
        <dd>{{ readiness.observation.operationId }}</dd>
        <dt>{{ t('settings.runtimeVersion') }}</dt>
        <dd>{{ readiness.observation.revision }}</dd>
        <dt>{{ t('settings.processGeneration') }}</dt>
        <dd>{{ readiness.observation.processGeneration }}</dd>
        <dt>{{ t('settings.fingerprint') }}</dt>
        <dd>
          <code>{{ readiness.observation.materialDigest }}</code>
        </dd></template
      >
    </dl>
    <p v-else>{{ t('settings.notObserved') }}</p>
    <template v-if="runtime.realm === 'tenant'"
      ><UiButton :disabled="busy" @click="health">{{ t('operations.diagnostics') }}</UiButton>
      <article v-for="c in diagnostics?.components" :key="c.name">
        <h3>{{ c.name }}</h3>
        <p>{{ c.readiness }} · {{ c.health }} · {{ c.reasons.join(', ') }}</p>
        <p v-for="q in c.queues" :key="q.name">
          {{ q.name }}: {{ q.count ?? t('mdm.unknown') }} {{ q.truncated ? '≥' : '' }}
        </p>
        <p v-if="c.progress">
          {{ c.progress.state }} · {{ c.progress.confirmedPosition ?? '—' }} /
          {{ c.progress.sourceHead ?? '—' }}
        </p>
        <p v-if="c.runner">
          {{ t('settings.pendingAttempts') }} {{ c.runner.unresolvedAttempts }} ·
          {{ c.runner.latestFailure?.reason ?? '—' }}
        </p>
      </article></template
    >
  </section>
  <section class="console-panel">
    <h2>{{ t('settings.operatorOnly') }}</h2>
    <p>{{ t('settings.configureHostHint') }}</p>
    <code>rss-mdm configure-host --config /absolute/private-host-change.json</code>
    <p>{{ t('settings.prepareCaHint') }}</p>
    <code>rss-mdm prepare-ca --config /absolute/private-ca-preparation.json</code>
    <p>{{ t('settings.recoverAccountHint') }}</p>
    <code>rss-mdm recover-password --config /absolute/private-account-recovery.json</code>
    <p>{{ t('settings.rotateHint') }}</p>
    <code>rss-mdm rotate-protection --config /absolute/private-rotation.json</code>
    <p>{{ t('settings.publicHostHint') }}</p>
    <code>rss-mdm public-host-config --config /absolute/runtime.json</code>
    <p>{{ t('settings.webhookDeliveryHint') }}</p>
    <code>rss-mdm export-webhook-key --config /absolute/private-webhook-delivery.json</code>
  </section>
  <section class="console-panel">
    <h2>{{ t('settings.backup') }}</h2>
    <p>{{ t('settings.noSecretExport') }}</p>
    <p>{{ t('settings.backupHint') }}</p>
    <code>rss-mdm backup-installation --config /absolute/private-backup.json</code>
    <p>{{ t('settings.restoreHint') }}</p>
    <code>rss-mdm restore-installation --config /absolute/private-restore.json</code>
    <p>{{ t('settings.backupLimit') }}</p>
  </section>
</template>
