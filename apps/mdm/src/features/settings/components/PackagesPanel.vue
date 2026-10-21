<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiDialog } from '@rss/core/components'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import PackageUpload from './PackageUpload.vue'
import OperationNotice from './OperationNotice.vue'
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.settings.packages
const { canRead, canWrite, allows } = usePermission('agent_enrollment_read', 'software_withdraw')
const {
  run,
  busy,
  failure,
  pending,
  locked,
  submit,
  resolveConflict,
  compared,
  markCompared,
  query,
} = useSettingsAction(() => 'packages')
const packages = ref<Awaited<ReturnType<typeof client.read>>>([]),
  withdrawTarget = ref<string>(),
  uploadTarget = ref<(typeof targets)[number]>()
const targets = [
  { platform: 'windows', architecture: 'x86_64', label: 'Windows x64' },
  { platform: 'windows', architecture: 'aarch64', label: 'Windows ARM64' },
  { platform: 'macos', architecture: 'x86_64', label: 'macOS Intel' },
  { platform: 'macos', architecture: 'aarch64', label: 'macOS Apple Silicon' },
] as const
const slots = computed(() =>
  targets.map((target) => ({
    ...target,
    packages: packages.value.filter(
      (p) => p.target.platform === target.platform && p.target.architecture === target.architecture,
    ),
  })),
)
async function load() {
  packages.value = []
  return run(
    () => client.read(),
    (v) => (packages.value = v),
  )
}
async function compare() {
  const old = pending.value
  if (old && withdrawTarget.value)
    await query(
      old.id,
      () => client.operation(old.id, 'withdraw', withdrawTarget.value!),
      (value) => {
        if (value) withdrawTarget.value = undefined
      },
      (value) => value !== null,
    )
  if (await load()) markCompared()
}
async function withdraw(replay = false) {
  if (!canWrite.value || !withdrawTarget.value) return
  const release = withdrawTarget.value
  if (
    await submit(
      'withdraw',
      0,
      { release },
      (id) => client.withdraw(id, release),
      () => {
        withdrawTarget.value = undefined
      },
      replay,
    )
  )
    await load()
}
onMounted(load)
useSettingsFacts(() => {
  packages.value = []
  withdrawTarget.value = undefined
  uploadTarget.value = undefined
})
</script>
<template>
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <UiButton :disabled="busy || !canRead" @click="load">{{ t('settings.reload') }}</UiButton>
  <OperationNotice
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :query-supported="true"
    :compared="compared"
    @compare="compare"
    @query="compare"
    @retry="withdraw(true)"
    @edit="resolveConflict"
  />
  <section v-for="slot in slots" :key="slot.label" class="console-panel package-platform-row">
    <header class="package-platform-heading">
      <h2>{{ slot.label }}</h2>
      <UiButton
        :disabled="!!uploadTarget || !allows('software_write') || !allows('resource_write')"
        @click="uploadTarget = slot"
        >{{ t('settings.addInstaller') }}</UiButton
      >
    </header>
    <p v-if="!slot.packages.length">{{ t('settings.noPackage') }}</p>
    <article v-for="p in slot.packages" :key="p.releaseId" class="package-release">
      <div>
        <strong>{{ p.filename }}</strong>
        <p>{{ p.version }} · {{ t('settings.packagePublished') }}</p>
      </div>
      <UiButton :disabled="locked || !canWrite" @click="withdrawTarget = p.releaseId">{{
        t('settings.withdrawPackage')
      }}</UiButton>
    </article>
  </section>
  <PackageUpload
    v-if="uploadTarget"
    :target="uploadTarget"
    :can-upload="allows('software_write') && allows('resource_write')"
    :can-publish="allows('release_publish')"
    :can-query="allows('software_read')"
    @published="load"
    @close="uploadTarget = undefined"
  />
  <UiDialog
    :open="!!withdrawTarget"
    :title="t('settings.withdrawPackage')"
    :close-label="t('console.cancel')"
    kind="alertdialog"
    @update:open="!$event && (withdrawTarget = undefined)"
    ><p>{{ t('settings.withdrawPackageHint') }}</p>
    <template #footer
      ><UiButton variant="danger" :disabled="locked || !canWrite" @click="withdraw">{{
        t('devices.confirmAction')
      }}</UiButton></template
    ></UiDialog
  >
</template>
