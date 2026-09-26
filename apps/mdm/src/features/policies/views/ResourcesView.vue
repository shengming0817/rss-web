<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { MDM_CONTENT_BODY_LIMIT } from '@rss/api/mdm-limits'
import type {
  Artifact,
  Declaration,
  ResourceChange,
  ResourceKind,
  ResourceRead,
  ScriptSpec,
  UploadTarget,
} from '../clients/resources'
import PolicyFrame from '../components/PolicyFrame.vue'
import ScriptDefinitionEditor from '../components/ScriptDefinitionEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
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
  source = ref(''),
  packageId = ref(''),
  schema = ref(''),
  apply = ref(''),
  detect = ref(''),
  remove = ref('')
const spec = ref<ScriptSpec>({
  profile: 'power_shell7',
  runAs: 'system',
  encoding: 'utf8',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  bindings: {},
  output: { type: 'object', properties: {}, additionalProperties: false },
  purpose: { kind: 'action' },
  timeoutSeconds: 60,
  outputBytes: 16384,
  maxRows: 1,
})
const file = shallowRef<File>(),
  uploadInput = ref<HTMLInputElement>(),
  uploadPending = ref<{ id: string; target: UploadTarget; hash: string; length: number }>()
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
        uploadPending.value = undefined
        file.value = undefined
      },
    )
}
function create() {
  if (busy.value || uncertain.value) return
  id.value = `resource-${crypto.randomUUID()}`
  current.value = undefined
  uploadPending.value = undefined
  file.value = undefined
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
        },
      )
  }
  void pending()
}
async function metadata(event: Event) {
  const input = event.target as HTMLInputElement,
    selected = input.files?.[0]
  input.value = ''
  if (!selected) return
  await run(
    async () => {
      if (!selected.size || selected.size > MDM_CONTENT_BODY_LIMIT)
        throw new Error('Invalid content size')
      const bytes = await selected.arrayBuffer()
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    },
    (sha256) => (artifact.value = { ...artifact.value, length: selected.size, sha256 }),
  )
}
function addVersion() {
  const resourceKind = current.value?.kind ?? kind.value
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
  else if (resourceKind === 'software')
    declaration = {
      kind: resourceKind,
      artifact: a,
      source: source.value,
      package: packageId.value,
      version: version.value,
      install: apply.value,
      detect: detect.value,
      uninstall: remove.value || null,
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
function select(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0]
}
async function upload() {
  if (busy.value || !file.value || !current.value) return
  const selected = file.value
  file.value = undefined
  if (uploadInput.value) uploadInput.value.value = ''
  const original = uploadPending.value
  const resource = original?.id ?? current.value.id,
    destination = original?.target ?? { ...toRaw(target.value), version: version.value }
  let bytes: ArrayBuffer | undefined
  const prepared = await run(
    async () => {
      if (!selected.size || selected.size > MDM_CONTENT_BODY_LIMIT)
        throw new Error('Invalid content size')
      bytes = await selected.arrayBuffer()
      const hash = hashText([...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))])
      if (original && (hash !== original.hash || bytes.byteLength !== original.length))
        throw new Error('Different content')
      return { id: resource, target: destination, hash, length: bytes.byteLength }
    },
    (value) => (uploadPending.value = value),
  )
  if (!prepared || !bytes) return
  const content = bytes
  const acknowledged = await runWrite(() => client.upload(resource, destination, content))
  if (acknowledged || !uncertain.value) uploadPending.value = undefined
}
onBeforeUnmount(() => {
  file.value = undefined
  uploadPending.value = undefined
})
onMounted(() => load())
</script>
<template>
  <PolicyFrame :title="t('policies.resources')" :busy="busy" :failure="failure">
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button
    ><button :disabled="busy" @click="load()">{{ t('policies.reload') }}</button>
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
        <option value="software">Software</option>
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
            <td>{{ item.state }}</td>
            <td>
              <button
                v-for="action in ['activate', 'deprecate', 'archive'] as const"
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
            <ScriptDefinitionEditor v-if="kind === 'script'" v-model="spec" /><template v-else
              ><template v-if="kind === 'software'"
                ><label for="resource-source">{{ t('policies.sourceId') }}</label
                ><input id="resource-source" v-model="source" required /><label
                  for="resource-package"
                  >{{ t('policies.packageId') }}</label
                ><input id="resource-package" v-model="packageId" required /></template
              ><template v-else
                ><label for="resource-schema">{{ t('policies.schema') }}</label
                ><input id="resource-schema" v-model="schema" required /></template
              ><label for="resource-apply">{{ t('policies.apply') }}</label
              ><input id="resource-apply" v-model="apply" required /><label for="resource-detect">{{
                t('policies.detect')
              }}</label
              ><input id="resource-detect" v-model="detect" required /><label
                for="resource-remove"
                >{{ t('policies.uninstall') }}</label
              ><input id="resource-remove" v-model="remove" /></template></template
          ><button type="submit" :disabled="!firewall && !artifact.length">
            {{ t('policies.save') }}
          </button>
        </fieldset>
      </form>
      <section>
        <p>{{ t('policies.fileCleared') }}</p>
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
          {{ uploadPending.id }} / {{ uploadPending.target.version }} /
          {{ uploadPending.target.variant }} · {{ uploadPending.length }} · {{ uploadPending.hash }}
        </p>
      </section></template
    >
    <button v-if="uncertain && pending && !uploadPending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button>
  </PolicyFrame>
</template>
