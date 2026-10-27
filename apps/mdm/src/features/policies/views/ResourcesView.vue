<script setup lang="ts">
import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import PolicyFieldset from '../components/PolicyFieldset.vue'
import PolicyDialog from '../components/PolicyDialog.vue'
import PolicyTabs from '../components/PolicyTabs.vue'

import {
  VFileInput,
  VBtn,
  VTextField,
  VSelect,
  VDataTable,
  VChip,
  VTextarea,
  VTable,
} from 'vuetify/components'

import { comparison as queryComparison } from '../../../services/directory-query'
import { computed, onBeforeUnmount, ref, shallowRef, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useMdm } from '../../../context'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { operation, useOperation } from '../../../services/useOperation'
import { fileHash, FILE_CHUNK_BYTES } from '../../../services/file-hash'
import type { UploadSession } from '../clients/uploads'
import { jsonObject } from '../../../services/json'
import { uuid } from '../../../services/decode'
import { MDM_CONTENT_BODY_LIMIT } from '@rss/api/mdm-limits'
import type {
  Artifact,
  Declaration,
  ResourceChange,
  ResourceKind,
  ResourceRead,
  ScriptSpec,
  UploadTarget,
  Variant,
} from '../clients/resources'
import { validateSoftwareTarget } from '../clients/software-definition'
import SoftwareDefinitionEditor from '../../software/components/SoftwareDefinitionEditor.vue'
import MdmPage from '../../../ui/MdmPage.vue'
import ScriptDefinitionEditor from '../components/ScriptDefinitionEditor.vue'
import PublishedSoftware from '../components/PublishedSoftware.vue'
import CollectionVersionEditor from '../components/CollectionVersionEditor.vue'
import { agentBytes, nativeBytes } from '../../../contracts/collection/canonical'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  client = runtime.policies.resources,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const creating = ref(false),
  resourceTab = ref('versions'),
  query = ref(''),
  resourceFilter = ref<'' | ResourceKind>('')
const visibleResources = computed(() =>
  (list.value?.items ?? []).filter((item) =>
    `${item.presentation['name'] ?? ''} ${item.id}`
      .toLocaleLowerCase()
      .includes(query.value.toLocaleLowerCase()),
  ),
)
let appliedKind: ResourceKind | undefined
const kindLabel = (value: ResourceKind) =>
  t(
    value === 'script'
      ? 'policies.scripts'
      : value === 'software'
        ? 'policies.software'
        : value === 'configuration'
          ? 'policies.configurations'
          : value === 'telemetry_profile'
            ? 'telemetry.profiles'
            : value === 'native_collection'
              ? 'policies.nativeCollection'
              : 'policies.agentCollection',
  )
