<script setup lang="ts">
import { VSelect, VTextField, VBtn, VDataTable } from 'vuetify/components'

import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MdmPage from '../../../ui/MdmPage.vue'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { comparison } from '../../../services/directory-query'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { policyName, type PolicyRead } from '../clients/model'
import { policyDestination } from '../policy-destination'
import PolicyEntry from '../components/PolicyEntry.vue'
const runtime = useMdm(),
  route = useRoute(),
  { t } = useI18n()
const mode = ref<'alias' | 'tool_name' | 'id' | 'event'>('event'),
  term = ref(''),
  applied = ref('')
const op = useOperation([], () => [
  ...deviceBinding(runtime),
  applied.value,
  mode.value,
  term.value,
])
const client = runtime.policies.policies
const rows = ref<Awaited<ReturnType<typeof query>>>(),
  selected = ref<PolicyRead>()
function query(event: string, cursor?: string) {
  return client.list({
    fields: [
      'id',
      'toolName',
      'alias',
      'customEvent',
      'revision',
      'version',
      'versionId',
      'state',
      'definition',
    ],
    filter: event ? comparison('customEvent', '==', event) : undefined,
    cursor,
  })
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
    event = cursor ? applied.value : term.value ? policyName(term.value) : ''
  } catch {
    op.failure.value = 'invalidRequest'
    return
  }
  if (!cursor) applied.value = event
  rows.value = undefined
  selected.value = undefined
  void op.run(
    () => query(event, cursor),
    (value) => {
      rows.value = value
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
</script>
<template>
  <MdmPage :title="t('policies.entry.title')" :busy="op.busy.value" :failure="op.failure.value">
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
      v-if="rows"
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
    <VBtn v-if="rows?.nextCursor" :disabled="op.busy.value" @click="load(rows.nextCursor)">{{
      t('devices.next')
    }}</VBtn>
    <template v-if="selected"
      ><PolicyEntry :policy="selected" /><RouterLink
        v-if="policyDestination(selected, runtime.tenant)"
        :to="policyDestination(selected, runtime.tenant)!"
        >{{ t('policies.entry.configure') }}</RouterLink
      ></template
    >
  </MdmPage>
</template>
