<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiTable, UiBadge, UiDialog } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsFacts } from '../../settings/useSettingsAction'
import { pkiTrust, type PkiPurpose, type PkiTrust } from '../../settings/clients/pki'
import { downloadPublic } from '../../settings/download'
import { auditTime } from '../../operations/format'
import OperationNotice from '../../settings/components/OperationNotice.vue'
const props = defineProps<{ purpose: PkiPurpose }>()
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.pki,
  { canRead, canWrite } = usePermission('credentials', 'credentials'),
  { run, busy, failure, pending, locked, compared, markCompared, resolveConflict } =
    useSettingsAction(() => `pki:${props.purpose}`)
const trust = ref<PkiTrust>(),
  readAt = ref<number>(),
  candidate = ref<PkiTrust>(),
  preparing = ref(false),
  selected = ref<PkiTrust['issuers'][number]>()
async function load() {
  trust.value = undefined
  selected.value = undefined
  readAt.value = undefined
  return run(
    () => client.read(props.purpose),
    (v) => {
      trust.value = v
      readAt.value = Math.floor(Date.now() / 1000)
    },
  )
}
async function compare() {
  if (await load()) markCompared()
}
async function file(event: Event) {
  const input = event.target as HTMLInputElement,
    selectedFile = input.files?.[0]
  input.value = ''
  candidate.value = undefined
  if (!selectedFile) return
  if (selectedFile.size > 24 * 1024 * 1024) {
    failure.value = 'requestTooLarge'
    return
  }
  await run(
    async () => pkiTrust(JSON.parse(await selectedFile.text()), runtime.tenant, props.purpose),
    (v) => {
      candidate.value = v
    },
  )
}
onMounted(load)
useSettingsFacts(() => {
  trust.value = undefined
  candidate.value = undefined
  selected.value = undefined
  preparing.value = false
  readAt.value = undefined
})
</script>
<template>
  <section class="console-panel">
    <header class="console-inline-actions">
      <h2>{{ t('security.pki.trust') }}</h2>
      <UiButton :disabled="busy || !canRead" @click="load">{{ t('devices.reload') }}</UiButton
      ><UiButton :disabled="locked || !canWrite || !trust" @click="preparing = true">{{
        t('security.pki.prepare')
      }}</UiButton>
    </header>
    <p>{{ t('security.pki.publicHint') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canWrite"
      :query-supported="false"
      :compared="compared"
      @compare="compare"
      @edit="resolveConflict"
    />
    <template v-if="trust">
      <p>
        {{ t('security.pki.revision') }} {{ trust.revision }} · {{ t('security.pki.origin') }}
        {{ trust.origin }}
        <span v-if="readAt">· {{ t('security.pki.readAt') }} {{ auditTime(readAt) }}</span>
      </p>
      <UiTable
        :label="t('security.pki.trust')"
        :rows="trust.issuers"
        :row-key="(v) => v.digest"
        :columns="[
          { key: 'digest', label: t('security.pki.issuer') },
          { key: 'mode', label: t('security.pki.mode') },
          { key: 'provisioner', label: t('security.pki.provider') },
        ]"
        :busy="busy"
        :busy-label="t('devices.loading')"
        :empty-label="t('devices.empty')"
      >
        <template #cell-digest="{ row }"
          ><UiButton variant="ghost" @click="selected = row"
            >{{ row.digest.slice(0, 16) }}…</UiButton
          ></template
        >
        <template #cell-mode="{ row }"
          ><UiBadge :tone="row.mode === 'active' ? 'success' : 'neutral'">{{
            t(`security.pki.${row.mode}`)
          }}</UiBadge></template
        >
      </UiTable>
      <UiButton
        variant="ghost"
        @click="downloadPublic(purpose + '-trust.json', JSON.stringify(trust))"
        >{{ t('security.pki.download') }}</UiButton
      >
    </template>
    <p v-else-if="!busy && !failure">{{ t('security.pki.noTrust') }}</p>
  </section>
  <UiDialog
    :open="!!selected"
    placement="right"
    :title="t('security.pki.details')"
    :close-label="t('security.pki.close')"
    @update:open="selected = undefined"
  >
    <dl v-if="selected" class="settings-facts">
      <dt>{{ t('security.pki.issuer') }}</dt>
      <dd class="console-locator">{{ selected.digest }}</dd>
      <dt>{{ t('security.pki.mode') }}</dt>
      <dd>{{ t(`security.pki.${selected.mode}`) }}</dd>
      <dt>{{ t('security.pki.provisioner') }}</dt>
      <dd>{{ selected.provisioner }}</dd>
      <dt>{{ t('security.pki.kid') }}</dt>
      <dd>{{ selected.kid || '—' }}</dd>
    </dl>
  </UiDialog>
  <UiDialog
    :open="preparing"
    placement="right"
    :title="t('security.pki.material')"
    :close-label="t('security.pki.close')"
    @update:open="preparing = false"
  >
    <p>{{ t('security.pki.materialHint') }}</p>
    <p class="ui-help">{{ t('security.pki.unavailableMaterial') }}</p>
    <label for="pki-trust-file">{{ t('security.pki.upload') }}</label
    ><input
      id="pki-trust-file"
      type="file"
      accept="application/json,.json"
      :disabled="locked || !canWrite"
      @change="file"
    />
    <dl class="settings-facts">
      <dt>{{ t('security.pki.tenant') }}</dt>
      <dd>{{ runtime.tenant }}</dd>
      <dt>{{ t('security.pki.purpose') }}</dt>
      <dd>{{ t(`security.pki.${purpose}`) }}</dd>
      <dt>{{ t('security.pki.expected') }}</dt>
      <dd>{{ trust?.revision ?? '—' }}</dd>
      <dt>{{ t('security.pki.candidateRevision') }}</dt>
      <dd>{{ candidate?.revision ?? '—' }}</dd>
    </dl>
    <ul v-if="candidate">
      <li v-for="issuer in candidate.issuers" :key="issuer.digest">
        {{ issuer.digest }} · {{ t(`security.pki.${issuer.mode}`) }}
      </li>
    </ul>
  </UiDialog>
</template>
