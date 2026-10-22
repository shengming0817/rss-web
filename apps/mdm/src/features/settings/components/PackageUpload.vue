<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { UiButton, UiProgress } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useSettingsAction, useSettingsFacts } from '../useSettingsAction'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { target as decodeTarget } from '../../enrollment/clients/packages'
const props = defineProps<{
  target: ReturnType<typeof decodeTarget>
  canUpload: boolean
  canPublish: boolean
  canQuery: boolean
}>()
const emit = defineEmits<{ published: []; close: [] }>()
const runtime = useMdm(),
  client = runtime.settings.packages,
  { t } = useI18n()
const upload = useOperation([], () => deviceBinding(runtime))
const { submit, query, pending, busy, failure, locked, compared, markCompared, resolveConflict } =
  useSettingsAction(() => 'package-upload')
const stage = ref<'choose' | 'uploading' | 'checking' | 'ready' | 'saved' | 'published'>('choose')
const progress = ref(0),
  version = ref(''),
  packageId = ref('')
const inspected = ref<Awaited<ReturnType<typeof client.inspect>>>()
const saved = ref(false),
  filename = ref('')
let file: File | undefined,
  sha256: number[] = [],
  controller: AbortController | undefined
const restored = computed(() =>
  pending.value ? (JSON.parse(pending.value.publicInput) as Record<string, unknown>) : undefined,
)
const selection = computed(() =>
  restored.value
    ? decodeTarget({
        platform: restored.value['platform'],
        architecture: restored.value['architecture'],
      })
    : { platform: props.target.platform, architecture: props.target.architecture },
)
// ref: Vue core v3.5.35 packages/runtime-core/src/apiWatch.ts (synchronous owner transitions).
watch(
  () => pending.value,
  (task) => {
    if (!task) return
    if (task.action === 'publish' && task.state === 'received') {
      stage.value = 'published'
      file = undefined
      inspected.value = undefined
      runtime.settings.operations.records.delete('package-upload')
      emit('published')
      return
    }
    const input = restored.value!
    packageId.value = String(input['packageId'])
    version.value = String(input['version'] ?? '')
    saved.value = task.action === 'publish' || task.state === 'received'
    stage.value = saved.value ? 'saved' : 'ready'
  },
  { immediate: true, flush: 'sync' },
)
const displayStage = computed(() =>
  pending.value?.state === 'submitting'
    ? pending.value.action === 'save'
      ? 'saving'
      : 'publishing'
    : stage.value,
)
const uploading = computed(() => upload.busy.value)
const ready = computed(
  () =>
    (inspected.value || saved.value) && version.value.trim() && !locked.value && !uploading.value,
)
function clear() {
  controller?.abort()
  file = undefined
  sha256 = []
  inspected.value = undefined
  filename.value = ''
  version.value = ''
  stage.value = 'choose'
}
useSettingsFacts(clear)
onBeforeUnmount(() => {
  clear()
})
function choose(event: Event) {
  const input = event.target as HTMLInputElement,
    selected = input.files?.[0]
  input.value = ''
  void chooseFile(selected)
}
function drop(event: DragEvent) {
  const files = event.dataTransfer?.files
  if (files?.length !== 1) {
    upload.failure.value = 'invalidRequest'
    return
  }
  void chooseFile(files[0])
}
async function chooseFile(selected?: File) {
  if (!selected || !props.canUpload || file || pending.value?.state === 'unknown') return
  const extension = selected.name.split('.').at(-1)?.toLowerCase()
  if (
    !selected.size ||
    !(props.target.platform === 'windows' ? ['exe', 'msi', 'msix'] : ['pkg']).includes(
      extension ?? '',
    )
  ) {
    upload.failure.value = 'invalidRequest'
    return
  }
  file = selected
  filename.value = selected.name
  packageId.value = crypto.randomUUID()
  controller = new AbortController()
  const signal = controller.signal
  await upload.run(
    async () => {
      sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await selected.arrayBuffer())),
      )
      signal.throwIfAborted()
      return client.begin(packageId.value, selected.name, selected.size, sha256, signal)
    },
    () => {
      stage.value = 'uploading'
    },
  )
  if (!signal.aborted && stage.value === 'uploading') await transfer()
}
async function resume() {
  if (!file || !controller || !sha256.length) return
  const selected = file,
    signal = controller.signal
  if (stage.value === 'choose') {
    const ok = await upload.run(
      () => client.begin(packageId.value, selected.name, selected.size, sha256, signal),
      () => {
        stage.value = 'uploading'
      },
    )
    if (!ok) return
  }
  await transfer()
}
async function transfer() {
  const selected = file,
    signal = controller?.signal,
    id = packageId.value
  if (!selected || !signal || !props.canUpload) return
  await upload.run(
    async () => {
      const status = await client.status(id, signal)
      if (
        status.length !== selected.size ||
        status.filename !== selected.name ||
        status.sha256.some((n, i) => n !== sha256[i])
      )
        throw new Error('Wrong upload binding')
      let offset = status.offset
      if (!status.complete) {
        while (offset < selected.size) {
          signal.throwIfAborted()
          const body = await selected.slice(offset, offset + 16 * 1024 * 1024).arrayBuffer()
          const result = await client.append(id, offset, body, signal)
          signal.throwIfAborted()
          if (result.offset !== offset + body.byteLength) throw new Error('Invalid upload frontier')
          offset = result.offset
          progress.value = Math.round((offset / selected.size) * 100)
        }
        await client.complete(id, signal)
      }
      signal.throwIfAborted()
      stage.value = 'checking'
      const result = await client.inspect(id, signal)
      if (
        result.length !== selected.size ||
        result.filename !== selected.name ||
        result.sha256.some((n, i) => n !== sha256[i]) ||
        (result.facts.format === 'pkg') !== (selection.value.platform === 'macos') ||
        (result.facts.architectures.length &&
          !result.facts.architectures.includes(selection.value.architecture))
      )
        throw new Error('Wrong installer target')
      return result
    },
    (result) => {
      inspected.value = result
      version.value = result.facts.version ?? ''
      stage.value = 'ready'
    },
  )
}
async function publish(replay = false) {
  if (
    (!inspected.value && !saved.value && !restored.value) ||
    !props.canPublish ||
    (!saved.value && !props.canUpload)
  )
    return
  const id = packageId.value
  if (!saved.value) {
    const ok = await submit(
      'save',
      0,
      { packageId: id, version: version.value.trim(), ...selection.value },
      (operation) => client.save(operation, id, version.value.trim(), selection.value),
      () => {
        saved.value = true
        stage.value = 'saved'
      },
      replay,
    )
    if (!ok) return
  }
  if (
    await submit(
      'publish',
      0,
      { packageId: id, version: version.value, ...selection.value },
      (operation) => client.publish(operation, id),
      () => {
        stage.value = 'published'
        file = undefined
      },
      replay && pending.value?.action === 'publish',
    )
  )
    inspected.value = undefined
}
async function check() {
  const old = pending.value
  if (!old || !props.canQuery) return
  const action = old.action === 'save' ? 'save' : 'publish'
  await query(
    old.id,
    () => client.operation(old.id, action, packageId.value),
    (result) => {
      if (result?.kind === 'save') {
        saved.value = true
        stage.value = 'saved'
      }
      if (result?.kind === 'publish') {
        stage.value = 'published'
        file = undefined
        inspected.value = undefined
      }
    },
    (result) => result !== null,
  )
  markCompared()
}
</script>
<template>
  <section class="package-upload-task" :aria-busy="uploading || busy">
    <p>{{ t('settings.packageTaskNote') }}</p>
    <label
      v-if="stage === 'choose' && !pending"
      class="package-dropzone"
      @dragover.prevent
      @drop.prevent="drop"
      >{{ t('settings.chooseInstaller')
      }}<input
        type="file"
        :accept="target.platform === 'windows' ? '.exe,.msi,.msix' : '.pkg'"
        :disabled="!canUpload"
        @change="choose"
    /></label>
    <p v-if="filename || restored">
      <strong v-if="filename">{{ filename }}</strong>
      {{ t('settings.packageStage.' + displayStage) }}
    </p>
    <UiProgress v-if="uploading" :label="t('settings.uploadProgress')" :value="progress" />
    <p v-if="upload.failure.value || failure" role="alert">
      {{ t('devices.' + (upload.failure.value ?? failure)) }}
    </p>
    <UiButton
      v-if="upload.failure.value && file && !inspected"
      :disabled="uploading || !canUpload"
      @click="resume"
      >{{ t('settings.resumeUpload') }}</UiButton
    >
    <template v-if="inspected || saved || restored"
      ><p>
        {{ inspected?.facts.format.toUpperCase() ?? '' }} · {{ selection.platform }} ·
        {{ selection.architecture }}
      </p>
      <label
        >{{ t('settings.packageVersion')
        }}<input
          v-model="version"
          class="ui-input"
          :readonly="!!inspected?.facts.version || saved"
          :disabled="locked"
      /></label>
      <UiButton
        v-if="!locked"
        :disabled="!ready || !canPublish || (!saved && !canUpload)"
        @click="publish()"
        >{{ t(saved ? 'settings.publishSavedPackage' : 'settings.publishInstaller') }}</UiButton
      >
    </template>
    <template v-if="pending?.state === 'unknown' || pending?.state === 'conflict'">
      <p>{{ t('settings.packageUnknown') }}</p>
      <UiButton :disabled="busy || !canQuery" @click="check">{{
        t('settings.queryOperation')
      }}</UiButton>
      <UiButton
        v-if="compared && pending.state === 'unknown'"
        :disabled="busy || !packageId"
        @click="publish(true)"
        >{{ t('devices.replay') }}</UiButton
      >
      <UiButton v-if="compared && pending.state === 'conflict'" @click="resolveConflict">{{
        t('console.edit')
      }}</UiButton>
    </template>
    <UiButton :disabled="locked || uploading" @click="emit('close')">{{
      t('console.cancel')
    }}</UiButton>
  </section>
</template>
