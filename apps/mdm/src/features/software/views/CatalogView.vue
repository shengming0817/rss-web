<script setup lang="ts">
import { UiButton, UiTable, UiSearchInput } from '@rss/core/components'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import PageFrame from '../../../components/PageFrame.vue'
import { sha256 } from '@noble/hashes/sha2.js'
import VersionLifecycle from '../components/VersionLifecycle.vue'
const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n(),
  client = runtime.policies.resources,
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const query = ref(''),
  locked = ref(false),
  downloaded = ref('')
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  current = ref<Awaited<ReturnType<typeof client.read>>>(),
  id = ref(''),
  version = ref('')
const rows = computed(() =>
  (page.value?.items ?? []).filter((v) =>
    `${v.id} ${v.presentation['name'] ?? ''}`
      .toLocaleLowerCase()
      .includes(query.value.toLocaleLowerCase()),
  ),
)
const selectedVersion = computed(() => current.value?.versions.find((v) => v.id === version.value))
function title(p: Record<string, unknown>, id: string) {
  return typeof p['name'] === 'string' && p['name'] ? p['name'] : id
}
async function download(index: number, artifact?: string) {
  const r = current.value,
    v = selectedVersion.value,
    variant = v?.variants[index]
  if (!r || !v || !variant || variant.declaration.kind !== 'software') return
  const spec = variant.declaration.definition,
    selected = artifact ? spec.artifacts[artifact] : spec.artifacts[spec.material.installer]
  if (!selected) return
  downloaded.value = ''
  void run(
    async () => {
      const bytes = await runtime.software.content.read(r.id, {
        version: v.id,
        platform: variant.platform,
        architecture: variant.architecture,
        variant: variant.key,
        ...(artifact ? { artifact } : {}),
      })
      if (
        bytes.byteLength !== selected.length ||
        JSON.stringify([...sha256(new Uint8Array(bytes))]) !== JSON.stringify(selected.sha256)
      )
        throw new Error('Content digest mismatch')
      return bytes
    },
    (bytes) => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })),
        link = document.createElement('a')
      link.href = url
      link.download = `${r.id}-${v.id}-${variant.platform}-${variant.architecture}.bin`
      link.click()
      URL.revokeObjectURL(url)
      downloaded.value = `${r.id} / ${v.id} · ${variant.platform} / ${variant.architecture} / ${variant.key}`
    },
  )
}
function list(after?: string) {
  if (busy.value || locked.value) return
  void run(
    () => client.list('software', after),
    (v) => {
      page.value = v
    },
  )
}
function open(value = id.value) {
  if (busy.value || locked.value) return
  void run(
    () => client.read(value),
    (v) => {
      if (v.kind !== 'software') throw new Error('Wrong resource')
      current.value = v
      id.value = v.id
      version.value =
        typeof route.query['version'] === 'string' &&
        v.versions.some((x) => x.id === route.query['version'])
          ? route.query['version']
          : (v.versions[0]?.id ?? '')
    },
  )
}
watch(
  () => route.fullPath,
  () => {
    locked.value = false
    downloaded.value = ''
    current.value = undefined
    id.value = ''
    version.value = ''
    if (typeof route.query['resource'] === 'string') open(route.query['resource'])
    else list()
  },
  { immediate: true },
)
watch(
  () => deviceBinding(runtime),
  () => {
    current.value = undefined
    page.value = undefined
    locked.value = false
    downloaded.value = ''
    id.value = ''
    version.value = ''
  },
  { flush: 'sync' },
)
</script>
<template>
  <PageFrame :title="t('software.catalog')" :busy="busy" :failure="failure">
    <p v-if="failure === 'unsupported'" role="alert">
      {{ t('software.ux.contentPrerequisite') }}
      <RouterLink
        :to="{ name: 'settings-material', params: { tenant: runtime.tenant, material: 'storage' } }"
        >{{ t('settings.integrations') }}</RouterLink
      >
    </p>
    <template #actions>
      <RouterLink :to="{ name: 'software-imports', params: { tenant: runtime.tenant } }">{{
        t('software.imports')
      }}</RouterLink>
      <RouterLink
        :to="{
          name: 'settings-material',
          params: { tenant: runtime.tenant, material: 'packages' },
        }"
        >{{ t('software.ux.agentPackages') }}</RouterLink
      >
    </template>
    <template v-if="!current">
      <UiSearchInput v-model="query" :placeholder="t('software.ux.search')" />
      <UiButton :disabled="busy" @click="list()">{{ t('policies.reload') }}</UiButton>
      <p>{{ t('console.pageNotTotal') }}</p>
      <UiTable
        :columns="[
          { key: 'name', label: t('software.package') },
          { key: 'version', label: t('software.version') },
          { key: 'action', label: t('policies.open') },
        ]"
        :rows="
          rows.map((v) => ({
            ...v,
            name: title(v.presentation, v.id),
            version: v.activeVersion ?? '—',
          }))
        "
        :row-key="(v) => v.id"
        :label="t('software.catalog')"
        :busy-label="t('devices.loading')"
        :empty-label="t('policies.empty')"
      >
        <template #cell-name="{ row }"
          ><strong>{{ row.name }}</strong
          ><small>{{ row.id }}</small></template
        >
        <template #cell-action="{ row }"
          ><UiButton :disabled="busy" @click="open(String(row.id))">{{
            t('policies.open')
          }}</UiButton></template
        >
      </UiTable>
      <p v-if="page && !rows.length">{{ t('policies.empty') }}</p>
      <UiButton v-if="page?.nextCursor" :disabled="busy" @click="list(page.nextCursor)">{{
        t('devices.next')
      }}</UiButton>
      <details>
        <summary>{{ t('policies.ux.technical') }}</summary>
        <form @submit.prevent="open()">
          <label>{{ t('software.resource') }}<input v-model="id" class="ui-input" required /></label
          ><UiButton type="submit" :disabled="busy">{{ t('policies.open') }}</UiButton>
        </form>
      </details>
    </template>
    <section v-else class="console-panel">
      <UiButton
        :disabled="busy || locked"
        @click="
          current = undefined
          list()
        "
        >← {{ t('software.catalog') }}</UiButton
      >
      <h2>{{ title(current.presentation, current.id) }}</h2>
      <p data-testid="resource-locator">{{ current.id }} · {{ current.revision }}</p>
      <label
        >{{ t('software.version')
        }}<select v-model="version" class="ui-input" :disabled="busy || locked">
          <option v-for="v in current.versions" :key="v.id" :value="v.id">
            {{ v.id }} · {{ t(`policies.state.${v.state}`) }}
          </option>
        </select></label
      >
      <p>{{ t('software.ux.independentStages') }}</p>
      <section
        v-for="(variant, index) in selectedVersion?.variants"
        :key="`${variant.platform}/${variant.architecture}/${variant.key}`"
        class="console-panel"
      >
        <h3>{{ variant.platform }} · {{ variant.architecture }} · {{ variant.key }}</h3>
        <template v-if="variant.declaration.kind === 'software'">
          <p>
            {{ variant.declaration.definition.package }} /
            {{ variant.declaration.definition.version }}
          </p>
          <dl v-for="(artifact, name) in variant.declaration.definition.artifacts" :key="name">
            <dt>{{ name }} · {{ artifact.length }} {{ t('software.ux.bytes') }}</dt>
            <dd class="console-locator">
              {{ artifact.sha256.map((n) => n.toString(16).padStart(2, '0')).join('') }}
            </dd>
          </dl>
          <UiButton :disabled="busy || locked" @click="download(index)">{{
            t('software.ux.download')
          }}</UiButton>
        </template>
      </section>
      <p v-if="downloaded" role="status">
        {{ t('software.ux.downloadVerified') }} · {{ downloaded }}
      </p>
      <VersionLifecycle
        v-if="version"
        :key="`${current.id}/${version}`"
        :resource="current.id"
        :version="version"
        @locked="locked = $event"
      />
      <nav class="console-actions">
        <RouterLink
          :to="{
            name: 'policy-resources',
            params: { tenant: runtime.tenant },
            query: { resource: current.id, version, tab: 'content' },
          }"
          >{{ t('software.authorPackage') }}</RouterLink
        >
        <RouterLink
          :to="{
            name: 'software-deployments',
            params: { tenant: runtime.tenant },
            query: { resource: current.id, version },
          }"
          >{{ t('software.deliveryDirect') }}</RouterLink
        >
        <RouterLink
          :to="{
            name: 'software-publications',
            params: { tenant: runtime.tenant },
            query: { resource: current.id, version },
          }"
          >{{ t('software.deliveryNative') }}</RouterLink
        >
      </nav>
    </section>
  </PageFrame>
</template>
