<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { Reference, ScopeRead, ScopeProjection, ScopeChange } from '../clients/scopes'
import PolicyFrame from '../components/PolicyFrame.vue'
import ReferenceEditor from '../components/ReferenceEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.scopes,
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const id = ref(''),
  current = ref<ScopeRead>(),
  targets = ref<Reference[]>([]),
  limitations = ref<Reference[]>([]),
  exclusions = ref<Reference[]>([]),
  unlimited = ref(true)
const list = ref<Awaited<ReturnType<typeof runtime.policies.catalog.list>>>(),
  devices = ref<{ id: string; name: string }[]>([]),
  groups = ref<{ id: string; name: string }[]>([])
const task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  result = ref<Awaited<ReturnType<typeof client.page>>>(),
  projection = ref<ScopeProjection>('members')
let pending: (() => Promise<void>) | undefined
function load(cursor?: string) {
  void run(
    () => runtime.policies.catalog.list('scopes', cursor),
    (v) => (list.value = v),
  )
}
function apply(value: ScopeRead) {
  current.value = value
  id.value = value.id
  targets.value = value.definition.targets
  limitations.value = value.definition.limitations ?? []
  unlimited.value = value.definition.limitations === null
  exclusions.value = value.definition.exclusions
}
function open(value = id.value) {
  if (!busy.value && !uncertain.value)
    void run(
      () => client.read(value),
      (v) => {
        apply(v)
        task.value = undefined
        status.value = undefined
        result.value = undefined
      },
    )
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  id.value = crypto.randomUUID()
  targets.value = []
  limitations.value = []
  exclusions.value = []
  unlimited.value = true
  task.value = undefined
  status.value = undefined
  result.value = undefined
}
function change(input: ScopeChange) {
  if (busy.value || uncertain.value) return
  const target = current.value?.id ?? id.value,
    body = operation(input, current.value?.revision ?? 0)
  pending = async () => {
    const acknowledged = await runWrite(
      () => client.change(target, body),
      (v) => {
        task.value = v.task ?? undefined
        status.value = undefined
        result.value = undefined
        list.value = undefined
        if (input.action === 'delete') current.value = undefined
      },
    )
    if (acknowledged && input.action !== 'delete') await run(() => client.read(target), apply)
  }
  void pending()
}
function save() {
  change({
    action: 'put',
    definition: {
      targets: structuredClone(toRaw(targets.value)),
      limitations: unlimited.value ? null : structuredClone(toRaw(limitations.value)),
      exclusions: structuredClone(toRaw(exclusions.value)),
    },
  })
}
function refresh() {
  if (task.value)
    void run(
      () => client.status(id.value, task.value!),
      (v) => (status.value = v),
    )
}
function page(cursor?: string) {
  if (task.value)
    void run(
      () => client.page(id.value, task.value!, projection.value, cursor),
      (v) => (result.value = v),
    )
}
onMounted(async () => {
  await run(
    async () =>
      Promise.all([
        runtime.policies.catalog.list('scopes'),
        runtime.devices.directory.list(),
        runtime.devices.directory.groups(),
      ]),
    ([l, d, g]) => {
      list.value = l
      devices.value = d.items
      groups.value = g.items
    },
  )
  const device = route.query['device'],
    group = route.query['group']
  if (typeof device === 'string' || typeof group === 'string') {
    create()
    targets.value =
      typeof device === 'string'
        ? [{ kind: 'device', id: device }]
        : [{ kind: 'group', id: group as string }]
  }
})
</script>
<template>
  <PolicyFrame :title="t('policies.scopes')" :busy="busy" :failure="failure">
    <p>{{ t('policies.scopeHint') }}</p>
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button
    ><button :disabled="busy" @click="load()">{{ t('policies.reload') }}</button>
    <ul>
      <li v-for="item in list?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">{{ item.label }}</button> ·
        {{ item.revision }}
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form @submit.prevent="save">
      <fieldset :disabled="busy || uncertain">
        <label for="scope-id">{{ t('policies.id') }}</label
        ><input id="scope-id" v-model="id" required :readonly="!!current" /><button
          type="button"
          @click="open()"
        >
          {{ t('policies.open') }}
        </button>
        <ReferenceEditor
          v-model="targets"
          :label="t('policies.targets')"
          :devices="devices"
          :groups="groups"
        />
        <label><input v-model="unlimited" type="checkbox" />{{ t('policies.unlimited') }}</label>
        <p>{{ t('policies.emptyLimit') }}</p>
        <ReferenceEditor
          v-if="!unlimited"
          v-model="limitations"
          :label="t('policies.limitations')"
          :devices="devices"
          :groups="groups"
        />
        <ReferenceEditor
          v-model="exclusions"
          :label="t('policies.exclusions')"
          :devices="devices"
          :groups="groups"
        /><button type="submit">{{ t('policies.save') }}</button
        ><button v-if="current" type="button" @click="change({ action: 'delete' })">
          {{ t('policies.remove') }}
        </button>
      </fieldset>
    </form>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button>
    <section v-if="task">
      <p>{{ task }} · {{ status?.status ?? '—' }}</p>
      <button :disabled="busy" @click="refresh">{{ t('policies.refresh') }}</button
      ><template v-if="status?.status === 'completed'"
        ><p>{{ t('policies.frozen') }}</p>
        <label for="scope-projection">{{ t('policies.detail') }}</label
        ><select id="scope-projection" v-model="projection">
          <option value="members">{{ t('policies.members') }}</option>
          <option value="decisions">{{ t('policies.decisions') }}</option></select
        ><button :disabled="busy" @click="page()">{{ t('policies.open') }}</button>
        <pre v-if="result">{{ JSON.stringify(result, null, 2) }}</pre>
        <button v-if="result?.nextCursor" :disabled="busy" @click="page(result.nextCursor)">
          {{ t('policies.next') }}
        </button></template
      >
    </section>
  </PolicyFrame>
</template>
