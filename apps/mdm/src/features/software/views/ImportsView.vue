<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import type { ImportChange, ImportJob, ImportQuery, ImportResolution } from '../clients/imports'
import PageFrame from '../../../components/PageFrame.vue'
const creating = ref(false)
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.imports
const { run, runWrite, busy, uncertain, failure } = useOperation()
const query = ref<ImportQuery>({
  source: '',
  revision: '1',
  package: '',
  version: '',
  platform: 'windows',
  architecture: 'x86_64',
})
const resource = ref(''),
  version = ref('1'),
  resourceRevision = ref(0),
  resolution = ref<ImportResolution>(),
  current = ref<ImportJob>()
const page = ref<Awaited<ReturnType<typeof client.list>>>()
let pending: { id: string; body: Operation<ImportChange> } | undefined
watch(
  query,
  () => {
    resolution.value = undefined
  },
  { deep: true, flush: 'sync' },
)
function list(cursor?: string) {
  void run(
    () => client.list(cursor),
    (v) => {
      page.value = v
    },
  )
}
function resolve() {
  void run(
    () => client.resolve({ ...toRaw(query.value) }),
    (v) => {
      resolution.value = v
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  creating.value = true
  current.value = undefined
  resolution.value = undefined
  pending = undefined
}
function read(id = uncertain.value ? pending?.id : current.value?.id) {
  if (!id || (uncertain.value && id !== pending?.id)) return
  void run(
    () => client.read(id),
    (v) => {
      creating.value = false
      current.value = v
      if (pending && v.operation === pending.body.operationId) uncertain.value = false
    },
  )
}
function replay() {
  const p = pending
  if (!p) return
  void runWrite(
    () => client.change(p.id, p.body),
    (v) => {
      creating.value = false
      current.value = v
      page.value = undefined
    },
  )
}
function change(input: ImportChange) {
  if (busy.value || uncertain.value) return
  pending = {
    id: current.value?.id ?? crypto.randomUUID(),
    body: operation(input, current.value?.revision ?? 0),
  }
  replay()
}
function start() {
  if (!resolution.value) return
  change({
    action: 'start',
    resolution: resolution.value.id,
    resource: resource.value,
    version: version.value,
    expectedResourceRevision: resourceRevision.value,
  })
}
onMounted(() => list())
</script>
<template>
  <PageFrame :title="t('software.imports')" :busy="busy" :failure="failure">
    <p>{{ t('software.importHint') }}</p>
    <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="create">{{
      t('policies.create')
    }}</UiButton>
    <UiButton :disabled="!!busy" type="submit" @click="list()">{{ t('policies.reload') }}</UiButton>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <ul class="console-object-list">
      <li v-for="job in page?.items" :key="job.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="read(job.id)">
          {{ job.resolution.package }} / {{ job.resolution.version }} ·
          {{ t(`software.import_${job.status}`) }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="list(page.nextCursor)"
    >
      {{ t('policies.next') }}
    </UiButton>
    <template v-if="!current && creating">
      <section class="console-panel">
        <h2>{{ t('software.resolve') }}</h2>
        <form data-form="resolve" @submit.prevent="resolve">
          <fieldset :disabled="busy || uncertain">
            <label for="import-source">{{ t('software.source') }}</label
            ><input id="import-source" v-model="query.source" class="ui-input" required />
            <label for="import-source-revision">{{ t('software.sourceRevision') }}</label
            ><input
              id="import-source-revision"
              v-model="query.revision"
              class="ui-input"
              required
            />
            <label for="import-package">{{ t('software.package') }}</label
            ><input id="import-package" v-model="query.package" class="ui-input" required />
            <label for="import-version">{{ t('software.version') }}</label
            ><input id="import-version" v-model="query.version" class="ui-input" required />
            <label for="import-platform">{{ t('policies.platform') }}</label
            ><select id="import-platform" v-model="query.platform" class="ui-input">
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
            </select>
            <label for="import-architecture">{{ t('policies.architecture') }}</label
            ><select id="import-architecture" v-model="query.architecture" class="ui-input">
              <option value="x86_64">x86_64</option>
              <option value="aarch64">aarch64</option>
            </select>
            <UiButton type="submit">{{ t('software.resolveImport') }}</UiButton>
          </fieldset>
        </form>
      </section>
      <section v-if="resolution" class="console-panel">
        <h2>{{ t('console.review') }}</h2>
        <form data-form="start" @submit.prevent="start">
          <fieldset :disabled="busy || uncertain">
            <p>
              {{ resolution.ecosystem }} · {{ resolution.package }} / {{ resolution.version }} ·
              {{ resolution.platform }} / {{ resolution.architecture }}
            </p>
            <p>{{ t('software.resolutionExpiry') }} {{ resolution.expiresAt }}</p>
            <details>
              <summary>{{ t('software.contentDigest') }}</summary>
              <p class="console-wrap">{{ resolution.definitionDigest.join(',') }}</p>
            </details>
            <label for="import-resource">{{ t('software.targetResource') }}</label
            ><input id="import-resource" v-model="resource" class="ui-input" required />
            <label for="import-resource-version">{{ t('software.resourceVersion') }}</label
            ><input id="import-resource-version" v-model="version" class="ui-input" required />
            <label for="import-resource-revision">{{ t('software.importResourceRevision') }}</label
            ><input
              id="import-resource-revision"
              v-model.number="resourceRevision"
              class="ui-input"
              type="number"
              min="0"
              required
            />
            <UiButton type="submit">{{ t('software.startImport') }}</UiButton>
          </fieldset>
        </form>
      </section>
    </template>
    <section v-if="current" class="console-panel">
      <h2>{{ current.resolution.package }} / {{ current.resolution.version }}</h2>
      <p>
        {{ t(`software.import_${current.status}`) }} · {{ t('policies.revision') }}
        {{ current.revision }}
      </p>
      <p v-if="current.failure" role="status">
        {{ t(`software.importFailure_${current.failure}`) }}
      </p>
      <dl>
        <dt>{{ t('software.source') }}</dt>
        <dd>{{ current.resolution.source.id }} / {{ current.resolution.source.revision }}</dd>
        <dt>{{ t('software.targetResource') }}</dt>
        <dd>{{ current.resource }} / {{ current.version }}</dd>
        <dt>{{ t('software.importOperation') }}</dt>
        <dd>{{ current.id }}</dd>
      </dl>
      <UiButton
        v-if="current.status === 'pending'"
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change({ action: 'cancel' })"
      >
        {{ t('software.cancelImport') }}
      </UiButton>
      <UiButton
        v-if="current.status === 'unknown'"
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change({ action: 'reconcile' })"
      >
        {{ t('software.reconcileImport') }}
      </UiButton>
      <RouterLink
        v-if="current.status === 'completed'"
        :to="{
          name: 'software-catalog',
          params: { tenant: runtime.tenant },
          query: { resource: current.resource },
        }"
        >{{ t('software.versionAdmission') }}</RouterLink
      >
    </section>
    <UiButton
      v-if="current || uncertain"
      data-action="read-import"
      :disabled="!!busy"
      type="submit"
      @click="read()"
    >
      {{ t('software.reconcile') }}
    </UiButton>
    <UiButton v-if="uncertain" :disabled="!!busy" type="submit" @click="replay">{{
      t('policies.replay')
    }}</UiButton>
  </PageFrame>
</template>
