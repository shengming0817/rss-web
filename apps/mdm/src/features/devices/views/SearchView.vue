<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { Criteria, FieldDefinition, Query, SavedQuery } from '../clients/assets'
import { operation, useOperation } from '../useOperation'
import DeviceFrame from '../components/DeviceFrame.vue'
import CriteriaEditor from '../components/CriteriaEditor.vue'
import AssetValue from '../components/AssetValue.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.assets,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const fields = ref<FieldDefinition[]>([]),
  criteria = ref<Criteria | null>(null),
  select = ref<string[]>([]),
  sort = ref(''),
  descending = ref(false)
const task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  page = ref<Awaited<ReturnType<typeof client.items>>>()
const facet = ref<'os_versions' | 'channels' | 'asset_states'>('os_versions'),
  facets = ref<Awaited<ReturnType<typeof client.facets>>>()
const saved = ref<Awaited<ReturnType<typeof client.saved>>>(),
  current = ref<SavedQuery>(),
  name = ref('')
let pending: (() => Promise<boolean>) | undefined
function write<T>(request: () => Promise<T>, apply: (value: T) => void) {
  if (busy.value || uncertain.value) return
  pending = () => runWrite(request, apply)
  void pending()
}
function definition(): Query {
  return {
    criteria: structuredClone(toRaw(criteria.value)),
    select: [...select.value],
    sort: sort.value ? { field: sort.value, descending: descending.value } : null,
  }
}
function accepted(v: { task: string }) {
  task.value = v.task
  status.value = undefined
  page.value = undefined
  facets.value = undefined
}
function search() {
  const body = operation(definition())
  write(() => client.search(body), accepted)
}
function refresh() {
  if (task.value) {
    const id = task.value
    void run(
      () => client.status(id),
      (v) => (status.value = v),
    )
  }
}
function results(next?: string) {
  if (task.value)
    void run(
      () => client.items(task.value!, next),
      (v) => (page.value = v),
    )
}
function loadFacets(next?: string) {
  if (task.value)
    void run(
      () => client.facets(task.value!, facet.value, next),
      (v) => (facets.value = v),
    )
}
function loadSaved(after?: string) {
  void run(
    () => client.saved(after),
    (v) => (saved.value = v),
  )
}
function load(item: SavedQuery) {
  if (busy.value || uncertain.value) return
  void run(
    () => client.readSaved(item.id),
    (v) => {
      current.value = v
      if (!v.definition) return
      name.value = v.definition.name
      criteria.value = v.definition.query.criteria
      select.value = v.definition.query.select
      sort.value = v.definition.query.sort?.field ?? ''
      descending.value = v.definition.query.sort?.descending ?? false
    },
  )
}
function save(remove = false) {
  if (remove && !current.value) return
  const id = current.value?.id ?? crypto.randomUUID(),
    body = operation(
      remove
        ? { action: 'delete' as const }
        : { action: 'put' as const, definition: { name: name.value, query: definition() } },
      current.value?.revision ?? 0,
    )
  write(
    () => client.save(id, body),
    (v) => {
      current.value = v
      saved.value = undefined
    },
  )
}
function executeSaved() {
  if (!current.value?.definition) return
  const id = current.value.id,
    body = operation({}, current.value.revision)
  write(() => client.executeSaved(id, body), accepted)
}
onMounted(() => {
  void run(
    async () => ({ catalog: await client.catalog(), saved: await client.saved() }),
    (v) => {
      fields.value = v.catalog.fields
      saved.value = v.saved
    },
  )
})
function newSaved() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  name.value = ''
}
</script>
<template>
  <DeviceFrame :title="t('devices.search')" :busy="busy" :failure="failure">
    <p>{{ t('devices.noTtl') }}</p>
    <form @submit.prevent="search">
      <fieldset :disabled="busy || uncertain">
        <CriteriaEditor v-model="criteria" :fields="fields" />
        <label
          >{{ t('devices.sort') }}
          <select v-model="sort">
            <option value="">—</option>
            <option v-for="field in fields" :key="field.key" :value="field.key">
              {{ field.key }}
            </option>
          </select></label
        ><label><input v-model="descending" type="checkbox" />{{ t('devices.descending') }}</label>
        <fieldset>
          <legend>{{ t('devices.columns') }}</legend>
          <label v-for="field in fields" :key="field.key"
            ><input v-model="select" type="checkbox" :value="field.key" />{{ field.key }}</label
          >
        </fieldset>
        <button type="submit" :disabled="!fields.length">{{ t('devices.run') }}</button>
      </fieldset>
    </form>
    <section v-if="task">
      <h2>{{ t('devices.task') }} {{ task }}</h2>
      <button :disabled="busy" @click="refresh">{{ t('devices.refreshTask') }}</button>
      <p v-if="status">
        {{ t(`devices.${status.status}`) }} · {{ t('devices.matched') }}
        {{ status.summary.matched }} · {{ t('devices.unknownMatches') }}
        {{ status.summary.unknown }} / {{ status.summary.total
        }}<span v-if="status.failure"> · {{ t('devices.failed') }}</span>
      </p>
      <button
        v-if="status?.status === 'completed' && !status.failure"
        :disabled="busy"
        @click="results()"
      >
        {{ t('devices.load') }}
      </button>
    </section>
    <table v-if="page?.items.length">
      <thead>
        <tr>
          <th>{{ t('devices.deviceId') }}</th>
          <th>{{ t('devices.inventory') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="device in page.items" :key="device.device">
          <td>
            <RouterLink
              :to="{
                name: 'device-detail',
                params: { tenant: runtime.tenant, device: device.device },
              }"
              >{{ device.device }}</RouterLink
            >
          </td>
          <td>
            <dl>
              <template v-for="field in device.fields" :key="field.field"
                ><dt>{{ field.field }}</dt>
                <dd><AssetValue :field="field" /></dd
              ></template>
            </dl>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="page">{{ t('devices.empty') }}</p>
    <button v-if="page?.nextCursor" :disabled="busy" @click="results(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <section v-if="status?.status === 'completed' && !status.failure">
      <h2>{{ t('devices.facets') }}</h2>
      <p>{{ t('devices.facetNote') }}</p>
      <select v-model="facet" :aria-label="t('devices.facets')" @change="facets = undefined">
        <option v-for="key in ['os_versions', 'channels', 'asset_states']" :key="key" :value="key">
          {{ t(`devices.${key}`) }}
        </option></select
      ><button :disabled="busy" @click="loadFacets()">{{ t('devices.load') }}</button>
      <ul>
        <li v-for="item in facets?.items" :key="item.label">{{ item.label }}: {{ item.total }}</li>
      </ul>
      <button v-if="facets?.nextCursor" :disabled="busy" @click="loadFacets(facets.nextCursor)">
        {{ t('devices.next') }}
      </button>
    </section>
    <section>
      <h2>{{ t('devices.saved') }}</h2>
      <button :disabled="busy" @click="loadSaved()">{{ t('devices.reload') }}</button>
      <ul>
        <li v-for="item in saved?.items" :key="item.id">
          <button :disabled="busy || uncertain" @click="load(item)">
            {{ item.definition?.name }} · {{ item.revision }}
          </button>
        </li>
      </ul>
      <button v-if="saved?.next" :disabled="busy" @click="loadSaved(saved.next)">
        {{ t('devices.next') }}
      </button>
      <p v-if="current">
        {{ current.id }} · {{ t('devices.revision') }} {{ current.revision }} ·
        {{ current.definition ? '' : t('devices.state.deleted') }}
      </p>
      <section v-if="current?.definition" class="identity-card" data-testid="server-definition">
        <h3>{{ t('devices.current') }}</h3>
        <p>{{ current.definition.name }}</p>
        <p>
          {{ t('devices.columns') }}:
          {{ current.definition.query.select.join(', ') || t('devices.all') }}
        </p>
        <p>
          {{ t('devices.sort') }}: {{ current.definition.query.sort?.field ?? '—' }} ·
          {{ t('devices.descending') }}:
          {{ t(`devices.${current.definition.query.sort?.descending ? 'yes' : 'no'}`) }}
        </p>
        <fieldset disabled>
          <CriteriaEditor :model-value="current.definition.query.criteria" :fields="fields" />
        </fieldset>
      </section>
      <form @submit.prevent="save()">
        <label>{{ t('devices.name') }} <input v-model="name" required maxlength="256" /></label
        ><button :disabled="busy || uncertain || current?.definition === null">
          {{ t('devices.save') }}
        </button>
      </form>
      <button :disabled="busy || uncertain" @click="newSaved()">
        {{ t('devices.create') }}
      </button>
      <template v-if="current?.definition"
        ><button :disabled="busy || uncertain" @click="save(true)">{{ t('devices.delete') }}</button
        ><button :disabled="busy || uncertain" @click="executeSaved">
          {{ t('devices.executeSaved') }}</button
        ><button
          :disabled="busy"
          @click="
            run(
              () => client.readSaved(current!.id),
              (v) => (current = v),
            )
          "
        >
          {{ t('devices.compare') }}
        </button></template
      >
    </section>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending!()">
      {{ t('devices.replay') }}
    </button>
  </DeviceFrame>
</template>
