<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import { VBtn, VSelect } from 'vuetify/components'
import PolicyScopeEditor from './PolicyScopeEditor.vue'

import { comparison as queryComparison } from '@rss/api/mdm-query'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
const resourceQuery = useDirectoryQuery(
  ['id', 'revision', 'kind', 'activeVersion', 'presentation'],
  1000,
)

const scopeQuery = useDirectoryQuery(
  ['id', 'revision', 'deleted', 'calculationRevision', 'resolution', 'resolutionRevision'],
  1000,
)

const props = defineProps<{ collection: 'scopes' | 'resources'; disabled?: boolean }>()
const value = defineModel<string>({ required: true })
const { t } = useI18n(),
  runtime = useMdm()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const page = ref<{ items: { id: string; label: string }[]; nextCursor: string | null }>()
watch(
  () => deviceBinding(runtime),
  () => {
    page.value = undefined
  },
  { flush: 'sync' },
)
const scopeRows = ref<object[]>([]),
  resourceRows = ref<object[]>([])
async function chooseScope(id: string) {
  await run(
    () => runtime.policies.scopes.read(id),
    (row) => {
      value.value = row.id
    },
  )
}
async function chooseResource(id: string) {
  await run(
    () => runtime.policies.resources.read(id),
    (row) => {
      value.value = row.id
    },
  )
}
function load(cursor?: string) {
  void run(
    async () => {
      if (props.collection === 'scopes') {
        const p = await scopeQuery.read(cursor, (query) => runtime.policies.scopes.list(query), {
          filter: queryComparison('ready', '==', true),
        })
        return {
          ...p,
          raw: p.items,
          collection: 'scopes' as const,
          items: p.items
            .filter((i) => 'id' in i)
            .map((i) => ({
              id: i.id,
              label: `${i.id} · ${t('policies.revision')} ${i.revision}`,
            })),
        }
      }
      {
        const p = await resourceQuery.read(
          cursor,
          (query) => runtime.policies.resources.list(query),
          {
            filter: queryComparison('active', '==', true),
          },
        )
        return {
          ...p,
          raw: p.items,
          collection: 'resources' as const,
          items: p.items
            .filter((i) => 'id' in i)
            .map((i) => ({
              id: i.id,
              label: `${i.id} · ${t('policies.version')} ${i.activeVersion ?? '—'}`,
            })),
        }
      }
    },
    (result) => {
      page.value = result
      if (result.collection === 'scopes') scopeRows.value = result.raw
      else resourceRows.value = result.raw
    },
  )
}
scopeQuery.onClear(() => {
  page.value = undefined
  scopeRows.value = []
})
resourceQuery.onClear(() => {
  page.value = undefined
  resourceRows.value = []
})
scopeQuery.bind(() => props.collection)
resourceQuery.bind(() => props.collection)
</script>
<template>
  <DirectoryControls
    v-if="collection === 'resources'"
    :query="resourceQuery"
    :busy="busy"
    hint="id / revision / kind / active；sort: id / revision / kind"
    @load="load"
  />
  <DirectoryResults
    :disabled="busy"
    v-if="collection === 'resources' && !resourceQuery.complete.value"
    :items="resourceRows"
    @open="
      (row) => {
        chooseResource(String(row.id))
      }
    "
  />

  <DirectoryControls
    v-if="collection === 'scopes'"
    :query="scopeQuery"
    :busy="busy"
    hint="id / revision / deleted / calculationRevision / resolutionRevision；ready 可筛选"
    @load="load"
  />
  <DirectoryResults
    :disabled="busy"
    v-if="collection === 'scopes' && !scopeQuery.complete.value"
    :items="scopeRows"
    @open="
      (row) => {
        chooseScope(String(row.id))
      }
    "
  />

  <div class="console-locator">
    <PolicyScopeEditor
      v-if="collection === 'scopes'"
      v-model="value"
      :disabled="disabled || busy"
    />
    <VBtn type="button" variant="tonal" :disabled="disabled || busy" @click="load()">{{
      t('console.chooseLoaded')
    }}</VBtn>
    <p v-if="page">{{ t('console.pageNotTotal') }}</p>
    <label v-if="page"
      >{{ t(`policies.${collection}`)
      }}<VSelect
        v-model="value"
        :disabled="disabled || busy"
        :items="[
          { title: String(t('devices.select')), value: '' },
          ...(value && !page.items.some((item) => item.id === value)
            ? [{ title: String(value), value: value }]
            : []),
          ...page.items.map((item) => ({ title: String(item.label), value: item.id })),
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
    /></label>
    <VBtn
      v-if="page?.nextCursor"
      type="button"
      :disabled="disabled || busy"
      @click="load(page.nextCursor!)"
      >{{ t('devices.next') }}</VBtn
    >
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
  </div>
</template>
