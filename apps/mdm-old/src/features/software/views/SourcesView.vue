<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import {
  VBtn,
  VCard,
  VCardText,
  VCardTitle,
  VChip,
  VDataTable,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanels,
  VSelect,
  VTextField,
} from 'vuetify/components'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { sourceDefinition, type SourceChange } from '../clients/lifecycle'
import { deviceBinding } from '../../devices/useDeviceBinding'
import MdmPage from '../../../ui/MdmPage.vue'
const directoryQuery = useDirectoryQuery(
  ['id', 'revision', 'protocol', 'state', 'source', 'snapshot', 'lifecycle'],
  100,
)

const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.lifecycle,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const id = ref(''),
  revision = ref('1'),
  kind = ref<'private' | 'winget_rest' | 'winget_community' | 'brew_tap'>('private'),
  location = ref(''),
  repository = ref(''),
  commit = ref(''),
  tap = ref(''),
  identifier = ref(''),
  current = ref<Awaited<ReturnType<typeof client.source>>>()
let pending: { id: string; revision: string; operationId: string } | undefined
const page = ref<Awaited<ReturnType<typeof client.sources>>>()
function list(after?: string) {
  page.value = undefined
  void run(
    () => directoryQuery.read(after, (query) => client.sources(query), {}),
    (v) => {
      page.value = v
    },
  )
}
function openProjected(row: Record<string, unknown>) {
  const source = (row['source'] ?? row) as { id?: string; revision?: string } | undefined
  if (!source?.id || !source.revision) return
  id.value = source.id
  revision.value = source.revision
  read()
}
function choose(value: NonNullable<typeof page.value>['items'][number]) {
  id.value = value.source.id
  revision.value = value.source.revision
  read()
}
onMounted(() => list())

