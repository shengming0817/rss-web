<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { FieldDefinition, Query, SavedQuery } from '../clients/assets'
import { operation, useOperation } from '../../../services/useOperation'
import PageFrame from '../../../components/PageFrame.vue'
import ConditionEditor from '../components/ConditionEditor.vue'
import { inventoryCondition, type InventoryCondition } from '../clients/asset-model'
import BatchPanel from '../components/BatchPanel.vue'
import AssetValue from '../components/AssetValue.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.assets,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const fields = ref<FieldDefinition[]>([]),
  criteria = ref<InventoryCondition | null>(null),
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
const selected = ref<string[]>([]),
  batchTargets = ref<string[]>([]),
  batchOpen = ref(false),
  batchLocked = ref(false)
function openBatch() {
  batchTargets.value = [...selected.value]
  batchOpen.value = true
}
let pending: (() => Promise<boolean>) | undefined
function write<T>(request: () => Promise<T>, apply: (value: T) => void) {
  if (busy.value || uncertain.value) return
  pending = () => runWrite(request, apply)
  void pending()
}
function definition(): Query | null {
  try {
    return {
      criteria: criteria.value ? inventoryCondition(criteria.value) : null,
      select: [...select.value],
      sort: sort.value ? { field: sort.value, descending: descending.value } : null,
    }
  } catch {
    failure.value = 'invalidRequest'
    return null
  }
}
function accepted(v: { task: string }) {
  task.value = v.task
  status.value = undefined
  page.value = undefined
  selected.value = []
  facets.value = undefined
}
function search() {
  const query = definition()
  if (!query) return
  const body = operation(query)
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
      (v) => {
        page.value = v
        selected.value = []
      },
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
      criteria.value = structuredClone(v.definition.query.criteria)
      select.value = v.definition.query.select
      sort.value = v.definition.query.sort?.field ?? ''
      descending.value = v.definition.query.sort?.descending ?? false
    },
  )
}
function save(remove = false) {
  if (remove && !current.value) return
  const query = remove ? null : definition()
  if (!remove && !query) return
  const id = current.value?.id ?? crypto.randomUUID(),
    body = operation(
      remove
        ? { action: 'delete' as const }
        : { action: 'put' as const, definition: { name: name.value, query: query! } },
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
  <PageFrame :title="t('devices.search')" :busy="busy" :failure="failure">
    <p>{{ t('devices.noTtl') }}</p>
    <form class="console-panel" @submit.prevent="search">
      <h2>{{ t('devices.search') }}</h2>
      <fieldset :disabled="busy || uncertain">
        <ConditionEditor v-model="criteria" :fields="fields" />
        <label
          >{{ t('devices.sort') }}
          <select v-model="sort" class="ui-input">
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
        <UiButton type="submit" :disabled="!!!fields.length">{{ t('devices.run') }}</UiButton>
      </fieldset>
    </form>
    <section v-if="task">
      <h2>{{ t('devices.task') }} {{ task }}</h2>
      <UiButton :disabled="!!busy" type="submit" @click="refresh">{{
        t('devices.refreshTask')
      }}</UiButton>
      <p v-if="status">
        {{ t(`devices.${status.status}`) }} · {{ t('devices.matched') }}
        {{ status.summary.matched }} · {{ t('devices.unknownMatches') }}
        {{ status.summary.unknown }} / {{ status.summary.total
        }}<span v-if="status.failure"> · {{ t('devices.failed') }}</span>
      </p>
      <UiButton
        v-if="status?.status === 'completed' && !status.failure"
        :disabled="!!busy"
        type="submit"
        @click="results()"
      >
        {{ t('devices.load') }}
      </UiButton>
    </section>
    <div v-if="page?.items.length" class="console-toolbar">
      <span>{{ t('console.selectedEndpoints') }}: {{ selected.length }}</span>
      <UiButton :disabled="!selected.length" type="button" @click="openBatch">{{
        t('devices.batch')
      }}</UiButton>
    </div>
    <div v-if="page?.items.length" class="ui-table-scroll">
      <table class="ui-table">
        <thead>
          <tr>
            <th>{{ t('console.targets') }}</th>
            <th>{{ t('devices.deviceId') }}</th>
            <th>{{ t('devices.inventory') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in page.items" :key="device.device">
            <td>
              <input
                v-model="selected"
                type="checkbox"
                :value="device.device"
                :aria-label="`${t('console.selectedEndpoints')}: ${device.device}`"
              />
            </td>
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
    </div>
    <p v-else-if="page">{{ t('devices.empty') }}</p>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="results(page.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
    <section v-if="status?.status === 'completed' && !status.failure">
      <h2>{{ t('devices.facets') }}</h2>
      <p>{{ t('devices.facetNote') }}</p>
      <select
        v-model="facet"
        class="ui-input"
        :aria-label="t('devices.facets')"
        @change="facets = undefined"
      >
        <option v-for="key in ['os_versions', 'channels', 'asset_states']" :key="key" :value="key">
          {{ t(`devices.${key}`) }}
        </option></select
      ><UiButton :disabled="!!busy" type="submit" @click="loadFacets()">{{
        t('devices.load')
      }}</UiButton>
      <ul>
        <li v-for="item in facets?.items" :key="item.label">{{ item.label }}: {{ item.total }}</li>
      </ul>
      <UiButton
        v-if="facets?.nextCursor"
        :disabled="!!busy"
        type="submit"
        @click="loadFacets(facets.nextCursor)"
      >
        {{ t('devices.next') }}
      </UiButton>
    </section>
    <details class="console-panel">
      <summary>{{ t('devices.saved') }}</summary>
      <UiButton :disabled="!!busy" type="submit" @click="loadSaved()">{{
        t('devices.reload')
      }}</UiButton>
      <ul>
        <li v-for="item in saved?.items" :key="item.id">
          <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="load(item)">
            {{ item.definition?.name }} · {{ item.revision }}
          </UiButton>
        </li>
      </ul>
      <UiButton v-if="saved?.next" :disabled="!!busy" type="submit" @click="loadSaved(saved.next)">
        {{ t('devices.next') }}
      </UiButton>
      <p v-if="current">
        {{ current.id }} · {{ t('devices.revision') }} {{ current.revision }} ·
        {{ current.definition ? '' : t('devices.state.deleted') }}
      </p>
      <section v-if="current?.definition" class="console-panel" data-testid="server-definition">
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
          <ConditionEditor :model-value="current.definition.query.criteria" :fields="fields" />
        </fieldset>
      </section>
      <form @submit.prevent="save()">
        <label
          >{{ t('devices.name') }}
          <input v-model="name" class="ui-input" required maxlength="256" /></label
        ><UiButton :disabled="!!(busy || uncertain || current?.definition === null)" type="submit">
          {{ t('devices.save') }}
        </UiButton>
      </form>
      <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="newSaved()">
        {{ t('devices.create') }}
      </UiButton>
      <template v-if="current?.definition"
        ><UiButton :disabled="!!(busy || uncertain)" type="submit" @click="save(true)">{{
          t('devices.delete')
        }}</UiButton
        ><UiButton :disabled="!!(busy || uncertain)" type="submit" @click="executeSaved">
          {{ t('devices.executeSaved') }}</UiButton
        ><UiButton
          :disabled="!!busy"
          type="submit"
          @click="
            run(
              () => client.readSaved(current!.id),
              (v) => (current = v),
            )
          "
        >
          {{ t('devices.compare') }}
        </UiButton></template
      >
    </details>
    <UiDialog
      :open="batchOpen"
      :title="t('devices.batch')"
      :description="t('console.scopeBound')"
      :close-label="t('console.close')"
      :dismissible="!batchLocked"
      @update:open="batchOpen = $event"
    >
      <BatchPanel :devices="batchTargets" @lock="batchLocked = $event" />
    </UiDialog>
    <UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="pending!()">
      {{ t('devices.replay') }}
    </UiButton>
  </PageFrame>
</template>
