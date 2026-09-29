<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { fileHash, FILE_CHUNK_BYTES } from '../services/file-hash'
import type { UploadSession } from '../clients/uploads'
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
import PolicyFrame from '../components/PolicyFrame.vue'
import ScriptDefinitionEditor from '../components/ScriptDefinitionEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.policies.resources,
  { run, runWrite, busy, failure, uncertain } = useOperation()
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
const list = ref<Awaited<ReturnType<typeof runtime.policies.catalog.list>>>(),
  artifact = ref<Artifact>({ reference: 'content', length: 0, sha256: Array(32).fill(0) })
const firewall = ref(false),
  enabled = ref(true),
  schema = ref(''),
  apply = ref(''),
  detect = ref(''),
  remove = ref('')
const spec = ref<ScriptSpec>({
  profile: 'power_shell7',
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
  void run(
    () => runtime.policies.catalog.list('resources', cursor),
    (v) => (list.value = v),
  )
}
function open(value = id.value) {
  if (!busy.value && !uncertain.value)
    void run(
      () => client.read(value),
      (v) => {
        current.value = v
        id.value = v.id
        kind.value = v.kind
        resetDraft()
      },
    )
}
function create() {
  if (busy.value || uncertain.value) return
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
  if (firewall.value && resourceKind === 'configuration') {
    change({ action: 'firewall_version', version: version.value, enabled: enabled.value })
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
      schema: schema.value,
      apply: apply.value,
      detect: detect.value,
      remove: remove.value || null,
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
  const b = value.binding
  uploadPending.value = {
    id: b.resource,
    upload: value.id,
    target: {
      version: b.version,
      variant: b.variant,
      platform: b.platform,
      architecture: b.architecture,
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
    kind.value = route.query['kind'] === 'software' ? 'software' : 'script'
    if (typeof route.query['resource'] === 'string') open(route.query['resource'])
    else {
      if (route.query['kind'] === 'software') kind.value = 'software'
      load()
    }
  },
  { immediate: true },
)
</script>
<template>
  <PolicyFrame :title="t('policies.resources')" :busy="busy" :failure="failure">
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button
    ><button :disabled="busy" @click="load()">{{ t('policies.reload') }}</button>
    <p v-if="list && !list.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="item in list?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">{{ item.label }}</button>
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <fieldset :disabled="busy || uncertain">
      <label for="resource-id">{{ t('policies.id') }}</label
      ><input id="resource-id" v-model="id" :readonly="!!current" required /><button
        @click="open()"
      >
        {{ t('policies.open') }}</button
      ><label for="resource-kind">{{ t('policies.kind') }}</label
      ><select id="resource-kind" v-model="kind" :disabled="!!current">
        <option value="script">{{ t('policies.scripts') }}</option>
        <option value="software">{{ t('policies.software') }}</option>
        <option value="configuration">{{ t('policies.configurations') }}</option></select
      ><button v-if="!current" :disabled="!id" @click="change({ action: 'create', kind })">
        {{ t('policies.save') }}
      </button>
    </fieldset>
    <template v-if="current"
      ><p>{{ t('policies.revision') }} {{ current.revision }}</p>
      <table>
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
              <button
                v-for="action in (item.state === 'frozen'
                  ? ['activate', 'archive']
                  : item.state === 'active'
                    ? ['deprecate', 'archive']
                    : item.state === 'deprecated'
                      ? ['activate', 'archive']
                      : []) as ('activate' | 'deprecate' | 'archive')[]"
                :key="action"
                :disabled="busy || uncertain"
                @click="change({ action, version: item.id })"
              >
                {{ t(`policies.${action}`) }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <form @submit.prevent="addVersion">
        <fieldset :disabled="busy || uncertain">
          <label for="resource-version">{{ t('policies.version') }}</label
          ><input id="resource-version" v-model="version" required /><template
            v-if="kind === 'configuration'"
            ><label><input v-model="firewall" type="checkbox" />{{ t('policies.firewall') }}</label
            ><label v-if="firewall"
              ><input v-model="enabled" type="checkbox" />{{ t('policies.enabled') }}</label
            ></template
          ><template v-if="!firewall || kind !== 'configuration'"
            ><label for="resource-platform">{{ t('policies.platform') }}</label
            ><select id="resource-platform" v-model="target.platform">
              <option value="windows">Windows</option>
              <option value="macos">macOS</option></select
            ><label for="resource-architecture">{{ t('policies.architecture') }}</label
            ><select id="resource-architecture" v-model="target.architecture">
              <option value="x86_64">x86_64</option>
              <option value="aarch64">aarch64</option></select
            ><label for="resource-variant">{{ t('policies.variant') }}</label
            ><input id="resource-variant" v-model="target.variant" required /><label
              for="resource-metadata"
              >{{ t('policies.metadata') }}</label
            ><input id="resource-metadata" type="file" @change="metadata" /><label
              for="resource-reference"
              >{{ t('policies.reference') }}</label
            ><input id="resource-reference" v-model="artifact.reference" required />
            <p>
              {{ t('policies.length') }} {{ artifact.length }} · {{ t('policies.hash') }}
              {{ hashText(artifact.sha256) }}
            </p>
            <ScriptDefinitionEditor
              v-if="kind === 'script'"
              v-model="spec" /><SoftwareDefinitionEditor
              v-else-if="kind === 'software'"
              :key="editorEpoch"
              ref="softwareEditor" /><template v-else
              ><label for="resource-schema">{{ t('policies.schema') }}</label
              ><input id="resource-schema" v-model="schema" required /><label
                for="resource-apply"
                >{{ t('policies.apply') }}</label
              ><input id="resource-apply" v-model="apply" required /><label for="resource-detect">{{
                t('policies.detect')
              }}</label
              ><input id="resource-detect" v-model="detect" required /><label
                for="resource-remove"
                >{{ t('policies.uninstall') }}</label
              ><input id="resource-remove" v-model="remove" /></template></template
          ><template v-if="kind === 'software'">
            <button type="button" data-action="stage-variant" @click="stageVariant">
              {{ t('software.stageVariant') }}
            </button>
            <p>{{ t('software.variantDraftHint') }}</p>
            <ul>
              <li
                v-for="(v, index) in draftVariants"
                :key="`${v.platform}/${v.architecture}/${v.key}`"
              >
                {{ v.platform }} / {{ v.architecture }} / {{ v.key }}
                <button type="button" @click="draftVariants.splice(index, 1)">
                  {{ t('software.removeVariant') }}
                </button>
              </li>
            </ul> </template
          ><button
            type="submit"
            :disabled="kind === 'software' ? !draftVariants.length : !firewall && !artifact.length"
          >
            {{ t('policies.save') }}
          </button>
        </fieldset>
      </form>
      <section>
        <p>{{ t('software.uploadSessionHint') }}</p>
        <label for="resource-upload-id">{{ t('software.uploadSessionId') }}</label>
        <input id="resource-upload-id" v-model="uploadId" :disabled="busy || !!uploadPending" />
        <button
          data-action="read-upload"
          :disabled="busy || !uploadId || (uncertain && !uploadPending)"
          @click="readUpload"
        >
          {{ t('software.readUpload') }}
        </button>
        <p>{{ t('policies.fileCleared') }}</p>
        <template v-if="kind === 'software'"
          ><label for="resource-artifact">{{ t('software.contentArtifact') }}</label
          ><input id="resource-artifact" v-model="contentArtifact" :disabled="busy || uncertain"
        /></template>
        <label for="resource-upload">{{ t('policies.content') }}</label
        ><input
          id="resource-upload"
          ref="uploadInput"
          type="file"
          :disabled="busy"
          @change="select"
        /><button :disabled="busy || !file || (uncertain && !uploadPending)" @click="upload">
          {{ t('policies.upload') }}
        </button>
        <p v-if="uploadPending">
          {{ uploadPending.upload }} · {{ uploadPending.id }} / {{ uploadPending.target.version }} /
          {{ uploadPending.target.variant }} · {{ uploadPending.length }} · {{ uploadPending.hash }}
        </p>
        <p v-if="uploadSession">
          {{ t('software.uploadProgress') }} {{ uploadSession.offset }} /
          {{ uploadSession.binding.length }}
        </p>
        <button
          v-if="
            uploadPending &&
            uploadSession?.id === uploadPending.upload &&
            uploadSession.offset === uploadPending.length
          "
          data-action="complete-upload"
          :disabled="busy"
          @click="completeUpload"
        >
          {{ t('software.completeUpload') }}
        </button>
        <button
          v-if="uploadPending"
          data-action="verify-upload"
          :disabled="busy"
          @click="verifyUpload"
        >
          {{ t('software.verifyUpload') }}
        </button>
        <p v-if="uploadCommitted" role="status">{{ t('software.uploadCommitted') }}</p>
      </section></template
    >
    <button v-if="uncertain && pending && !uploadPending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button>
  </PolicyFrame>
</template>
