<script setup lang="ts">
import { VBtn, VCard } from 'vuetify/components'
import ConnectionsPanel from './ConnectionsPanel.vue'
import ChannelPanel from './ChannelPanel.vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
const maintenanceCommand =
  'docker compose -p rss-mdm -f /absolute/candidate/deployment/production.compose.yaml run --rm --no-deps --user 10001:10001 --entrypoint /usr/local/bin/rss-mdm-installer init'
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useSettingsAction(() => 'deployment-readiness')
const readiness = ref<Awaited<ReturnType<typeof runtime.settings.catalog.readiness>>>()
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
onMounted(load)
useSettingsFacts(() => {
  readiness.value = undefined
})
</script>
<template>
  <VCard class="console-panel" tag="section" variant="outlined"
    ><h2>{{ t('settings.maintenance') }}</h2>
    <p>{{ t('settings.operatorHint') }}</p>
    <p>{{ t('settings.readinessHint') }}</p>
    <VBtn :disabled="busy" @click="load">{{ t('settings.reload') }}</VBtn>
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
    <VBtn
      v-if="runtime.realm === 'tenant'"
      :to="{ name: 'operations-diagnostics', params: { tenant: runtime.tenant } }"
      variant="text"
      >{{ t('operations.diagnostics') }}</VBtn
    ></VCard
  ><VCard class="console-panel" tag="section" variant="outlined"
    ><h2>{{ t('settings.operatorOnly') }}</h2>
    <p>{{ t('settings.configureHostHint') }}</p>
    <code
      >{{ maintenanceCommand }} configure-host --config
      /var/lib/rss-mdm/private-host-change.json</code
    >
    <p>{{ t('settings.initializeCaHint') }}</p>
    <code
      >{{ maintenanceCommand }} initialize-ca --config /var/lib/rss-mdm/private-step-ca.json</code
    >
    <p>{{ t('settings.recoverAccountHint') }}</p>
    <code
      >{{ maintenanceCommand }} recover-password --config
      /var/lib/rss-mdm/private-account-recovery.json</code
    >
    <p>{{ t('settings.rotateHint') }}</p>
    <code
      >{{ maintenanceCommand }} rotate-protection --config
      /var/lib/rss-mdm/private-rotation.json</code
    >
    <p>{{ t('settings.publicHostHint') }}</p>
    <code
      >{{ maintenanceCommand }} public-host-config --config
      /var/lib/rss-mdm/private-runtime.json</code
    >
    <p>{{ t('settings.webhookDeliveryHint') }}</p>
    <code
      >{{ maintenanceCommand }} export-webhook-key --config
      /var/lib/rss-mdm/private-webhook-delivery.json</code
    ></VCard
  ><VCard class="console-panel" tag="section" variant="outlined"
    ><h2>{{ t('settings.backup') }}</h2>
    <p>{{ t('settings.noSecretExport') }}</p>
    <p>{{ t('settings.backupHint') }}</p>
    <code
      >{{ maintenanceCommand }} backup-installation --config
      /var/lib/rss-mdm/private-backup.json</code
    >
    <p>{{ t('settings.restoreHint') }}</p>
    <code
      >{{ maintenanceCommand }} restore-installation --config
      /var/lib/rss-mdm/private-restore.json</code
    >
    <p>{{ t('settings.backupLimit') }}</p></VCard
  ><ConnectionsPanel v-if="runtime.realm === 'tenant'" /><ChannelPanel
    v-if="runtime.realm === 'tenant'"
  />
</template>
