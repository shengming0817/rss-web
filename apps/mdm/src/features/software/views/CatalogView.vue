<script setup lang="ts">
import { VBtn, VDataTable, VSelect, VTextField } from 'vuetify/components'
import { comparison as queryComparison } from '../../../services/directory-query'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
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
      .includes((query.value ?? '').toLocaleLowerCase()),
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
      const extension = ['msi', 'pkg', 'exe', 'dmg', 'msix'].includes(spec.material.format)
        ? spec.material.format
        : 'bin'
      link.download = `${r.id}-${v.id}-${variant.platform}-${variant.architecture}.${extension}`
      link.click()
      URL.revokeObjectURL(url)
      downloaded.value = `${r.id} / ${v.id} · ${variant.platform} / ${variant.architecture} / ${variant.key}`
    },
  )
}
function close() {
  if (busy.value || locked.value) return
  current.value = undefined
  list()
}
function list(after?: string) {
  if (busy.value || locked.value) return
  void run(
    () => client.list({ filter: queryComparison('kind', '==', 'software'), cursor: after }),
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
  <MdmPage
    :title="t('software.catalog')"
    :description="t('software.catalogHint')"
    :busy="busy"
    :failure="failure"
  >
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
      <VTextField
        v-model="query"
        :label="t('software.ux.search')"
        clearable
        :placeholder="t('software.ux.search')"
        @click:clear="query = ''"
      />
      <VBtn :disabled="busy" @click="list()">{{ t('policies.reload') }}</VBtn>
      <p>{{ t('console.pageNotTotal') }}</p>
      <VDataTable
        :headers="[
          { key: 'name', title: t('software.package') },
          { key: 'version', title: t('software.version') },
          { key: 'action', title: t('policies.open') },
        ]"
        :items="
          rows.map((v) => ({
            ...v,
            name: title(v.presentation, v.id),
            version: v.activeVersion ?? '—',
          }))
        "
        item-value="id"
        :items-per-page="-1"
        hide-default-footer
        :loading="busy"
        :aria-label="t('software.catalog')"
        :loading-text="t('devices.loading')"
        :no-data-text="t('policies.empty')"
      >
        <template #[`item.name`]="{ item }"
          ><strong>{{ item.name }}</strong
          ><small>{{ item.id }}</small></template
        >
        <template #[`item.action`]="{ item }"
          ><VBtn :disabled="busy" @click="open(String(item.id))">{{
            t('policies.open')
          }}</VBtn></template
        >
      </VDataTable>
      <p v-if="page && !rows.length">{{ t('policies.empty') }}</p>
      <VBtn v-if="page?.nextCursor" :disabled="busy" @click="list(page.nextCursor)">{{
        t('devices.next')
      }}</VBtn>
      <details>
        <summary>{{ t('policies.ux.technical') }}</summary>
        <form @submit.prevent="open()">
          <VTextField v-model="id" :label="t('software.resource')" required /><VBtn
            type="submit"
            :disabled="busy"
            >{{ t('policies.open') }}</VBtn
          >
        </form>
      </details>
    </template>
    <section v-else class="console-panel">
      <VBtn :disabled="busy || locked" @click="close">← {{ t('software.catalog') }}</VBtn>
      <h2>{{ title(current.presentation, current.id) }}</h2>
      <p v-if="typeof current.presentation['description'] === 'string'">
        {{ current.presentation['description'] }}
      </p>
      <p v-if="typeof current.presentation['publisher'] === 'string'">
        {{ current.presentation['publisher'] }}
      </p>
      <p data-testid="resource-locator">{{ current.id }} · {{ current.revision }}</p>
      <VSelect
        v-model="version"
        :label="t('software.version')"
        :items="
          current.versions.map((v) => ({
            title: `${v.id} · ${t(`policies.state.${v.state}`)}`,
            value: v.id,
          }))
        "
        :disabled="busy || locked"
      />
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
          <p
            v-for="signature in variant.declaration.definition.signatures"
            :key="`${signature.artifact}/${signature.mechanism}/${signature.publisher}`"
          >
            {{ signature.publisher }} · {{ signature.mechanism }} · {{ signature.artifact }}
          </p>
          <dl v-for="(artifact, name) in variant.declaration.definition.artifacts" :key="name">
            <dt>{{ name }} · {{ artifact.length }} {{ t('software.ux.bytes') }}</dt>
            <dd class="console-locator">
              {{ artifact.sha256.map((n) => n.toString(16).padStart(2, '0')).join('') }}
            </dd>
          </dl>
          <VBtn :disabled="busy || locked" @click="download(index)">{{
            t('software.ux.download')
          }}</VBtn>
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
      <nav class="console-inline-actions">
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
            name: 'policy-policies',
            params: { tenant: runtime.tenant },
            query: { resource: current.id, version, action: 'software' },
          }"
          >{{ t('software.assignPolicy') }}</RouterLink
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
  </MdmPage>
</template>
