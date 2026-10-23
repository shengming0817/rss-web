<script setup lang="ts">
import { UiButton, UiTable, UiBadge, UiTabs, UiSearchInput, UiDialog } from '@rss/core/components'
import { computed, onBeforeUnmount, ref, shallowRef, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { fileHash, FILE_CHUNK_BYTES } from '../services/file-hash'
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
import PageFrame from '../../../components/PageFrame.vue'
import ScriptDefinitionEditor from '../components/ScriptDefinitionEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  client = runtime.policies.resources,
  { run, runWrite, busy, failure, uncertain } = useOperation()
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

const spec = ref<ScriptSpec>({
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
const scriptEditor = ref<InstanceType<typeof ScriptDefinitionEditor>>()
const softwareEditor = ref<InstanceType<typeof SoftwareDefinitionEditor>>(),
  contentArtifact = ref('')
const draftVariants = ref<Variant[]>([]),
  editorEpoch = ref(0)
function resetDraft() {
  draftVariants.value = []
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
  if (uploadInput.value) uploadInput.value.value = ''
  pending = undefined
}
const file = shallowRef<File>(),
  uploadInput = ref<HTMLInputElement>(),
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
  if (busy.value) return
  const selection = cursor ? appliedKind : resourceFilter.value || undefined
  void run(
    () => client.list(selection, cursor),
    (v) => {
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
function change(input: ResourceChange) {
  if (busy.value || uncertain.value) return
  const resource = current.value?.id ?? id.value,
    body = operation(input, current.value?.revision ?? 0)
  file.value = undefined
  if (uploadInput.value) uploadInput.value.value = ''
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
  if (uploadInput.value) uploadInput.value.value = ''
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
  () => route.fullPath,
  () => {
    resetDraft()
    current.value = undefined
    list.value = undefined
    id.value = ''
    query.value = ''
    resourceFilter.value = route.query['kind'] === 'software' ? 'software' : ''
    kind.value = route.query['kind'] === 'software' ? 'software' : 'script'
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
  <PageFrame
    :title="t('policies.resources')"
    :description="t('policies.ux.resourcesHint')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><UiButton :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</UiButton
      ><UiButton :disabled="busy" @click="load()">{{ t('policies.reload') }}</UiButton></template
    >
    <template v-if="!current">
      <div class="task-directory-summary">
        <strong>{{ t('policies.ux.loaded', { count: list?.items.length ?? 0 }) }}</strong
        ><span>{{ t('policies.ux.resourcesHint') }}</span>
      </div>
      <div class="console-toolbar task-filterbar">
        <UiSearchInput
          v-model="query"
          :clear-label="t('console.clear')"
          :label="t('policies.ux.searchResources')"
          :placeholder="t('policies.ux.searchResources')"
        /><select
          v-model="resourceFilter"
          class="ui-input"
          :aria-label="t('policies.kind')"
          :disabled="busy"
          @change="load()"
        >
          <option value="">{{ t('policies.ux.allTypes') }}</option>
          <option
            v-for="value in [
              'script',
              'software',
              'configuration',
              'native_collection',
              'agent_collection',
              'telemetry_profile',
            ] as const"
            :key="value"
            :value="value"
          >
            {{ kindLabel(value) }}
          </option>
        </select>
      </div>
      <p class="ui-help">{{ t('policies.ux.pageOnly') }}</p>
      <UiTable
        :label="t('policies.resources')"
        :rows="visibleResources"
        :row-key="(item) => item.id"
        :busy="busy"
        :busy-label="t('devices.loading')"
        :empty-label="t('policies.empty')"
        :columns="[
          { key: 'name', label: t('devices.name') },
          { key: 'kind', label: t('policies.kind') },
          { key: 'activeVersion', label: t('policies.ux.activeVersion') },
          { key: 'revision', label: t('policies.revision') },
        ]"
      >
        <template #cell-name="{ row }"
          ><UiButton variant="ghost" :disabled="busy || uncertain" @click="open(row.id)">{{
            typeof row.presentation['name'] === 'string' && row.presentation['name']
              ? row.presentation['name']
              : row.id
          }}</UiButton
          ><small class="task-object-description">{{
            typeof row.presentation['description'] === 'string'
              ? row.presentation['description']
              : ''
          }}</small></template
        >
        <template #cell-kind="{ row }"
          ><UiBadge>{{ kindLabel(row.kind) }}</UiBadge></template
        >
        <template #cell-activeVersion="{ row }">{{
          row.activeVersion ?? t('policies.ux.noActiveVersion')
        }}</template>
      </UiTable>
      <UiButton v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">{{
        t('policies.next')
      }}</UiButton>
    </template>
    <UiDialog
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
        <UiButton :disabled="busy" @click="loadBlueprints">{{
          t('policies.choosePackage')
        }}</UiButton>
        <template v-if="blueprints"
          ><label
            >{{ t('policies.packageCategory')
            }}<select
              v-model="category"
              class="ui-input"
              :disabled="busy || uncertain"
              @change="blueprint = ''"
            >
              <option value="">{{ t('devices.all') }}</option>
              <option v-for="c in blueprints.categories" :key="c" :value="c">
                {{ t('policies.packageCategories.' + c) }}
              </option>
            </select></label
          ><label
            >{{ t('policies.packageVersion')
            }}<select v-model="blueprint" class="ui-input" :disabled="busy || uncertain">
              <option value="">{{ t('devices.select') }}</option>
              <option
                v-for="b in blueprintOptions"
                :key="b.id + b.version"
                :value="JSON.stringify([b.id, b.version])"
              >
                {{ b.id }} / {{ b.version }} · {{ b.platform }} · {{ b.definition.kind }}
              </option>
            </select></label
          ><UiButton
            :disabled="busy || uncertain || !blueprint"
            data-action="instantiate-package"
            @click="instantiate"
            >{{ t('policies.instantiatePackage') }}</UiButton
          ></template
        >
      </section>
      <fieldset v-show="creating" class="console-panel" :disabled="busy || uncertain">
        <details class="task-technical">
          <summary>{{ t('policies.ux.technical') }}</summary>
          <label for="resource-id">{{ t('policies.id') }}</label
          ><input
            id="resource-id"
            v-model="id"
            class="ui-input"
            :readonly="!!current"
            required
          /><UiButton type="button" @click="open()">{{ t('policies.open') }}</UiButton>
        </details>
        <p v-if="route.query['author'] === 'enterprise'">{{ t('software.ux.enterpriseHint') }}</p>
        <label for="resource-kind">{{ t('policies.kind') }}</label
        ><select
          id="resource-kind"
          v-model="kind"
          class="ui-input"
          :disabled="!!current || route.query['author'] === 'enterprise'"
        >
          <option value="script">{{ t('policies.scripts') }}</option>
          <option value="software">{{ t('policies.software') }}</option>
          <option value="configuration">{{ t('policies.configurations') }}</option></select
        ><UiButton
          v-if="!current && (kind !== 'software' || route.query['author'] === 'enterprise')"
          :disabled="!!!id"
          type="submit"
          @click="change({ action: 'create', kind })"
        >
          {{ t('policies.save') }}
        </UiButton>
        <template v-if="kind === 'software' && route.query['author'] !== 'enterprise'"
          ><p>{{ t('policies.ux.softwareImport') }}</p>
          <RouterLink :to="{ name: 'software-imports', params: { tenant: runtime.tenant } }">{{
            t('policies.ux.importSoftware')
          }}</RouterLink></template
        >
      </fieldset>
      <template #footer
        ><UiButton v-if="uncertain && pending" :disabled="busy" @click="pending()">{{
          t('policies.replay')
        }}</UiButton></template
      >
    </UiDialog>
    <template v-if="current">
      <UiButton variant="ghost" :disabled="busy || uncertain" @click="closeResource"
        >← {{ t('policies.ux.backResources') }}</UiButton
      >
      <header class="console-page-header task-detail-heading">
        <div>
          <h2>{{ presentationName || current.id }}</h2>
          <p>{{ kindLabel(current.kind) }} · {{ t('policies.revision') }} {{ current.revision }}</p>
        </div>
        <UiBadge>{{ kindLabel(current.kind) }}</UiBadge>
      </header>
      <UiTabs
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
            <fieldset :disabled="busy || uncertain">
              <legend>{{ t('policies.resourcePresentation') }}</legend>
              <label for="resource-display-name">{{ t('devices.name') }}</label
              ><input id="resource-display-name" v-model="presentationName" class="ui-input" />
              <label for="resource-description">{{ t('policies.selfService.description') }}</label
              ><textarea
                id="resource-description"
                v-model="presentationDescription"
                class="ui-input"
              />
              <UiButton type="submit">{{ t('devices.save') }}</UiButton>
            </fieldset>
          </form> </template
        ><template #versions>
          <div class="ui-table-scroll">
            <table class="ui-table">
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
                      ><UiButton
                        v-for="variant in item.variants"
                        :key="variant.key + variant.platform + variant.architecture"
                        :disabled="busy"
                        @click="downloadScript(item.id, variant)"
                        >{{ t('gap.script') }} · {{ variant.platform }} /
                        {{ variant.architecture }} / {{ variant.key }}</UiButton
                      ></template
                    >
                    <UiButton
                      v-for="action in (item.state === 'frozen'
                        ? ['activate', 'archive']
                        : item.state === 'active'
                          ? ['deprecate', 'archive']
                          : item.state === 'deprecated'
                            ? ['activate', 'archive']
                            : []) as ('activate' | 'deprecate' | 'archive')[]"
                      :key="action"
                      :disabled="!!(busy || uncertain)"
                      type="submit"
                      @click="change({ action, version: item.id })"
                    >
                      {{ t(`policies.${action}`) }}
                    </UiButton>
                    <RouterLink
                      v-if="
                        item.state === 'active' &&
                        ['native_collection', 'agent_collection', 'configuration'].includes(
                          current.kind,
                        )
                      "
                      :to="{
                        name: 'policy-policies',
                        params: { tenant: runtime.tenant },
                        query: { kind: current.kind, resource: current.id, version: item.id },
                      }"
                      >{{ t('policies.assignPackage') }}</RouterLink
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div> </template
        ><template #content>
          <details
            v-if="kind !== 'native_collection' && kind !== 'agent_collection'"
            class="console-panel console-task"
            :open="uncertain || undefined"
          >
            <summary>{{ t('policies.version') }}</summary>
            <form @submit.prevent="addVersion">
              <fieldset :disabled="busy || uncertain">
                <label for="resource-version">{{ t('policies.version') }}</label
                ><input id="resource-version" v-model="version" class="ui-input" required /><label
                  for="resource-platform"
                  >{{ t('policies.platform') }}</label
                ><select id="resource-platform" v-model="target.platform" class="ui-input">
                  <option value="windows">Windows</option>
                  <option value="macos">macOS</option></select
                ><label for="resource-architecture">{{ t('policies.architecture') }}</label
                ><select id="resource-architecture" v-model="target.architecture" class="ui-input">
                  <option value="x86_64">x86_64</option>
                  <option value="aarch64">aarch64</option></select
                ><label for="resource-variant">{{ t('policies.variant') }}</label
                ><input
                  id="resource-variant"
                  v-model="target.variant"
                  class="ui-input"
                  required
                /><label for="resource-metadata">{{ t('policies.metadata') }}</label
                ><input
                  id="resource-metadata"
                  class="ui-input"
                  type="file"
                  @change="metadata"
                /><label for="resource-reference">{{ t('policies.reference') }}</label
                ><input
                  id="resource-reference"
                  v-model="artifact.reference"
                  class="ui-input"
                  required
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
                  <UiButton type="button" data-action="stage-variant" @click="stageVariant">
                    {{ t('software.stageVariant') }}
                  </UiButton>
                  <p>{{ t('software.variantDraftHint') }}</p>
                  <ul>
                    <li
                      v-for="(v, index) in draftVariants"
                      :key="`${v.platform}/${v.architecture}/${v.key}`"
                    >
                      {{ v.platform }} / {{ v.architecture }} / {{ v.key }}
                      <UiButton type="button" @click="draftVariants.splice(index, 1)">
                        {{ t('software.removeVariant') }}
                      </UiButton>
                    </li>
                  </ul> </template
                ><UiButton
                  type="submit"
                  :disabled="!!(kind === 'software' ? !draftVariants.length : !artifact.length)"
                >
                  {{ t('policies.save') }}
                </UiButton>
              </fieldset>
            </form>
          </details>
          <section
            v-if="kind !== 'native_collection' && kind !== 'agent_collection'"
            class="console-panel"
          >
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
            <input
              id="resource-upload-id"
              v-model="uploadId"
              class="ui-input"
              :disabled="busy || !!uploadPending"
            />
            <UiButton
              data-action="read-upload"
              :disabled="!!(busy || !uploadId || (uncertain && !uploadPending))"
              type="submit"
              @click="readUpload"
            >
              {{ t('software.readUpload') }}
            </UiButton>
            <p>{{ t('policies.fileCleared') }}</p>
            <template v-if="kind === 'software'"
              ><label for="resource-artifact">{{ t('software.contentArtifact') }}</label
              ><input
                id="resource-artifact"
                v-model="contentArtifact"
                class="ui-input"
                :disabled="busy || uncertain"
            /></template>
            <label for="resource-upload">{{ t('policies.content') }}</label
            ><input
              id="resource-upload"
              ref="uploadInput"
              class="ui-input"
              type="file"
              :disabled="busy"
              @change="select"
            /><UiButton
              :disabled="!!(busy || !file || (uncertain && !uploadPending))"
              type="submit"
              @click="upload"
            >
              {{ t('policies.upload') }}
            </UiButton>
            <p v-if="uploadPending">
              {{ uploadPending.upload }} · {{ uploadPending.id }} /
              {{ uploadPending.target.version }} / {{ uploadPending.target.variant }} ·
              {{ uploadPending.length }} · {{ uploadPending.hash }}
            </p>
            <p v-if="uploadSession">
              {{ t('software.uploadProgress') }} {{ uploadSession.offset }} /
              {{ uploadSession.binding.length }}
            </p>
            <UiButton
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
            </UiButton>
            <UiButton
              v-if="uploadPending"
              data-action="verify-upload"
              :disabled="!!busy"
              type="submit"
              @click="verifyUpload"
            >
              {{ t('software.verifyUpload') }}
            </UiButton>
            <p v-if="uploadCommitted" role="status">{{ t('software.uploadCommitted') }}</p>
          </section></template
        ></UiTabs
      ></template
    >
    <UiButton
      v-if="uncertain && pending && !uploadPending"
      :disabled="!!busy"
      type="submit"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </UiButton>
  </PageFrame>
</template>
