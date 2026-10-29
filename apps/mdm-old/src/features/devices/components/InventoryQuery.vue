<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import { encodeAssetQuery, decodeAssetCondition } from '../clients/asset-query'
import { deviceBinding } from '../useDeviceBinding'
import {
  VBtn,
  VTextField,
  VSelect,
  VCheckbox,
  VTable,
  VAlert,
  VExpansionPanels,
  VExpansionPanel,
  VExpansionPanelText,
} from 'vuetify/components'
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { FieldDefinition, QueryInput, SavedQuery } from '../clients/assets'
import { operation, useOperation } from '../../../services/useOperation'
import { groupMessages } from '../group-i18n'
import ConditionEditor from '../components/ConditionEditor.vue'
import { type InventoryCondition } from '../clients/asset-model'
import AssetValue from '../components/AssetValue.vue'
const fieldQuery = useDirectoryQuery(
  [
    'itemKey',
    'key',
    'manual',
    'nullable',
    'operations',
    'platforms',
    'searchable',
    'sensitivity',
    'sources',
    'timeSeries',
    'unit',
    'valueType',
    'version',
  ],
  1000,
)

const directoryQuery = useDirectoryQuery(['id', 'revision', 'name', 'deleted', 'definition'], 100)

const { t } = useI18n({ useScope: 'local', messages: groupMessages }),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.devices.assets,
  { run, runWrite, busy, failure, uncertain } = useOperation(
    [],
    () => deviceBinding(runtime),
    () => route.path,
  )
onBeforeRouteLeave(() => !uncertain.value && !(busy.value && pending))
const fieldPage = ref<Awaited<ReturnType<typeof client.fields>>>(),
  selectedField = ref<FieldDefinition>()
function loadFields(after?: string) {
  void run(
    () => fieldQuery.read(after, (query) => client.fields(query)),
    (page) => {
      fieldPage.value = page
    },
  )
}
function readField(key: string) {
  void run(
    () => client.field(key),
    (field) => {
      selectedField.value = field
    },
  )
}
const fields = ref<FieldDefinition[]>([]),
  criteria = ref<InventoryCondition | null>(null),
  select = ref<string[]>([]),
  sortTerms = ref<QueryInput['sort']>([])
