<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Computer, Person, Assignment } from '@rss/device-access/model'
import { AssetAssignmentSummary } from '@rss/device-access/components'
import { useDa } from '../../../context'
import { useRead } from '../../../services/read'
import { useMutation } from '../../../services/mutation'
import ReadState from '../../../ui/ReadState.vue'
import WriteState from '../../../ui/WriteState.vue'
const props = defineProps<{ device: Computer }>(),
  r = useDa(),
  assignee = ref<string | null>(null),
  owner = ref<string | null>(null)
const { data, busy, error, reload } = useRead(
  async (signal) => ({
    assignment: await r.client.assignment(props.device.id, signal),
    people: await r.client.people(signal),
  }),
  () => props.device.id,
)
watch(
  data,
  (v) => {
    assignee.value = v?.assignment.assignee?.id ?? null
    owner.value = v?.assignment.owner?.id ?? null
  },
  { flush: 'sync' },
)
const op = useMutation(() => props.device.id + '/assignment')
function people() {
  const people = data.value?.people ?? []
  const existing = [data.value?.assignment.assignee, data.value?.assignment.owner].filter(
    (p): p is Person => !!p,
  )
  return [...new Map([...people, ...existing].map((p) => [p.id, p])).values()]
}
async function save() {
  const a = data.value?.assignment
  if (!a) return
  const options = people(),
    lookup = (id: string | null) =>
      id === null ? null : (options.find((p) => p.id === id) ?? null)
  const result = await op.run((operationId, signal) =>
    r.client.assign(
      props.device.id,
      {
        operationId,
        expectedRevision: a.revision,
        assignee: lookup(assignee.value),
        owner: lookup(owner.value),
      },
      signal,
    ),
  )
  if (result) data.value = { assignment: result, people: data.value!.people }
}
async function query() {
  const found = await op.query((id, signal) => r.client.operation(props.device.id, id, signal))
  if (found) await reload()
}
function changed(a: Assignment) {
  return (
    a.assignee?.id !== (assignee.value ?? undefined) || a.owner?.id !== (owner.value ?? undefined)
  )
}
</script>
<template>
  <div class="asset-editor-heading">
    <h2>{{ $t('da.m50326417aa') }}</h2>
    <v-chip>{{
      r.client.capabilities.assignment.source === 'demo' ? 'MOCK 接口' : '服务接口'
    }}</v-chip>
  </div>
  <p class="small muted mb-5">{{ $t('da.me7bb7eba39') }}</p>
  <ReadState :busy="busy" :error="error" @retry="reload" /><template v-if="data"
    ><v-autocomplete
      v-model="assignee"
      :items="people()"
      item-title="label"
      item-value="id"
      :label="$t('da.mb0acd917e6')"
      clearable
      :disabled="op.locked.value"
      class="mb-5"
    /><v-autocomplete
      v-model="owner"
      :items="people()"
      item-title="label"
      item-value="id"
      :label="$t('da.m47eef3c57a')"
      clearable
      :disabled="op.locked.value"
      class="mb-5"
    />
    <div class="button-row" style="justify-content: flex-start">
      <v-btn
        color="primary"
        :disabled="op.locked.value || !changed(data.assignment)"
        :loading="op.state.value.state === 'busy'"
        @click="save"
        >{{ $t('da.mcb33f216e4') }}</v-btn
      ><v-btn variant="text" :disabled="op.locked.value" @click="reload">{{
        $t('da.mf7c245090d')
      }}</v-btn>
    </div>
    <WriteState :state="op.state.value" queryable @query="query" />
    <section class="asset-context mt-6">
      <h3>{{ $t('da.m3bfe4bc62d') }}</h3>
      <AssetAssignmentSummary :assignment="data.assignment" />
      <p class="small muted mt-4">{{ $t('da.meb730c7eb9') }}</p>
    </section></template
  >
</template>
