<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import { VBtn, VCheckbox, VDataTable, VSelect } from 'vuetify/components'
import { comparison } from '@rss/api/mdm-query'
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import type { Publication, PublicationChange, Publish } from '../clients/publication'
import { deviceBinding } from '../../devices/useDeviceBinding'
import SoftwareResourceSelect from '../components/SoftwareResourceSelect.vue'
import MdmPage from '../../../ui/MdmPage.vue'
const targetQuery = useDirectoryQuery(['id', 'protocol', 'digest'], 100)

const directoryQuery = useDirectoryQuery(
  [
    'id',
    'target',
    'resource',
    'version',
    'revision',
    'publication',
    'contentDigest',
    'manifestDigest',
    'targetDigest',
    'attempt',
    'outcome',
    'withdrawn',
    'withdrawal',
  ],
  100,
)

const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.software.publication,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const target = ref(''),
  resource = ref(typeof route.query['resource'] === 'string' ? route.query['resource'] : ''),
  version = ref(typeof route.query['version'] === 'string' ? route.query['version'] : ''),
  current = ref<Publication>(),
  page = ref<Awaited<ReturnType<typeof client.list>>>(),
  targets = ref<Awaited<ReturnType<typeof client.targets>>>(),
  confirmedReplay = ref(false)
let pending: { id: string; body: Operation<PublicationChange> } | undefined
function load(after?: string) {
  page.value = undefined
  void run(
    () => directoryQuery.read(after, (query) => client.list(query), {}),
    (v) => {
      page.value = v
    },
  )
}
async function chooseTarget(row: Record<string, unknown>) {
  if (typeof row['id'] !== 'string' || busy.value || uncertain.value) return
  const id = row['id']
  await run(
    () => client.targets({ filter: comparison('id', '==', id), limit: 1 }),
    (value) => {
      targets.value = value
      target.value = id
    },
  )
}
function loadTargets(after?: string) {
  targets.value = undefined
  void run(
    () => targetQuery.read(after, (query) => client.targets(query)),
    (v) => {
      targets.value = v
    },
  )
}
function open(id: string) {
  void run(
    () => client.read(id),
    (v) => {
      current.value = v
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  pending = undefined
  confirmedReplay.value = false
}
async function save() {
  if (busy.value || uncertain.value) return
  const selected = targets.value?.items.find((v) => v.id === target.value)
  if (!selected) {
    failure.value = 'invalidRequest'
    return
  }
  const binding = JSON.stringify(deviceBinding(runtime))
  const r = resource.value,
    v = version.value,
    selectedTarget = { id: selected.id, digest: [...selected.digest] }
  let input: Publish | undefined
  const loaded = await run(
    async () => {
      const [header, version] = await Promise.all([
        runtime.policies.resources.read(r),
        runtime.software.lifecycle.version(r, v),
      ])
      if (header.kind !== 'software') throw new Error('Wrong resource')
      return {
        action: 'publish' as const,
        resource: r,
        version: v,
        expectedResourceRevision: header.revision,
        resourceDigest: version.resourceDigest,
        target: selectedTarget.id,
        targetDigest: selectedTarget.digest,
      }
    },
    (v) => {
      input = v
    },
  )
  if (!loaded || !input || binding !== JSON.stringify(deviceBinding(runtime))) return
  const body = operation(input)
  pending = { id: body.operationId, body }
  confirmedReplay.value = false
  void runWrite(
    () => client.publish(body),
    (v) => {
      current.value = v
      pending = undefined
    },
  )
}
function change(action: 'recover' | 'retry' | 'withdraw') {
  if (busy.value || uncertain.value || !current.value) return
  const id = current.value.id,
    body = operation({ action }, current.value.revision)
  pending = { id, body }
  confirmedReplay.value = false
  void runWrite(
    () => client.change(id, body),
    (v) => {
      current.value = v
      pending = undefined
    },
  )
}
function reconcile() {
  if (!pending) {
    if (current.value) open(current.value.id)
    return
  }
  const original = pending
  void run(
    async () => {
      const result = await client.list({
        filter: comparison('operationId', '==', original.body.operationId),
      })
      const found = result.items.find((v) => v.id === original.id)
      return found ? client.read(found.id) : undefined
    },
    (v) => {
      if (v) current.value = v
    },
  )
}
function replay() {
  if (busy.value || !confirmedReplay.value || !pending) return
  const original = pending,
    input = original.body.input
  confirmedReplay.value = false
  void runWrite(
    () =>
      input.action === 'publish'
        ? client.publish({ ...original.body, input })
        : client.change(original.id, { ...original.body, input }),
    (v) => {
      current.value = v
      pending = undefined
    },
  )
}
watch(
  () => deviceBinding(runtime),
  () => {
    current.value = undefined
    page.value = undefined
    targets.value = undefined
    pending = undefined
    confirmedReplay.value = false
    target.value = ''
    resource.value = ''
    version.value = ''
  },
  { flush: 'sync' },
)
onMounted(() => load())
directoryQuery.onClear(() => {
  page.value = undefined
})
targetQuery.onClear(() => {
  targets.value = undefined
})
</script>
<template>
  <MdmPage :title="t('software.publications')" :busy="busy" :failure="failure">
    <DirectoryControls :query="targetQuery" :busy="busy" hint="id / protocol" @load="loadTargets" />
    <DirectoryResults
      :disabled="busy || uncertain"
      v-if="!targetQuery.complete.value"
      :items="targets?.items ?? []"
      @open="
        (row) => {
          chooseTarget(row)
        }
      "
    />

    <DirectoryControls
      :query="directoryQuery"
      :busy="busy"
      hint="筛选和排序：id / target / resource / version；operationId 支持筛选。"
      @load="load"
    />
    <DirectoryResults
      :disabled="busy || uncertain"
      v-if="!directoryQuery.complete.value"
      :items="page?.items ?? []"
      @open="
        (row) => {
          open(String(row.id))
        }
      "
    />

    <p>{{ t('software.directPublicationHint') }}</p>
    <VBtn :disabled="busy || uncertain" @click="create">{{ t('software.newPublication') }}</VBtn>
    <VBtn :disabled="busy || uncertain" @click="load()">{{
      t('software.publicationRecords')
    }}</VBtn>
    <section v-if="page" class="console-panel">
      <p v-if="!page.items.length">{{ t('policies.empty') }}</p>
      <VDataTable
        v-if="directoryQuery.complete.value"
        :aria-label="t('software.publicationRecords')"
        :items="page.items"
        item-value="id"
        :items-per-page="-1"
        hide-default-footer
        :loading="busy"
        :loading-text="t('devices.loading')"
        :no-data-text="t('policies.empty')"
        :headers="[
          { key: 'resource', title: t('software.resource') },
          { key: 'version', title: t('software.version') },
          { key: 'target', title: t('software.binding') },
          { key: 'outcome', title: t('policies.status') },
        ]"
      >
        <template #[`item.resource`]="{ item }"
          ><VBtn variant="text" :disabled="busy || uncertain" @click="open(item.id)"
            >{{ item.resource }} / {{ item.version }}</VBtn
          ></template
        >
        <template #[`item.outcome`]="{ item }"
          >{{ t(`software.publication_${item.outcome}`)
          }}<span v-if="item.withdrawn"> · {{ t('software.lifecycle_withdrawn') }}</span></template
        >
      </VDataTable>
    </section>
    <form v-if="!current" data-testid="publication-create" @submit.prevent="save">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('software.newPublication') }}</legend>
        <SoftwareResourceSelect
          v-model:resource="resource"
          v-model:version="version"
          :disabled="busy || uncertain"
        />
        <VBtn type="button" @click="loadTargets()">{{ t('software.loadTargets') }}</VBtn>
        <VSelect
          id="publication-target"
          v-model="target"
          :label="t('software.binding')"
          :items="
            (targets?.items ?? []).map((item) => ({
              title: `${item.id} · ${item.protocol}`,
              value: item.id,
            }))
          "
          required
          :disabled="busy || uncertain"
        />
        <p v-if="targets && !targets.items.length">{{ t('software.noTargets') }}</p>

        <VBtn type="submit" :disabled="!resource || !version || !target">{{
          t('software.publish')
        }}</VBtn>
      </fieldset>
    </form>
    <section v-if="current" class="console-panel" data-testid="publication-detail">
      <h2>{{ current.resource }} / {{ current.version }}</h2>
      <p>{{ current.target }} · {{ t(`software.publication_${current.outcome}`) }}</p>
      <p>{{ current.id }} · {{ t('software.publicationAttempt') }} {{ current.attempt }}</p>
      <p v-if="current.withdrawn">
        {{ t('software.lifecycle_withdrawn') }} ·
        {{ current.withdrawal ? t(`software.withdrawal_${current.withdrawal}`) : '' }}
      </p>
      <VBtn :disabled="busy" @click="reconcile">{{ t('software.reconcile') }}</VBtn>
      <VBtn
        v-if="
          ['pending', 'unknown'].includes(current.outcome) ||
          (current.withdrawal &&
            current.withdrawal !== 'withdrawn' &&
            current.withdrawal !== 'not_published')
        "
        :disabled="busy || uncertain"
        @click="change('recover')"
        >{{ t('software.recoverPublication') }}</VBtn
      >
      <VBtn
        v-if="current.outcome === 'not_applied' && !current.withdrawn"
        :disabled="busy || uncertain"
        @click="change('retry')"
        >{{ t('software.retry') }}</VBtn
      >
      <VBtn v-if="!current.withdrawn" :disabled="busy || uncertain" @click="change('withdraw')">{{
        t('software.withdraw')
      }}</VBtn>
      <p>{{ t('software.withdrawHint') }}</p>
      <MdmDisclosure v-if="current.document">
        <template #title>{{ t('software.document') }}</template>
        <pre>{{ JSON.stringify(current.document, null, 2) }}</pre>
      </MdmDisclosure>
    </section>
    <section v-if="uncertain && pending" class="console-panel" data-testid="publication-unknown">
      <p>{{ t('software.publicationUnknown') }}</p>
      <p>{{ pending.body.operationId }}</p>
      <VBtn :disabled="busy" @click="reconcile">{{ t('software.lookupOperation') }}</VBtn>
      <VCheckbox v-model="confirmedReplay" :disabled="busy" :label="t('policies.confirmReplay')" />
      <VBtn :disabled="busy || !confirmedReplay" @click="replay">{{ t('policies.replay') }}</VBtn>
    </section>
  </MdmPage>
</template>
