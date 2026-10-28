<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import { VSelect, VTextField, VBtn, VDataTable } from 'vuetify/components'

import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MdmPage from '../../../ui/MdmPage.vue'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { comparison } from '@rss/api/mdm-query'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { policyName, type PolicyRead } from '../clients/model'
import { policyDestination } from '../policy-destination'
import PolicyEntry from '../components/PolicyEntry.vue'
const policyQuery = useDirectoryQuery(
  [
    'id',
    'toolName',
    'alias',
    'customEvent',
    'revision',
    'version',
    'versionId',
    'state',
    'definition',
    'action',
    'scope',
    'resource',
    'category',
  ],
  1000,
)

const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n()
const mode = ref<'alias' | 'tool_name' | 'id' | 'event'>('event'),
  term = ref(''),
  applied = ref('')
const op = useOperation([], () => [...deviceBinding(runtime), mode.value])
const client = runtime.policies.policies
const rows = ref<Awaited<ReturnType<typeof query>>>(),
  selected = ref<PolicyRead>()
function query(event: string, cursor?: string) {
  return policyQuery.read(cursor, (selection) => client.list(selection), {
    filter: event ? comparison('customEvent', '==', event) : undefined,
  })
}
function readPolicy(id: string) {
  void op.run(
    () => client.read(id),
    (value) => {
      selected.value = value
    },
  )
}
function load(cursor?: string) {
  if (op.busy.value) return
  if (mode.value !== 'event') {
    rows.value = undefined
    selected.value = undefined
    void op.run(
      async () => {
        const selector =
          mode.value === 'id'
            ? { kind: 'id' as const, id: term.value }
            : mode.value === 'tool_name'
              ? { kind: 'tool_name' as const, name: term.value }
              : { kind: 'alias' as const, alias: term.value }
        const result = await client.resolve(selector)
        if (
          result.capability.instance !== runtime.serviceId ||
          result.capability.tenant !== runtime.tenant
        )
          throw new Error('Wrong resolved scope')
        return result
      },
      (value) => {
        selected.value = value.policy
      },
    )
    return
  }
  let event: string
  try {
    event = policyQuery.continues(cursor) ? applied.value : term.value ? policyName(term.value) : ''
  } catch {
    op.failure.value = 'invalidRequest'
    return
  }
  rows.value = undefined
  selected.value = undefined
  void op.run(
    () => query(event, cursor),
    (value) => {
      rows.value = value
      applied.value = event
    },
  )
}
watch(
  () => JSON.stringify([route.fullPath, ...deviceBinding(runtime)]),
  () => {
    rows.value = undefined
    selected.value = undefined
    applied.value = ''
    mode.value = 'event'
    term.value = typeof route.query['event'] === 'string' ? route.query['event'] : ''
    if (typeof route.query['policy'] === 'string') {
      mode.value = 'id'
      term.value = route.query['policy']
    }
    load()
  },
  { immediate: true, flush: 'sync' },
)
watch([mode, term], () => {
  rows.value = undefined
  selected.value = undefined
})
policyQuery.onClear(() => {
  rows.value = undefined
})
policyQuery.bind(mode)
</script>
<template>
  <MdmPage :title="t('policies.entry.title')" :busy="op.busy.value" :failure="op.failure.value">
    <DirectoryControls
      v-if="mode === 'event'"
      :query="policyQuery"
      :busy="op.busy.value"
      hint="id / toolName / alias / customEvent / revision / version / state / action / scope / resource / category"
      @load="load"
    />
    <DirectoryResults
      :disabled="op.busy.value"
      v-if="mode === 'event' && !policyQuery.complete.value"
      :items="rows?.items ?? []"
      @open="
        (row) => {
          readPolicy(String(row.id))
        }
      "
    />

    <p>{{ t('policies.entry.identityHint') }}</p>
    <form class="console-toolbar" @submit.prevent="load()">
      <label
        >{{ t('policies.entry.findBy')
        }}<VSelect
          v-model="mode"
          :items="[
            ...['event', 'alias', 'tool_name', 'id'].map((kind) => ({
              title: String(t(`policies.entry.${kind}`)),
              value: kind,
            })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
      <label
        >{{ t('policies.entry.name')
        }}<VTextField
          v-model="term"
          :required="mode !== 'event'"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
      <VBtn type="submit" :disabled="op.busy.value">{{ t('policies.entry.find') }}</VBtn>
    </form>
    <CopyDeepLink
      v-if="mode === 'event' && applied"
      :target="{
        kind: 'event',
        instance: runtime.serviceId,
        tenant: runtime.tenant,
        event: applied,
      }"
    />
    <p v-if="rows">{{ t('console.pageNotTotal') }}</p>
    <VDataTable
      disable-sort
      v-if="rows && policyQuery.complete.value"
      :items="rows.items"
      item-value="id"
      :aria-label="t('policies.entry.members')"
      :items-per-page="-1"
      hide-default-footer
      :headers="
        [
          { key: 'toolName', label: t('policies.entry.toolName') },
          { key: 'alias', label: t('policies.entry.alias') },
          { key: 'customEvent', label: t('policies.entry.event') },
        ].map((column) => ({ key: column.key, title: column.label, sortable: false }))
      "
      :loading-text="t('devices.loading')"
      :no-data-text="t('policies.empty')"
    >
      <template #[`item.toolName`]="{ item: row }"
        ><VBtn
          type="button"
          variant="text"
          @click="
            op.run(
              () => client.read(row.id),
              (v) => (selected = v),
            )
          "
          >{{
            row.definition.selfService?.presentation.displayName ?? row.alias ?? row.toolName
          }}</VBtn
        >
        <p>{{ row.toolName }}</p>
        <CopyDeepLink
          :target="{
            kind: 'policy',
            instance: runtime.serviceId,
            tenant: runtime.tenant,
            toolName: row.toolName,
          }"
      /></template>
    </VDataTable>

    <template v-if="selected"
      ><PolicyEntry :policy="selected" /><RouterLink
        v-if="policyDestination(selected, runtime.tenant)"
        :to="policyDestination(selected, runtime.tenant)!"
        >{{ t('policies.entry.configure') }}</RouterLink
      ></template
    >
  </MdmPage>
</template>