async function downloadScript(version: string, variant: Variant) {
  if (!current.value) return
  await run(
    () =>
      client.script(current.value!.id, version, {
        platform: variant.platform,
        architecture: variant.architecture,
        variant: variant.key,
      }),
    (v) => {
      const url = URL.createObjectURL(new Blob([v.bytes], { type: 'application/octet-stream' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'script.txt'
      a.click()
      URL.revokeObjectURL(url)
    },
  )
}
function closeResource() {
  if (busy.value || uncertain.value) return
  resetDraft()
  current.value = undefined
  load()
}
const presentationName = ref(''),
  presentationDescription = ref('')
function readPresentation(value?: ResourceRead) {
  const presentation = value?.presentation ?? {}
  presentationName.value = typeof presentation['name'] === 'string' ? presentation['name'] : ''
  presentationDescription.value =
    typeof presentation['description'] === 'string' ? presentation['description'] : ''
}
function savePresentation() {
  if (!current.value) return
  try {
    change({
      action: 'present',
      presentation: jsonObject(
        {
          ...structuredClone(toRaw(current.value.presentation)),
          name: presentationName.value,
          description: presentationDescription.value,
        },
        65536,
      ),
    })
  } catch {
    failure.value = 'invalidRequest'
  }
}
const blueprints = ref<Awaited<ReturnType<typeof client.blueprints>>>(),
  category = ref(''),
  blueprint = ref('')
const blueprintOptions = computed(
  () =>
    blueprints.value?.items.filter((b) => !category.value || b.category === category.value) ?? [],
)
function loadBlueprints() {
  void run(
    () => client.blueprints(),
    (value) => {
      blueprints.value = value
    },
  )
}
function instantiate() {
  if (busy.value || uncertain.value) return
  const selected = blueprintOptions.value.find(
    (b) => JSON.stringify([b.id, b.version]) === blueprint.value,
  )
  if (!selected) return
  current.value = undefined
  id.value = crypto.randomUUID()
  change({ action: 'instantiate', blueprint: selected.id, version: selected.version })
}
const id = ref(''),
  current = ref<ResourceRead>(),
  kind = ref<ResourceKind>('script'),
  version = ref('1'),
  target = ref<UploadTarget>({
    version: '1',
    variant: 'main',
    platform: 'windows',
    architecture: 'x86_64',
  })
watch(current, readPresentation, { flush: 'sync' })
const list = ref<Awaited<ReturnType<typeof client.list>>>(),
  artifact = ref<Artifact>({ reference: 'content', length: 0, sha256: Array(32).fill(0) })

const freshScript = (): ScriptSpec => ({
  profile: 'power_shell7',
  sql: null,
  runAs: 'system',
  encoding: 'utf8',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  bindings: {},
  output: { type: 'object', properties: {}, additionalProperties: false },
  purpose: { kind: 'action' },
  timeoutSeconds: 60,
  outputBytes: 16384,
  maxRows: 1,
})
const spec = ref(freshScript())
const scriptEditor = ref<InstanceType<typeof ScriptDefinitionEditor>>()
const softwareEditor = ref<InstanceType<typeof SoftwareDefinitionEditor>>(),
  contentArtifact = ref('')
const draftVariants = ref<Variant[]>([]),
  editorEpoch = ref(0)
const generatedFiles = shallowRef<{ file: File; target: UploadTarget }[]>([])
function stageGeneratedFile() {
  const next = generatedFiles.value[0]
  if (!next) {
    file.value = undefined
    return
  }
  uploadCommitted.value = false
  uploadSession.value = undefined
  file.value = next.file
  target.value = { ...next.target }
  version.value = next.target.version
  contentArtifact.value = next.target.artifact ?? ''
}
function collectionPrepared(input: ResourceChange, files: { file: File; target: UploadTarget }[]) {
  change(input, files)
}
function advanceGeneratedFile() {
  generatedFiles.value = generatedFiles.value.slice(1)
  stageGeneratedFile()
}
function resetDraft() {
  spec.value = freshScript()
  draftVariants.value = []
  generatedFiles.value = []
  editorEpoch.value++
  artifact.value = { reference: 'content', length: 0, sha256: Array(32).fill(0) }
  version.value = '1'
  target.value = { version: '1', variant: 'main', platform: 'windows', architecture: 'x86_64' }
  contentArtifact.value = ''
  uploadPending.value = undefined
  uploadSession.value = undefined
  uploadId.value = ''
  uploadCommitted.value = false
  transfer?.abort()
  file.value = undefined
  if (uploadInput.value) {
    const input = uploadInput.value.$el.querySelector('input[type=file]') as HTMLInputElement | null
    if (input) input.value = ''
  }
  pending = undefined
}
const file = shallowRef<File>(),
  uploadInput = ref<InstanceType<typeof VFileInput>>(),
  uploadPending = ref<{
    id: string
    upload: string
    target: UploadTarget
    hash: string
    length: number
  }>(),
  uploadId = ref(''),
  uploadSession = ref<UploadSession>(),
  uploadCommitted = ref(false)
let transfer: AbortController | undefined
let pending: (() => Promise<void>) | undefined
const hashText = (bytes: number[]) => bytes.map((n) => n.toString(16).padStart(2, '0')).join('')
function load(cursor?: string) {
  list.value = undefined
  if (busy.value) return
  const selection = cursor ? appliedKind : resourceFilter.value || undefined
  void run(
    () =>
      client.list({
        filter: selection ? queryComparison('kind', '==', selection) : undefined,
        cursor,
      }),
    (v) => {
      if ((resourceFilter.value || undefined) !== selection) return
      list.value = v
      appliedKind = selection
    },
  )
}
function open(value = id.value) {
  if (!busy.value && !uncertain.value)
    void run(
      () => client.read(value),
      (v) => {
        if (v.kind === 'telemetry_profile') {
          void router.push({
            name: 'policy-telemetry',
            params: { tenant: runtime.tenant },
            query: { resource: v.id },
          })
          return
        }
        creating.value = false
        current.value = v
        id.value = v.id
        kind.value = v.kind
        resourceTab.value = route.query['tab'] === 'content' ? 'content' : 'versions'
        resetDraft()
        if (v.kind === 'software') {
          const selected =
              v.versions.find((item) => item.id === route.query['version']) ?? v.versions[0],
            variant = selected?.variants[0]
          if (selected && variant) {
            version.value = selected.id
            target.value = {
              version: selected.id,
              variant: variant.key,
              platform: variant.platform,
              architecture: variant.architecture,
            }
          }
        }
      },
    )
}
function create() {
  if (busy.value || uncertain.value) return
  creating.value = true
  id.value = `resource-${crypto.randomUUID()}`
  current.value = undefined
  resetDraft()
}
function change(input: ResourceChange, generated?: { file: File; target: UploadTarget }[]) {
  if (busy.value || uncertain.value) return
  const resource = current.value?.id ?? id.value,
    body = operation(input, current.value?.revision ?? 0)
  file.value = undefined
  if (uploadInput.value) {
    const input = uploadInput.value.$el.querySelector('input[type=file]') as HTMLInputElement | null
    if (input) input.value = ''
  }
  pending = async () => {
    const acknowledged = await runWrite(() => client.change(resource, body))
    if (acknowledged)
      await run(
        () => client.read(resource),
        (v) => {
          if (v.kind === 'telemetry_profile') {
            void router.push({
              name: 'policy-telemetry',
              params: { tenant: runtime.tenant },
              query: { resource: v.id },
            })
            return
          }
          creating.value = false
          current.value = v
          id.value = v.id
          kind.value = v.kind
          list.value = undefined
          if (input.action === 'version') draftVariants.value = []
          if (generated) {
            generatedFiles.value = generated
            stageGeneratedFile()
          }
        },
      )
  }
  void pending()
}
function validFile(file: File) {
  if (!file.size) {
    failure.value = 'emptyContent'
    return false
  }
  if (kind.value !== 'software' && file.size > MDM_CONTENT_BODY_LIMIT) {
    failure.value = 'contentTooLarge'
    return false
  }
  return true
}
async function metadata(event: Event) {
  const input = event.target as HTMLInputElement,
    selected = input.files?.[0]
  input.value = ''
  if (!selected || !validFile(selected)) return
  await run(
    () => fileHash(selected),
    (sha256) => (artifact.value = { ...artifact.value, length: selected.size, sha256 }),
  )
}
function addVersion() {
  const resourceKind = current.value?.kind ?? kind.value
  if (
    resourceKind === 'native_collection' ||
    resourceKind === 'agent_collection' ||
    resourceKind === 'telemetry_profile'
  ) {
    failure.value = 'unsupported'
    return
  }
  if (resourceKind === 'script' && scriptEditor.value && !scriptEditor.value.valid()) {
    failure.value = 'invalidRequest'
    return
  }
  if (resourceKind === 'software') {
    if (!draftVariants.value.length) {
      failure.value = 'invalidRequest'
      return
    }
    change({
      action: 'version',
      version: version.value,
      kind: resourceKind,
      variants: structuredClone(toRaw(draftVariants.value)),
    })
    return
  }
  const a = structuredClone(toRaw(artifact.value))
  let declaration: Declaration
  if (resourceKind === 'script')
    declaration = {
      kind: resourceKind,
      artifact: a,
      definition: structuredClone(toRaw(spec.value)),
    }
  else
    declaration = {
      kind: resourceKind,
      artifact: a,
    }
  change({
    action: 'version',
    version: version.value,
    kind: resourceKind,
    variants: [
      {
        platform: target.value.platform,
        architecture: target.value.architecture,
        key: target.value.variant,
        declaration,
      },
    ],
  })
}
function stageVariant() {
  if (busy.value || uncertain.value || !softwareEditor.value) return
  try {
    const definition = softwareEditor.value.read(structuredClone(toRaw(artifact.value)))
    validateSoftwareTarget(definition, target.value.platform, target.value.architecture)
    const variant: Variant = {
      platform: target.value.platform,
      architecture: target.value.architecture,
      key: target.value.variant,
      declaration: { kind: 'software', definition },
    }
    const index = draftVariants.value.findIndex(
      (v) =>
        v.platform === variant.platform &&
        v.architecture === variant.architecture &&
        v.key === variant.key,
    )
    if (index >= 0) draftVariants.value[index] = variant
    else draftVariants.value.push(variant)
    failure.value = null
  } catch {
    failure.value = 'invalidRequest'
  }
}
function select(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0]
}
function rememberUpload(value: UploadSession) {
  uploadSession.value = value
  uploadId.value = value.id
  const b = value.binding,
    r = b.purpose.binding
  uploadPending.value = {
    id: r.resource,
    upload: value.id,
    target: {
      version: r.version,
      variant: r.variant,
      platform: r.platform,
      architecture: r.architecture,
      artifact: b.reference,
    },
    hash: hashText(b.sha256),
    length: b.length,
  }
  const variant = current.value?.versions
    .find((v) => v.id === r.version)
    ?.variants.find(
      (v) => v.key === r.variant && v.platform === r.platform && v.architecture === r.architecture,
    )
  const declaration = variant?.declaration
  if (declaration?.kind === 'native_collection' || declaration?.kind === 'agent_collection') {
    const bytes =
      declaration.kind === 'native_collection'
        ? nativeBytes(declaration.definition)
        : agentBytes(declaration.definition)
    file.value = new File([bytes.buffer as ArrayBuffer], 'collection.json', {
      type: 'application/json',
    })
  }
}
function readUpload() {
  if (!current.value || (uncertain.value && !uploadPending.value)) return
  const resource = uploadPending.value?.id ?? current.value.id,
    upload = uploadPending.value?.upload ?? uploadId.value
  try {
    uuid(upload)
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  void run(() => client.uploads.read(resource, upload), rememberUpload)
}
async function upload() {
  if (busy.value || !file.value || !current.value || (uncertain.value && !uploadPending.value))
    return
  const selected = file.value
  file.value = undefined
  if (uploadInput.value) {
    const input = uploadInput.value.$el.querySelector('input[type=file]') as HTMLInputElement | null
    if (input) input.value = ''
  }
  if (!validFile(selected)) return
  const original = uploadPending.value,
    resource = original?.id ?? current.value.id,
    destination = original?.target ?? {
      ...toRaw(target.value),
      version: version.value,
      ...(contentArtifact.value ? { artifact: contentArtifact.value } : {}),
    },
    upload = original?.upload ?? (uploadId.value || crypto.randomUUID())
  try {
    uuid(upload)
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  transfer?.abort()
  const controller = new AbortController()
  transfer = controller
  let mismatch = false
  const prepared = await run(
    async () => {
      const hash = hashText(await fileHash(selected, controller.signal))
      if (original && (hash !== original.hash || selected.size !== original.length)) {
        mismatch = true
        throw new Error('Different content')
      }
      return { id: resource, upload, target: destination, hash, length: selected.size }
    },
    (value) => {
      uploadPending.value = value
      uploadId.value = upload
      uploadCommitted.value = false
      if (uploadSession.value?.id !== upload) uploadSession.value = undefined
    },
  )
  if (mismatch) failure.value = 'differentContent'
  if (!prepared) return
  const expected = uploadPending.value!
  await runWrite(async () => {
    let value = await client.uploads.begin(resource, upload, destination, controller.signal)
    controller.signal.throwIfAborted()
    if (
      hashText(value.binding.sha256) !== expected.hash ||
      value.binding.length !== expected.length
    )
      throw new Error('Different content binding')
    rememberUpload(value)
    while (!value.complete && value.offset < selected.size) {
      const offset = value.offset,
        bytes = await selected.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer()
      controller.signal.throwIfAborted()
      const next = await client.uploads.append(resource, upload, offset, bytes, controller.signal)
      controller.signal.throwIfAborted()
      if (
        JSON.stringify(next.binding) !== JSON.stringify(value.binding) ||
        next.offset !== offset + bytes.byteLength
      )
        throw new Error('Invalid upload frontier')
      value = next
      rememberUpload(value)
    }
    return value
  }, rememberUpload)
  if (failure.value === 'requestTooLarge') failure.value = 'contentTooLarge'
}
function completeUpload() {
  const p = uploadPending.value,
    session = uploadSession.value
  if (!p || !session || session.id !== p.upload || session.offset !== p.length) return
  transfer?.abort()
  transfer = new AbortController()
  void runWrite(
    () => client.uploads.complete(p.id, p.upload, transfer!.signal),
    () => {
      uploadCommitted.value = true
      uploadPending.value = undefined
      uploadId.value = ''
      advanceGeneratedFile()
    },
  )
}
function verifyUpload() {
  const p = uploadPending.value
  if (!p) return
  void run(
    async () => {
      const receipt = await client.uploads.receipt(p.id, p.upload)
      if (
        receipt.version !== p.target.version ||
        (p.target.artifact !== undefined && receipt.reference !== p.target.artifact) ||
        receipt.length !== p.length ||
        hashText(receipt.sha256) !== p.hash
      )
        throw new Error('Wrong upload receipt')
    },
    () => {
      uploadCommitted.value = true
      uploadPending.value = undefined
      uploadId.value = ''
      advanceGeneratedFile()
      uncertain.value = false
    },
  )
}
onBeforeUnmount(() => {
  transfer?.abort()
  file.value = undefined
  uploadPending.value = undefined
})
watch(
  () => JSON.stringify([route.fullPath, ...deviceBinding(runtime)]),
  () => {
    resetDraft()
    current.value = undefined
    list.value = undefined
    id.value = ''
    query.value = ''
    const resourceKinds: ResourceKind[] = [
      'script',
      'software',
      'configuration',
      'native_collection',
      'agent_collection',
      'telemetry_profile',
    ]
    resourceFilter.value = resourceKinds.includes(route.query['kind'] as ResourceKind)
      ? (route.query['kind'] as ResourceKind)
      : ''
    kind.value = resourceFilter.value || 'script'
    if (typeof route.query['resource'] === 'string') open(route.query['resource'])
    else {
      if (route.query['kind'] === 'software') kind.value = 'software'
      if (route.query['author'] === 'enterprise') create()
      load()
    }
  },
  { immediate: true },
)
</script>
<template>
  <MdmPage
    :title="t('policies.resources')"
    :description="t('policies.ux.resourcesHint')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><VBtn
        variant="tonal"
        :to="{ name: 'policy-telemetry', params: { tenant: runtime.tenant } }"
        >{{ t('telemetry.profiles') }}</VBtn
      ><VBtn
        variant="tonal"
        :to="{ name: 'software-catalog', params: { tenant: runtime.tenant } }"
        >{{ t('policies.publishedSoftware') }}</VBtn
      ><VBtn :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</VBtn
      ><VBtn :disabled="busy" @click="load()">{{ t('policies.reload') }}</VBtn></template
    >
    <template v-if="!current">
      <PublishedSoftware />
      <div class="task-directory-summary">
        <strong>{{ t('policies.ux.loaded', { count: list?.items.length ?? 0 }) }}</strong
        ><span>{{ t('policies.ux.resourcesHint') }}</span>
      </div>
      <div class="console-toolbar task-filterbar">
        <VTextField
          v-model="query"
          :clear-label="t('console.clear')"
          :label="t('policies.ux.searchResources')"
          :placeholder="t('policies.ux.searchResources')"
        /><VSelect
          v-model="resourceFilter"
          :aria-label="t('policies.kind')"
          :disabled="busy"
          :items="[
            { title: String(t('policies.ux.allTypes')), value: '' },
            ...(
              [
                'script',
                'software',
                'configuration',
                'native_collection',
                'agent_collection',
                'telemetry_profile',
              ] as const
            ).map((value) => ({ title: String(kindLabel(value)), value: value })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @update:model-value="load()"
        />
      </div>
      <p class="device-help">{{ t('policies.ux.pageOnly') }}</p>
      <VDataTable
        :aria-label="t('policies.resources')"
        :items-per-page="-1"
        hide-default-footer
        :items="visibleResources"
        item-value="id"
        :loading="busy"
        :loading-text="t('devices.loading')"
        :no-data-text="t('policies.empty')"
        :headers="
          [
            { key: 'name', label: t('devices.name') },
            { key: 'kind', label: t('policies.kind') },
            { key: 'activeVersion', label: t('policies.ux.activeVersion') },
            { key: 'revision', label: t('policies.revision') },
          ].map((column) => ({ key: column.key, title: column.label, sortable: false }))
        "
      >
        <template #[`item.name`]="{ item: row }"
          ><VBtn variant="text" :disabled="busy || uncertain" @click="open(row.id)">{{
            typeof row.presentation['name'] === 'string' && row.presentation['name']
              ? row.presentation['name']
              : row.id
          }}</VBtn
          ><small class="task-object-description">{{
            typeof row.presentation['description'] === 'string'
              ? row.presentation['description']
              : ''
          }}</small></template
        >
        <template #[`item.kind`]="{ item: row }"
          ><VChip>{{ kindLabel(row.kind) }}</VChip></template
        >
        <template #[`item.activeVersion`]="{ item: row }">{{
          row.activeVersion ?? t('policies.ux.noActiveVersion')
        }}</template>
      </VDataTable>
      <VBtn v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">{{
        t('policies.next')
      }}</VBtn>
    </template>
    <PolicyDialog
      v-model:open="creating"
      placement="right"
      :title="
        route.query['author'] === 'enterprise'
          ? t('software.ux.enterprise')
          : t('policies.ux.selectType')
      "
      :close-label="t('console.close')"
      :dismissible="!busy && !uncertain"
    >
      <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
      <section
        v-if="route.query['author'] !== 'enterprise'"
        class="console-panel"
        data-testid="collection-blueprints"
      >
        <h2>{{ t('policies.standardPackages') }}</h2>
        <p>{{ t('policies.standardPackagesNote') }}</p>
        <VBtn :disabled="busy" @click="loadBlueprints">{{ t('policies.choosePackage') }}</VBtn>
        <template v-if="blueprints"
          ><label
            >{{ t('policies.packageCategory')
            }}<VSelect
              v-model="category"
              :disabled="busy || uncertain"
              :items="[
                { title: String(t('devices.all')), value: '' },
                ...blueprints.categories.map((c) => ({
                  title: String(t('policies.packageCategories.' + c)),
                  value: c,
                })),
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              @update:model-value="blueprint = ''" /></label
          ><label
            >{{ t('policies.packageVersion')
            }}<VSelect
              v-model="blueprint"
              :disabled="busy || uncertain"
              :items="[
                { title: String(t('devices.select')), value: '' },
                ...blueprintOptions.map((b) => ({
                  title:
                    String(b.id) +
                    '/' +
                    String(b.version) +
                    '·' +
                    String(b.platform) +
                    '·' +
                    String(b.definition.kind),
                  value: JSON.stringify([b.id, b.version]),
                })),
              ]"
              variant="outlined"
              density="comfortable"
              hide-details="auto" /></label
          ><VBtn
            :disabled="busy || uncertain || !blueprint"
            data-action="instantiate-package"
            @click="instantiate"
            >{{ t('policies.instantiatePackage') }}</VBtn
          ></template
        >
      </section>
      <PolicyFieldset v-show="creating" class="console-panel" :disabled="busy || uncertain">
        <MdmDisclosure class="task-technical">
          <template #title>{{ t('policies.ux.technical') }}</template>
          <label for="resource-id">{{ t('policies.id') }}</label
          ><VTextField
            id="resource-id"
            v-model="id"
            :readonly="!!current"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto"
          /><VBtn type="button" @click="open()">{{ t('policies.open') }}</VBtn>
        </MdmDisclosure>
        <p v-if="route.query['author'] === 'enterprise'">{{ t('software.ux.enterpriseHint') }}</p>
        <label for="resource-kind">{{ t('policies.kind') }}</label
        ><VSelect
          id="resource-kind"
          v-model="kind"
          :disabled="!!current || route.query['author'] === 'enterprise'"
          :items="[
            { title: String(t('policies.scripts')), value: 'script' },
            { title: String(t('policies.software')), value: 'software' },
            { title: String(t('policies.configurations')), value: 'configuration' },
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
        /><VBtn
          v-if="!current && (kind !== 'software' || route.query['author'] === 'enterprise')"
          :disabled="!!!id"
          type="submit"
          @click="change({ action: 'create', kind })"
        >
          {{ t('policies.save') }}
        </VBtn>
        <template v-if="kind === 'software' && route.query['author'] !== 'enterprise'"
          ><p>{{ t('policies.ux.softwareImport') }}</p>
          <RouterLink :to="{ name: 'software-imports', params: { tenant: runtime.tenant } }">{{
            t('policies.ux.importSoftware')
          }}</RouterLink></template
        >
      </PolicyFieldset>
      <template #footer
        ><VBtn v-if="uncertain && pending" :disabled="busy" @click="pending()">{{
          t('policies.replay')
        }}</VBtn></template
      >
    </PolicyDialog>
    <template v-if="current">
      <VBtn variant="text" :disabled="busy || uncertain" @click="closeResource"
        >← {{ t('policies.ux.backResources') }}</VBtn
      >
      <header class="console-page-header task-detail-heading">
        <div>
          <h2>{{ presentationName || current.id }}</h2>
          <p>{{ kindLabel(current.kind) }} · {{ t('policies.revision') }} {{ current.revision }}</p>
        </div>
        <VChip>{{ kindLabel(current.kind) }}</VChip>
      </header>
      <PolicyTabs
        v-model="resourceTab"
        :label="t('policies.resources')"
        :keep-mounted="true"
        :items="[
          { value: 'versions', label: t('policies.ux.versions') },
          { value: 'content', label: t('policies.ux.content') },
          { value: 'metadata', label: t('policies.ux.metadata') },
        ]"
      >
        <template #metadata>
          <form data-testid="resource-presentation" @submit.prevent="savePresentation">
            <PolicyFieldset :disabled="busy || uncertain">
              <legend>{{ t('policies.resourcePresentation') }}</legend>
              <label for="resource-display-name">{{ t('devices.name') }}</label
              ><VTextField
                id="resource-display-name"
                v-model="presentationName"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
              />
              <label for="resource-description">{{ t('policies.selfService.description') }}</label
              ><VTextarea
                id="resource-description"
                v-model="presentationDescription"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
              />
              <VBtn type="submit">{{ t('devices.save') }}</VBtn>
            </PolicyFieldset>
          </form> </template
        ><template #versions>
          <div class="device-table-scroll">
            <VTable density="comfortable">
              <thead>
                <tr>
                  <th>{{ t('policies.version') }}</th>
                  <th>{{ t('policies.status') }}</th>
                  <th>{{ t('policies.detail') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in current.versions" :key="item.id">
                  <td>{{ item.id }}</td>
                  <td>{{ t(`policies.state.${item.state}`) }}</td>
                  <td>
                    <template v-if="current.kind === 'script' && item.state !== 'archived'"
                      ><VBtn
                        v-for="variant in item.variants"
                        :key="variant.key + variant.platform + variant.architecture"
                        :disabled="busy"
                        @click="downloadScript(item.id, variant)"
                        >{{ t('gap.script') }} · {{ variant.platform }} /
                        {{ variant.architecture }} / {{ variant.key }}</VBtn
                      ></template
                    >
                    <VBtn
                      v-for="action in (item.state === 'frozen'
                        ? ['activate', 'archive']
                        : item.state === 'active'
                          ? ['deprecate', 'archive']
                          : item.state === 'deprecated'
                            ? ['activate', 'archive']
                            : []) as ('activate' | 'deprecate' | 'archive')[]"
                      :key="action"
                      :disabled="!!(busy || uncertain || generatedFiles.length)"
                      type="submit"
                      @click="change({ action, version: item.id })"
                    >
                      {{ t(`policies.${action}`) }}
                    </VBtn>
                    <RouterLink
                      v-if="
                        item.state === 'active' &&
                        [
                          'script',
                          'software',
                          'native_collection',
                          'agent_collection',
                          'configuration',
                        ].includes(current.kind)
                      "
                      :to="{
                        name: 'policy-policies',
                        params: { tenant: runtime.tenant },
                        query: {
                          kind: current.kind === 'script' ? 'execution' : current.kind,
                          ...(current.kind === 'software' ? { action: 'software' } : {}),
                          resource: current.id,
                          version: item.id,
                        },
                      }"
                      >{{ t('policies.assignPackage') }}</RouterLink
                    >
                  </td>
                </tr>
              </tbody>
            </VTable>
          </div> </template
        ><template #content>
          <p v-if="current.kind === 'configuration'">
            {{ t('policies.configurationContentHint') }}
          </p>
          <CollectionVersionEditor
            v-if="current.kind === 'native_collection' || current.kind === 'agent_collection'"
            :resource="current"
            :locked="busy || uncertain || !!generatedFiles.length"
            @prepare="collectionPrepared"
          />
          <MdmDisclosure
            v-if="kind !== 'native_collection' && kind !== 'agent_collection'"
            class="console-panel console-task"
            :open="uncertain || undefined"
          >
            <template #title>{{ t('policies.version') }}</template>
            <form @submit.prevent="addVersion">
              <PolicyFieldset :disabled="busy || uncertain">
                <label for="resource-version">{{ t('policies.version') }}</label
                ><VTextField
                  id="resource-version"
                  v-model="version"
                  required
                  variant="outlined"
                  density="comfortable"
                  hide-details="auto"
                /><label for="resource-platform">{{ t('policies.platform') }}</label
                ><VSelect
                  id="resource-platform"
                  v-model="target.platform"
                  :items="[
                    { title: 'Windows', value: 'windows' },
                    { title: 'macOS', value: 'macos' },
                  ]"
                  variant="outlined"
                  density="comfortable"
                  hide-details="auto"
                /><label for="resource-architecture">{{ t('policies.architecture') }}</label
                ><VSelect
                  id="resource-architecture"
                  v-model="target.architecture"
                  :items="[
                    { title: 'x86_64', value: 'x86_64' },
                    { title: 'aarch64', value: 'aarch64' },
                  ]"
                  variant="outlined"
                  density="comfortable"
                  hide-details="auto"
                /><label for="resource-variant">{{ t('policies.variant') }}</label
                ><VTextField
                  id="resource-variant"
                  v-model="target.variant"
                  required
                  variant="outlined"
                  density="comfortable"
                  hide-details="auto"
                /><label for="resource-metadata">{{ t('policies.metadata') }}</label
                ><VFileInput
                  id="resource-metadata"
                  :label="t('policies.metadata')"
                  variant="outlined"
                  hide-details="auto"
                  @change="metadata"
                /><label for="resource-reference">{{ t('policies.reference') }}</label
                ><VTextField
                  id="resource-reference"
                  v-model="artifact.reference"
                  required
                  variant="outlined"
                  density="comfortable"
                  hide-details="auto"
                />
                <p>
                  {{ t('policies.length') }} {{ artifact.length }} · {{ t('policies.hash') }}
                  {{ hashText(artifact.sha256) }}
                </p>
                <ScriptDefinitionEditor
                  v-if="kind === 'script'"
                  v-model="spec"
                /><SoftwareDefinitionEditor
                  v-else-if="kind === 'software'"
                  :key="editorEpoch"
                  ref="softwareEditor"
                /><template v-if="kind === 'software'">
                  <VBtn type="button" data-action="stage-variant" @click="stageVariant">
                    {{ t('software.stageVariant') }}
                  </VBtn>
                  <p>{{ t('software.variantDraftHint') }}</p>
                  <ul>
                    <li
                      v-for="(v, index) in draftVariants"
                      :key="`${v.platform}/${v.architecture}/${v.key}`"
                    >
                      {{ v.platform }} / {{ v.architecture }} / {{ v.key }}
                      <VBtn type="button" @click="draftVariants.splice(index, 1)">
                        {{ t('software.removeVariant') }}
                      </VBtn>
                    </li>
                  </ul> </template
                ><VBtn
                  type="submit"
                  :disabled="!!(kind === 'software' ? !draftVariants.length : !artifact.length)"
                >
                  {{ t('policies.save') }}
                </VBtn>
              </PolicyFieldset>
            </form>
          </MdmDisclosure>
          <section class="console-panel">
            <h2>{{ t('policies.upload') }}</h2>
            <p>{{ t('software.uploadSessionHint') }}</p>
            <p v-if="failure === 'unsupported'" role="alert">
              {{ t('software.ux.contentPrerequisite') }}
              <RouterLink
                :to="{
                  name: 'settings-material',
                  params: { tenant: runtime.tenant, material: 'storage' },
                }"
                >{{ t('settings.integrations') }}</RouterLink
              >
            </p>
            <label for="resource-upload-id">{{ t('software.uploadSessionId') }}</label>
            <VTextField
              id="resource-upload-id"
              v-model="uploadId"
              :disabled="busy || !!uploadPending"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />
            <VBtn
              data-action="read-upload"
              :disabled="!!(busy || !uploadId || (uncertain && !uploadPending))"
              type="submit"
              @click="readUpload"
            >
              {{ t('software.readUpload') }}
            </VBtn>
            <p>{{ t('policies.fileCleared') }}</p>
            <template v-if="kind === 'software'"
              ><label for="resource-artifact">{{ t('software.contentArtifact') }}</label
              ><VTextField
                id="resource-artifact"
                v-model="contentArtifact"
                :disabled="busy || uncertain"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
            /></template>
            <p v-if="generatedFiles.length" data-testid="collection-upload-remaining">
              {{ t('policies.collectionEditor.remaining', { count: generatedFiles.length })
              }}<VBtn :disabled="busy" @click="stageGeneratedFile">{{
                t('policies.collectionEditor.resume')
              }}</VBtn>
            </p>
            <label
              v-if="kind !== 'native_collection' && kind !== 'agent_collection'"
              for="resource-upload"
              >{{ t('policies.content') }}</label
            ><VFileInput
              v-if="kind !== 'native_collection' && kind !== 'agent_collection'"
              id="resource-upload"
              ref="uploadInput"
              :label="t('policies.content')"
              variant="outlined"
              hide-details="auto"
              :disabled="busy"
              @change="select"
            /><VBtn
              :disabled="!!(busy || !file || (uncertain && !uploadPending))"
              type="submit"
              @click="upload"
            >
              {{ t('policies.upload') }}
            </VBtn>
            <p v-if="uploadPending">
              {{ uploadPending.upload }} · {{ uploadPending.id }} /
              {{ uploadPending.target.version }} / {{ uploadPending.target.variant }} ·
              {{ uploadPending.length }} · {{ uploadPending.hash }}
            </p>
            <p v-if="uploadSession">
              {{ t('software.uploadProgress') }} {{ uploadSession.offset }} /
              {{ uploadSession.binding.length }}
            </p>
            <VBtn
              v-if="
                uploadPending &&
                uploadSession?.id === uploadPending.upload &&
                uploadSession.offset === uploadPending.length
              "
              data-action="complete-upload"
              :disabled="!!busy"
              type="submit"
              @click="completeUpload"
            >
              {{ t('software.completeUpload') }}
            </VBtn>
            <VBtn
              v-if="uploadPending"
              data-action="verify-upload"
              :disabled="!!busy"
              type="submit"
              @click="verifyUpload"
            >
              {{ t('software.verifyUpload') }}
            </VBtn>
            <p v-if="uploadCommitted" role="status">{{ t('software.uploadCommitted') }}</p>
          </section></template
        ></PolicyTabs
      ></template
    >
    <VBtn
      v-if="uncertain && pending && !uploadPending"
      :disabled="!!busy"
      type="submit"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </VBtn>
  </MdmPage>
</template>