function read() {
  const target = uncertain.value && pending ? pending : { id: id.value, revision: revision.value }
  void run(
    () => client.source(target.id, target.revision),
    (v) => {
      current.value = v
      id.value = target.id
      revision.value = target.revision
      if (v.lifecycle.operation === pending?.operationId) {
        uncertain.value = false
        pending = undefined
      }
    },
  )
}
function change(input: SourceChange) {
  if (busy.value || uncertain.value) return
  const target =
    input.action === 'register'
      ? { id: input.definition.id, revision: input.definition.revision }
      : current.value
        ? { id: current.value.source.id, revision: current.value.source.revision }
        : { id: id.value, revision: revision.value }
  const body = operation(
    input,
    input.action === 'register' ? 0 : (current.value?.lifecycle.revision ?? 0),
  )
  pending = { ...target, operationId: body.operationId }
  void runWrite(
    () => client.changeSource(target.id, target.revision, body),
    (v) => {
      current.value = v
      pending = undefined
    },
  )
}
function register() {
  try {
    const protocol =
      kind.value === 'private'
        ? { kind: kind.value }
        : kind.value === 'winget_rest'
          ? { kind: kind.value, location: location.value, identifier: identifier.value }
          : {
              kind: kind.value,
              repository: repository.value,
              commit: commit.value,
              ...(kind.value === 'brew_tap' ? { tap: tap.value } : {}),
            }
    change({
      action: 'register',
      definition: sourceDefinition({ id: id.value, revision: revision.value, protocol }),
    })
  } catch {
    failure.value = 'invalidRequest'
  }
}
watch(
  () => deviceBinding(runtime),
  () => {
    current.value = undefined
    page.value = undefined
    pending = undefined
    id.value = ''
    revision.value = '1'
  },
  { flush: 'sync' },
)
directoryQuery.onClear(() => {
  page.value = undefined
})
</script>
<template>
  <MdmPage
    :title="t('software.sources')"
    :description="t('software.sourcesHint')"
    :busy="busy"
    :failure="failure"
  >
    <DirectoryControls
      :query="directoryQuery"
      :busy="busy"
      hint="筛选和排序：id / revision / protocol / state；完整来源、快照、生命周期仅作投影。"
      @load="list"
    />
    <DirectoryResults
      v-if="!directoryQuery.complete.value"
      :disabled="busy || uncertain"
      :items="page?.items ?? []"
      @open="
        (row) => {
          openProjected(row)
        }
      "
    />

    <template #actions
      ><VBtn :disabled="busy || uncertain" @click="list()">{{
        t('policies.reload')
      }}</VBtn></template
    >
    <VDataTable
      v-if="directoryQuery.complete.value && page"
      disable-sort
      :items="page.items"
      :headers="[
        { key: 'source.id', title: t('software.source') },
        { key: 'source.revision', title: t('software.sourceRevision') },
        { key: 'source.protocol.kind', title: t('software.kind') },
        { key: 'lifecycle.state', title: t('policies.status') },
        { key: 'open', title: t('policies.open'), sortable: false },
      ]"
      :items-per-page="-1"
      hide-default-footer
      :no-data-text="t('policies.empty')"
      :loading="busy"
    >
      <template #[`item.lifecycle.state`]="{ item }"
        ><VChip size="small">{{ t(`software.lifecycle_${item.lifecycle.state}`) }}</VChip></template
      >
      <template #[`item.open`]="{ item }"
        ><VBtn variant="text" :disabled="busy || uncertain" @click="choose(item)">{{
          t('policies.open')
        }}</VBtn></template
      >
    </VDataTable>

    <VCard class="my-4" variant="outlined"
      ><VCardText>
        <form @submit.prevent="read">
          <fieldset :disabled="busy || uncertain" class="software-fields">
            <VTextField
              v-model="id"
              :label="t('software.source')"
              required
              :disabled="busy || uncertain"
            />
            <VTextField
              v-model="revision"
              :label="t('software.sourceRevision')"
              required
              :disabled="busy || uncertain"
            />
            <VBtn type="submit" :disabled="busy || uncertain">{{ t('policies.open') }}</VBtn>
          </fieldset>
        </form>
        <VBtn class="mt-3" :disabled="busy" @click="read">{{ t('software.reconcile') }}</VBtn>
      </VCardText></VCard
    >
    <VCard v-if="current" class="my-4" variant="outlined"
      ><VCardTitle>{{ current.source.id }} / {{ current.source.revision }}</VCardTitle
      ><VCardText>
        <VChip>{{ current.source.protocol.kind }}</VChip>
        <VChip class="ml-2">{{ t(`software.lifecycle_${current.lifecycle.state}`) }}</VChip>
        <p class="my-3">{{ current.lifecycle.operation }} · {{ current.lifecycle.actor }}</p>
        <VBtn
          :disabled="busy || uncertain || current.lifecycle.state === 'enabled'"
          @click="change({ action: 'enable' })"
          >{{ t('software.enable') }}</VBtn
        >
        <VBtn
          class="ml-2"
          :disabled="busy || uncertain || current.lifecycle.state !== 'enabled'"
          @click="change({ action: 'disable' })"
          >{{ t('software.disable') }}</VBtn
        >
        <pre class="mt-4">{{ JSON.stringify(current.snapshot, null, 2) }}</pre>
      </VCardText></VCard
    >
    <VExpansionPanels variant="accordion"
      ><VExpansionPanel :title="t('software.registerSource')"
        ><VExpansionPanelText eager>
          <form @submit.prevent="register">
            <fieldset :disabled="busy || uncertain" class="software-fields">
              <VSelect
                v-model="kind"
                :label="t('software.kind')"
                :items="['private', 'winget_rest', 'winget_community', 'brew_tap']"
                :disabled="busy || uncertain"
              />
              <template v-if="kind === 'winget_rest'">
                <VTextField
                  v-model="location"
                  :label="t('software.location')"
                  type="url"
                  required
                  :disabled="busy || uncertain"
                />
                <VTextField
                  v-model="identifier"
                  :label="t('policies.id')"
                  required
                  :disabled="busy || uncertain"
                />
              </template>
              <template v-if="kind === 'winget_community' || kind === 'brew_tap'">
                <VTextField
                  v-model="repository"
                  :label="t('software.repository')"
                  type="url"
                  required
                  :disabled="busy || uncertain"
                />
                <VTextField
                  v-model="commit"
                  :label="t('software.commit')"
                  pattern="[0-9a-f]{40}"
                  required
                  :disabled="busy || uncertain"
                />
              </template>
              <VTextField
                v-if="kind === 'brew_tap'"
                v-model="tap"
                label="Tap"
                required
                :disabled="busy || uncertain"
              />
              <VBtn type="submit" :disabled="busy || uncertain">{{
                t('software.registerSource')
              }}</VBtn>
            </fieldset>
          </form>
        </VExpansionPanelText></VExpansionPanel
      ></VExpansionPanels
    >
  </MdmPage>
</template>
<style scoped>
.software-fields {
  border: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
</style>
