<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  VBtn,
  VDataTable,
  VExpansionPanel,
  VExpansionPanels,
  VExpansionPanelText,
  VAlert,
} from 'vuetify/components'
import { useMdm } from '../../../context'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { useOperation } from '../../../services/useOperation'
const publicationQuery = useDirectoryQuery(
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

const runtime = useMdm(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const current = ref<Awaited<ReturnType<typeof runtime.software.publication.read>>>()
function readPublication(id: string) {
  void run(
    () => runtime.software.publication.read(id),
    (value) => {
      current.value = value
    },
  )
}
const page = ref<Awaited<ReturnType<typeof runtime.software.publication.list>>>()
function load(cursor?: string) {
  page.value = undefined
  void run(
    () => publicationQuery.read(cursor, (query) => runtime.software.publication.list(query)),

    (result) => {
      page.value = result
    },
  )
}
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    page.value = undefined
  },
  { flush: 'sync' },
)
publicationQuery.onClear(() => {
  page.value = undefined
})
</script>
<template>
  <pre v-if="current">{{ current }}</pre>
  <DirectoryControls
    :query="publicationQuery"
    :busy="busy"
    hint="id / target / resource / version；operationId 可筛选"
    @load="load"
  />
  <DirectoryResults
    :disabled="busy"
    v-if="!publicationQuery.complete.value"
    :items="page?.items ?? []"
    @open="
      (row) => {
        readPublication(String(row.id))
      }
    "
  />

  <VExpansionPanels class="mb-4"
    ><VExpansionPanel :title="t('policies.publishedSoftware')"
      ><VExpansionPanelText>
        <p>{{ t('policies.publicationHint') }}</p>
        <VBtn :disabled="busy" @click="load()">{{ t('policies.reload') }}</VBtn>
        <VAlert v-if="failure" type="error" variant="tonal">{{ t(`devices.${failure}`) }}</VAlert>
        <VDataTable
          disable-sort
          v-if="page && publicationQuery.complete.value"
          :items="page.items"
          :headers="[
            { key: 'resource', title: t('policies.resources') },
            { key: 'version', title: t('policies.version') },
            { key: 'target', title: t('policies.targets') },
            { key: 'outcome', title: t('policies.status') },
          ]"
          :items-per-page="-1"
          hide-default-footer
          :no-data-text="t('policies.empty')"
        >
          <template #[`item.resource`]="{ item }"
            ><VBtn
              variant="text"
              :to="{
                name: 'policy-resources',
                params: { tenant: runtime.tenant },
                query: { resource: item.resource },
              }"
              >{{ item.resource }}</VBtn
            ></template
          >
          <template #[`item.outcome`]="{ item }"
            >{{ item.outcome }} · {{ item.withdrawn }}</template
          >
        </VDataTable>
      </VExpansionPanelText></VExpansionPanel
    ></VExpansionPanels
  >
</template>