const encodedFilter = computed(() => {
  try {
    return encodeAssetQuery(criteria.value, [...select.value], sortTerms.value).filter ?? ''
  } catch {
    return ''
  }
})
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
  pending = () =>
    runWrite(request, (value) => {
      pending = undefined
      apply(value)
    })
  void pending()
}
function definition(): QueryInput | null {
  try {
    return encodeAssetQuery(
      criteria.value,
      [...select.value],
      sortTerms.value.map((term) => ({ ...term })),
    )
  } catch {
    failure.value = 'invalidRequest'
    return null
  }
}
function accepted(v: { task: string }) {
  task.value = v.task
  status.value = undefined
  page.value = undefined
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
  saved.value = undefined
  void run(
    () => directoryQuery.read(after, (query) => client.saved(query), {}),
    (v) => (saved.value = v),
  )
}
function load(item: Pick<SavedQuery, 'id'>) {
  if (busy.value || uncertain.value) return
  void run(
    () => client.readSaved(item.id),
    (v) => {
      if (!v.definition) {
        current.value = v
        return
      }
      const condition = decodeAssetCondition(v.definition.query, fields.value)
      current.value = v
      name.value = v.definition.name
      criteria.value = condition
      select.value = v.definition.query.fields
      sortTerms.value = v.definition.query.sort.map((term) => ({ ...term }))
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
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    task.value = undefined
    status.value = undefined
    page.value = undefined
    facets.value = undefined
    saved.value = undefined
    current.value = undefined
    fields.value = []
    criteria.value = null
    select.value = []
    sortTerms.value = []
    name.value = ''
    pending = undefined
    void run(
      async () => ({ catalog: await client.catalog(), saved: await client.saved() }),
      (v) => {
        fields.value = v.catalog.fields
        saved.value = v.saved
      },
    )
  },
  { immediate: true, flush: 'sync' },
)
function newSaved() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  name.value = ''
}
directoryQuery.onClear(() => {
  saved.value = undefined
})
fieldQuery.onClear(() => {
  fieldPage.value = undefined
  selectedField.value = undefined
})
</script>
<template>
  <p v-if="selectedField">
    {{ selectedField.key }} · {{ selectedField.kind }} · {{ selectedField.operations.join(', ')
    }}<VBtn
      :disabled="busy || uncertain"
      @click="select = [...new Set([...select, selectedField!.key])]"
      >{{ t('devices.columns') }} +</VBtn
    >
  </p>
  <DirectoryControls
    :query="fieldQuery"
    :busy="busy"
    hint="key / version / nullable / manual / searchable / sensitivity"
    @load="loadFields"
  />
  <DirectoryResults
    v-if="fieldPage"
    :disabled="busy || uncertain"
    :required="['key']"
    :items="fieldPage?.items ?? []"
    @open="
      (row) => {
        readField(String(row.key))
      }
    "
  />

  <DirectoryControls
    :query="directoryQuery"
    :busy="busy"
    hint="id / revision / name / deleted"
    @load="loadSaved"
  />
  <DirectoryResults
    v-if="!directoryQuery.complete.value"
    :disabled="busy || uncertain"
    :items="saved?.items ?? []"
    @open="
      (row) => {
        load({ id: String(row.id) })
      }
    "
  />

  <section :aria-label="t('groupModule.advanced')" :aria-busy="busy">
    <p>{{ t('groupModule.advancedHint') }}</p>
    <p>{{ t('devices.noTtl') }}</p>
    <v-alert v-if="failure" type="error" variant="tonal">{{ t('devices.' + failure) }}</v-alert>
    <form @submit.prevent="search">
      <fieldset :disabled="busy || uncertain">
        <ConditionEditor v-model="criteria" :fields="fields" />
        <v-text-field :model-value="encodedFilter" label="RSQL" readonly />
        <div v-for="(term, index) in sortTerms" :key="index" class="console-toolbar">
          <v-select
            v-model="term.field"
            :label="t('devices.sort')"
            :items="fields.map((field) => ({ value: field.key, title: field.key }))"
          />
          <v-checkbox v-model="term.descending" :label="t('devices.descending')" />
          <v-btn
            type="button"
            :disabled="index === 0"
            @click="sortTerms.splice(index - 1, 0, sortTerms.splice(index, 1)[0]!)"
            >↑</v-btn
          >
          <v-btn type="button" @click="sortTerms.splice(index, 1)">{{
            t('policies.remove')
          }}</v-btn>
        </div>
        <v-btn
          type="button"
          :disabled="sortTerms.length >= 16"
          @click="
            sortTerms.push({
              field:
                fields.find((field) => !sortTerms.some((term) => term.field === field.key))?.key ??
                '',
              descending: false,
            })
          "
          >{{ t('devices.sort') }} +</v-btn
        >
        <v-select
          v-model="select"
          multiple
          chips
          :label="t('devices.columns')"
          :items="fields.map((field) => ({ value: field.key, title: field.key }))"
        />
        <v-btn color="primary" type="submit" :disabled="!fields.length">{{
          t('devices.run')
        }}</v-btn>
      </fieldset>
    </form>
    <section v-if="task">
      <h3>{{ t('devices.task') }} {{ task }}</h3>
      <v-btn :disabled="busy" @click="refresh">{{ t('devices.refreshTask') }}</v-btn>
      <p v-if="status">
        {{ t('devices.' + status.status) }} · {{ t('devices.matched') }}
        {{ status.summary.matched }} · {{ t('devices.unknownMatches') }}
        {{ status.summary.unknown }} / {{ status.summary.total
        }}<span v-if="status.failure"> · {{ t('devices.failed') }}</span>
      </p>
      <v-btn
        v-if="status?.status === 'completed' && !status.failure"
        :disabled="busy"
        @click="results()"
        >{{ t('devices.load') }}</v-btn
      >
    </section>
    <v-table v-if="page" :aria-label="t('groupModule.advanced')"
      ><thead>
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
        <tr v-if="!page.items.length">
          <td colspan="2">{{ t('devices.empty') }}</td>
        </tr>
      </tbody></v-table
    >
    <v-btn v-if="page?.nextCursor" :disabled="busy" @click="results(page.nextCursor)">{{
      t('devices.next')
    }}</v-btn>
    <section v-if="status?.status === 'completed' && !status.failure">
      <h2>{{ t('devices.facets') }}</h2>
      <p>{{ t('devices.facetNote') }}</p>
      <v-select
        v-model="facet"
        :label="t('devices.facets')"
        :items="
          ['os_versions', 'channels', 'asset_states'].map((value) => ({
            value,
            title: t('devices.' + value),
          }))
        "
        @update:model-value="facets = undefined"
      /><v-btn :disabled="busy" @click="loadFacets()">{{ t('devices.load') }}</v-btn
      ><v-table
        ><thead>
          <tr>
            <th>{{ t('devices.facets') }}</th>
            <th>{{ t('devices.total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in facets?.items" :key="item.label">
            <td>{{ item.label }}</td>
            <td>{{ item.total }}</td>
          </tr>
        </tbody></v-table
      ><v-btn v-if="facets?.nextCursor" :disabled="busy" @click="loadFacets(facets.nextCursor)">{{
        t('devices.next')
      }}</v-btn>
    </section>
    <v-expansion-panels
      ><v-expansion-panel :title="t('devices.saved')"
        ><v-expansion-panel-text eager>
          <v-btn :disabled="busy" @click="loadSaved()">{{ t('devices.reload') }}</v-btn>
          <ul>
            <li v-for="item in directoryQuery.complete.value ? saved?.items : []" :key="item.id">
              <v-btn :disabled="busy || uncertain" @click="load(item)"
                >{{ item.definition?.name }} · {{ item.revision }}</v-btn
              >
            </li>
          </ul>

          <p v-if="current">
            {{ current.id }} · {{ t('devices.revision') }} {{ current.revision }} ·
            {{ current.definition ? '' : t('devices.state.deleted') }}
          </p>
          <section v-if="current?.definition" data-testid="server-definition">
            <h3>{{ t('devices.current') }}</h3>
            <p>{{ current.definition.name }}</p>
            <p>
              {{ t('devices.columns') }}:
              {{ current.definition.query.fields.join(', ') || t('devices.all') }}
            </p>
            <p>
              {{ t('devices.sort') }}:
              {{
                current.definition.query.sort
                  .map((term) => (term.descending ? '-' : '') + term.field)
                  .join(', ') || '—'
              }}
            </p>
            <fieldset disabled>
              <ConditionEditor
                :model-value="decodeAssetCondition(current.definition.query, fields)"
                :fields="fields"
              />
            </fieldset>
          </section>
          <form @submit.prevent="save()">
            <v-text-field
              v-model="name"
              :label="t('devices.name')"
              required
              maxlength="256"
            /><v-btn :disabled="busy || uncertain || current?.definition === null" type="submit">{{
              t('devices.save')
            }}</v-btn>
          </form>
          <v-btn :disabled="busy || uncertain" @click="newSaved()">{{ t('devices.create') }}</v-btn
          ><template v-if="current?.definition"
            ><v-btn :disabled="busy || uncertain" @click="save(true)">{{
              t('devices.delete')
            }}</v-btn
            ><v-btn :disabled="busy || uncertain" @click="executeSaved">{{
              t('devices.executeSaved')
            }}</v-btn
            ><v-btn
              :disabled="busy"
              @click="
                run(
                  () => client.readSaved(current!.id),
                  (v) => (current = v),
                )
              "
              >{{ t('devices.compare') }}</v-btn
            ></template
          >
        </v-expansion-panel-text></v-expansion-panel
      ></v-expansion-panels
    >
    <v-btn v-if="uncertain && pending" :disabled="busy" @click="pending!()">{{
      t('devices.replay')
    }}</v-btn>
  </section>
</template>
