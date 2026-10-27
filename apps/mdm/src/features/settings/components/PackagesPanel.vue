<script setup lang="ts">
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog } from 'vuetify/components'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import PackageUpload from './PackageUpload.vue'
import OperationNotice from './OperationNotice.vue'
import { uuid } from '../../../services/decode'
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
const packages = ref<Awaited<ReturnType<typeof client.list>>['items']>([]),
  next = ref<string | null>(null),
  withdrawTarget = ref<string>(),
  withdrawActivator = ref<HTMLElement>(),
  uploadTarget = ref<(typeof targets)[number]>()
function openWithdrawal(release: string, event: MouseEvent) {
  withdrawActivator.value = event.currentTarget as HTMLElement
  withdrawTarget.value = release
}
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
const pendingRelease = computed(() =>
  pending.value
    ? uuid((JSON.parse(pending.value.publicInput) as Record<string, unknown>)['release'])
    : undefined,
)
watch(
  () => runtime.settings.operations.records.get('package-upload'),
  (task) => {
    if (!task) return
    if (task.action === 'publish' && task.state === 'received') {
      if (!uploadTarget.value) runtime.settings.operations.records.delete('package-upload')
      return
    }
    if (!uploadTarget.value) {
      const input = JSON.parse(task.publicInput) as Record<string, unknown>
      uploadTarget.value = targets.find(
        (t) => t.platform === input['platform'] && t.architecture === input['architecture'],
      )
    }
  },
  { immediate: true, flush: 'sync' },
)
async function load(cursor?: string) {
  if (!cursor) packages.value = []
  return run(
    () => client.list({ cursor }),
    (v) => {
      packages.value = cursor ? [...packages.value, ...v.items] : v.items
      next.value = v.nextCursor
    },
  )
}
async function compare() {
  const old = pending.value
  const release = pendingRelease.value
  if (old && release)
    await query(
      old.id,
      () => client.operation(old.id, 'withdraw', release),
      (value) => {
        if (value) withdrawTarget.value = undefined
      },
      (value) => value !== null,
    )
  if (await load()) markCompared()
}
async function withdraw(replay = false) {
  const release = replay ? pendingRelease.value : withdrawTarget.value
  if (!canWrite.value || !release) return
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
onMounted(() => load())
useSettingsFacts(() => {
  packages.value = []
  next.value = null
  withdrawTarget.value = undefined
  uploadTarget.value = undefined
})
</script>
<template>
  <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
  <VBtn :disabled="busy || !canRead" @click="load()">{{ t('settings.reload') }}</VBtn
  ><VBtn v-if="next" :disabled="busy" @click="load(next)">{{ t('devices.next') }}</VBtn
  ><OperationNotice
    v-if="!withdrawTarget"
    :operation="pending"
    :busy="busy"
    :can-write="canWrite"
    :query-supported="true"
    :compared="compared"
    @compare="compare"
    @query="compare"
    @retry="withdraw(true)"
    @edit="resolveConflict"
  /><VCard
    v-for="slot in slots"
    :key="slot.label"
    class="console-panel package-platform-row"
    tag="section"
    variant="outlined"
    ><header class="package-platform-heading">
      <h2>{{ slot.label }}</h2>
      <VBtn
        :disabled="!!uploadTarget || !allows('software_write') || !allows('resource_write')"
        @click="uploadTarget = slot"
        >{{ t('settings.addInstaller') }}</VBtn
      >
    </header>
    <p v-if="!slot.packages.length">{{ t('settings.noPackage') }}</p>
    <article v-for="p in slot.packages" :key="p.releaseId" class="package-release">
      <div>
        <strong>{{ p.filename }}</strong>
        <p>
          {{ p.version }} ·
          {{
            t(p.state === 'published' ? 'settings.packagePublished' : 'settings.packageWithdrawn')
          }}
        </p>
      </div>
      <VBtn
        :disabled="locked || !canWrite || p.state !== 'published'"
        @click="openWithdrawal(p.releaseId, $event)"
        >{{ t('settings.withdrawPackage') }}</VBtn
      >
    </article></VCard
  ><PackageUpload
    v-if="uploadTarget"
    :target="uploadTarget"
    :can-upload="allows('software_write') && allows('resource_write')"
    :can-publish="allows('release_publish')"
    :can-query="allows('software_read')"
    @published="load"
    @close="uploadTarget = undefined"
  /><VDialog
    :activator="withdrawActivator"
    :open-on-click="false"
    :model-value="!!withdrawTarget"
    role="alertdialog"
    :aria-label="t('settings.withdrawPackage')"
    @update:model-value="!$event && (withdrawTarget = undefined)"
    ><VCard
      ><VCardTitle tag="h2">{{ t('settings.withdrawPackage') }}</VCardTitle
      ><VCardText
        ><p>{{ t('settings.withdrawPackageHint') }}</p>
        <OperationNotice
          :operation="pending"
          :busy="busy"
          :can-write="canWrite"
          :compared="compared"
          @compare="compare"
          @query="compare"
          @retry="withdraw(true)"
          @edit="resolveConflict" /></VCardText
      ><VCardActions
        ><VBtn @click="withdrawTarget = undefined">{{ t('console.cancel') }}</VBtn
        ><VBtn color="error" :disabled="locked || !canWrite" @click="withdraw()">{{
          t('settings.confirmWithdrawal')
        }}</VBtn></VCardActions
      ></VCard
    ></VDialog
  >
</template>
