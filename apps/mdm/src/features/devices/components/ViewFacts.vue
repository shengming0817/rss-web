<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import { assetCategories, assetCategory, assetLabel } from '../assetPresentation'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { DeviceView } from '../clients/device-views'
import type { EndpointDetail } from '../clients/endpoint-model'
import type { FieldLayout } from '../clients/assets'
import type { FieldMappingReference } from '../../../contracts/collection/generated/FieldMappingReference'
import { scalarText, utc } from '../presentation'
import AssetValue from './AssetValue.vue'
import SourceList from './SourceList.vue'
import CollectionQuality from './CollectionQuality.vue'
import FieldLayoutEditor from './FieldLayoutEditor.vue'
import ScopedInventory from './ScopedInventory.vue'
const props = defineProps<{ view: DeviceView; endpoints: EndpointDetail[] }>()
const emit = defineEmits<{ invalidated: [reason: 'cursorInvalidated' | 'denied' | 'notFound'] }>()
const { t, locale } = useI18n(),
  runtime = useMdm()
const category = ref<string>('overview'),
  mode = ref('values'),
  search = ref(''),
  state = ref('')
const scopeVisited = ref(false)
watch(category, (value) => {
  if (value === 'scopes') scopeVisited.value = true
})
const all = computed(() => category.value === 'all')
const viewMode = computed(() => (all.value ? mode.value : 'values'))
const layout = ref<FieldLayout>(),
  layoutFailure = ref(false)
const selectedGroup = computed(() => layout.value?.groups.find((g) => g.id === category.value))
const title = computed(
  () =>
    selectedGroup.value?.name ??
    (all.value ? t('devices.workspace.allFields') : t('devices.assetCategories.' + category.value)),
)
const catalog = ref<Awaited<ReturnType<typeof runtime.devices.assets.catalog>>>()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const collection = ref<{ device: string; id: string }>()
const detailKey = ref(''),
  detailOpen = ref(false),
  opener = ref<HTMLElement>()
const detail = computed(() => visible.value.find((r) => r.key === detailKey.value))
const refs = ref<Awaited<ReturnType<typeof runtime.devices.assets.fieldReferences>>>()
const definitions = ref<Record<string, unknown>>({})
const mappingOperation = useOperation([], () => [
  ...deviceBinding(runtime),
  JSON.stringify(props.view.reference),
  detailKey.value,
])
const keys = computed(() => [
  ...new Set([
    ...Object.keys(props.view.fields),
    ...Object.keys(props.view.lists),
    ...(all.value ? (catalog.value?.fields.map((f) => f.key) ?? []) : []),
  ]),
])
const rows = computed(() =>
  keys.value.map((key) => ({
    key,
    field: props.view.fields[key],
    list: props.view.lists[key],
    metadata: catalog.value?.fields.find((f) => f.key === key),
  })),
)
const visible = computed(() =>
  (selectedGroup.value
    ? selectedGroup.value.fields.flatMap((key) => {
        const row = rows.value.find((r) => r.key === key)
        return row ? [row] : []
      })
    : rows.value
  ).filter(
    (row) =>
      (all.value ||
        (selectedGroup.value
          ? selectedGroup.value.fields.includes(row.key)
          : assetCategory(row.key) === category.value &&
            (category.value !== 'extensions' ||
              !layout.value?.groups.some((g) => g.fields.includes(row.key))))) &&
      (!all.value ||
        ((!state.value ||
          (row.field?.state.kind ?? row.list?.state.kind ?? 'missing') === state.value) &&
          `${assetLabel(row.key, locale.value)} ${JSON.stringify(row)}`
            .toLocaleLowerCase()
            .includes(search.value.toLocaleLowerCase()))),
  ),
)
watch(visible, (value) => {
  if (all.value && !value.some((row) => row.key === detailKey.value))
    detailKey.value = value[0]?.key ?? ''
})
const stateOptions = computed(() => [
  { value: '', title: t('devices.all') },
  ...['known', 'unknown', 'conflict', 'null', 'missing', 'unsupported', 'deleted'].map((value) => ({
    value,
    title: t('devices.state.' + value),
  })),
])
watch(
  () => JSON.stringify([props.view.reference, ...deviceBinding(runtime)]),
  () => {
    layout.value = undefined
    catalog.value = undefined
    layoutFailure.value = false
    refs.value = undefined
    definitions.value = {}
    detailOpen.value = false
    collection.value = undefined
    void run(
      async () => {
        const fields = await runtime.devices.assets.catalog()
        let groups: FieldLayout | undefined
        try {
          groups = await runtime.devices.assets.fieldLayout()
        } catch {
          /* Authorized facts remain independently readable. */
        }
        return { fields, groups }
      },
      (value) => {
        catalog.value = value.fields
        layout.value = value.groups
        layoutFailure.value = !value.groups
      },
    )
  },
  { immediate: true, flush: 'sync' },
)
watch(category, () => {
  detailOpen.value = false
})
watch(detailKey, () => {
  refs.value = undefined
  definitions.value = {}
})
function open(key: string, event: Event) {
  detailKey.value = key
  refs.value = undefined
  definitions.value = {}
  if (all.value) mode.value = 'raw'
  else {
    opener.value = event.currentTarget as HTMLElement
    detailOpen.value = true
  }
}
function restoreFocus() {
  opener.value?.focus()
}
async function readReferences(cursor?: string) {
  if (!detailKey.value) return
  await mappingOperation.run(
    () => runtime.devices.assets.fieldReferences(detailKey.value, cursor),
    (value) => {
      refs.value =
        cursor && refs.value
          ? { ...value, mappings: [...refs.value.mappings, ...value.mappings] }
          : value
    },
  )
}
async function readDefinition(reference: FieldMappingReference) {
  await mappingOperation.run(
    () => runtime.policies.resources.read(reference.resource),
    (resource) => {
      const version = resource.versions.find((v) => v.id === reference.version)
      definitions.value[reference.resource + ':' + reference.version] = version
        ? version.variants.flatMap<{variant: string; platform: string; mapping: unknown}>((variant) => {
            const declaration = variant.declaration
            if (declaration.kind === 'agent_collection' || declaration.kind === 'native_collection')
              return [
                {
                  variant: variant.key,
                  platform: variant.platform,
                  mapping: declaration.definition.mappings[detailKey.value] ?? null,
                },
              ]
            if (
              declaration.kind === 'script' &&
              declaration.definition.purpose.kind === 'collection'
            )
              return [
                {
                  variant: variant.key,
                  platform: variant.platform,
                  mapping: declaration.definition.purpose.mappings[detailKey.value] ?? null,
                },
              ]
            if (declaration.kind === 'telemetry_profile')
              return [
                {
                  variant: variant.key,
                  platform: variant.platform,
                  mapping: {
                    fields: declaration.definition.fields,
                    template: declaration.definition.template,
                    projection: declaration.definition.projection,
                  },
                },
              ]
            return []
          })
        : t('devices.workspace.noVersion')
    },
  )
}
function summary(row: (typeof rows.value)[number]) {
  if (row.field?.state.kind === 'known') return scalarText(row.field.state.value)
  if (row.list?.state.kind === 'known') return String(row.list.state.count)
  return t('devices.state.' + (row.field?.state.kind ?? row.list?.state.kind ?? 'missing'))
}
</script>
<template>
  <div class="device-inventory-layout">
    <nav class="device-asset-nav" :aria-label="t('devices.inventory')">
      <v-btn
        v-for="value in assetCategories"
        :key="value"
        :variant="category === value ? 'tonal' : 'text'"
        :aria-pressed="category === value"
        @click="category = value"
        >{{ t('devices.assetCategories.' + value) }}</v-btn
      >
      <v-btn
        v-for="group in layout?.groups"
        :key="group.id"
        :variant="category === group.id ? 'tonal' : 'text'"
        :aria-pressed="category === group.id"
        @click="category = group.id"
        >{{ group.name }}</v-btn
      >
      <v-btn :variant="all ? 'tonal' : 'text'" :aria-pressed="all" @click="category = 'all'">{{
        t('devices.workspace.allFields')
      }}</v-btn>
      <v-btn variant="text" :aria-pressed="category === 'scopes'" @click="category = 'scopes'">{{
        t('devices.scopedInventory')
      }}</v-btn>
      <v-btn variant="text" :aria-pressed="category === 'quality'" @click="category = 'quality'">{{
        t('devices.workspace.quality')
      }}</v-btn>
      <FieldLayoutEditor
        v-if="layout && catalog"
        :layout="layout"
        :fields="catalog.fields"
        @saved="layout = $event"
      />
      <p v-if="layoutFailure" role="alert">{{ t('devices.fieldLayoutUnavailable') }}</p>
    </nav>
    <div class="device-inventory-content">
      <ScopedInventory
        v-if="scopeVisited"
        v-show="category === 'scopes'"
        :endpoints="view.endpoints"
        @invalidated="emit('invalidated', $event)"
      />
      <section v-if="category === 'quality'" class="device-section">
        <h2>{{ t('devices.collectionQuality') }}</h2>
        <p>{{ t('devices.trustedAssetsNote') }}</p>
        <details v-for="source in view.inventorySources" :key="source.endpoint">
          <summary>{{ source.endpoint }}</summary>
          <ul>
            <li v-for="quality in source.quality" :key="quality.runId">
              {{ quality.source }} / {{ quality.registration }} /
              {{ quality.registrationGeneration }} · {{ t('devices.runResult.' + quality.result)
              }}<v-btn
                variant="text"
                :disabled="busy"
                @click="collection = { device: source.endpoint, id: quality.runId }"
                >{{ t('devices.evidence') }}</v-btn
              >
              <ul>
                <li v-for="field in quality.fields" :key="field.field">
                  {{ field.field }} · {{ t('devices.quality.' + field.quality) }} ·
                  {{ utc(field.receivedAt) }}
                </li>
              </ul>
            </li>
          </ul>
        </details>
        <CollectionQuality
          v-if="collection"
          :id="collection.id"
          :key="collection.device + collection.id"
          :device="collection.device"
          @invalidated="emit('invalidated', $event)"
        />
      </section>
      <section v-else-if="category !== 'scopes'" class="device-section">
        <div class="device-section-heading">
          <h2>{{ title }}</h2>
          <span class="device-caption"
            >{{ visible.length }} {{ t('devices.workspace.factCount') }}</span
          >
        </div>
        <p class="device-caption">{{ t('devices.noTtl') }}</p>
        <div v-if="all" class="device-filter-grid">
          <v-text-field
            v-model="search"
            :label="t('devices.workspace.searchFacts')"
            type="search"
          />
          <v-select
            v-model="state"
            :items="stateOptions"
            :label="t('devices.workspace.stateFilter')"
          />
        </div>
        <v-tabs
          v-if="all"
          v-model="mode"
          class="device-tabs"
          :aria-label="t('devices.workspace.allFields')"
          ><v-tab value="values">{{ t('devices.workspace.fieldsAndData') }}</v-tab
          ><v-tab value="mapping">{{ t('devices.workspace.mapping') }}</v-tab
          ><v-tab value="raw">{{ t('devices.workspace.raw') }}</v-tab></v-tabs
        >
        <div v-if="viewMode !== 'raw'" class="device-fact-table">
          <v-table
            ><thead>
              <tr>
                <th>{{ t('devices.field') }}</th>
                <th>{{ t('devices.workspace.data') }}</th>
                <th>{{ t('devices.source') }}</th>
                <th>{{ t('devices.workspace.details') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visible" :key="row.key" :data-asset-field="row.key">
                <td>
                  <strong>{{ assetLabel(row.key, locale) }}</strong
                  ><small v-if="all">{{ row.key }}</small>
                </td>
                <td class="device-field-value">
                  <v-chip
                    v-if="row.field?.state.kind !== 'known' && row.list?.state.kind !== 'known'"
                    :color="
                      row.field?.state.kind === 'conflict' || row.list?.state.kind === 'conflict'
                        ? 'warning'
                        : undefined
                    "
                    >{{ summary(row) }}</v-chip
                  ><template v-else>{{ summary(row) }}</template>
                </td>
                <td>
                  <small
                    v-for="source in row.field?.sources"
                    :key="`${source.endpoint}:${source.fact.evidence.source}:${source.fact.evidence.dataset}`"
                    >{{ source.fact.evidence.source }} ·
                    {{ utc(source.fact.evidence.receivedAt) }}</small
                  ><small v-for="source in row.list?.sources" :key="source.cursor"
                    >{{ source.evidence.source }} · {{ utc(source.evidence.receivedAt) }}</small
                  ><small v-if="row.metadata"
                    >{{ row.metadata.kind }} · {{ row.metadata.unit ?? '—' }} ·
                    {{ row.metadata.sensitivity }}</small
                  >
                </td>
                <td>
                  <v-btn
                    variant="text"
                    :aria-label="`${t('devices.workspace.details')}: ${assetLabel(row.key, locale)}`"
                    @click="open(row.key, $event)"
                    >{{ t('devices.workspace.inspect') }}</v-btn
                  >
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <template v-if="all && (viewMode === 'raw' || viewMode === 'mapping')">
          <v-select
            v-model="detailKey"
            :items="visible.map((row) => ({ value: row.key, title: assetLabel(row.key, locale) }))"
            :label="t('devices.workspace.rawField')"
          />
          <template v-if="detail">
            <div v-if="viewMode === 'raw'">
              <p>{{ t('devices.workspace.rawNotice') }}</p>
              <pre class="device-json">{{
                JSON.stringify(
                  detail.field ?? detail.list ?? { field: detail.key, state: 'not_provided' },
                  null,
                  2,
                )
              }}</pre>
            </div>
            <div v-else>
              <p>{{ t('devices.workspace.mappingNote') }}</p>
              <v-btn
                variant="outlined"
                :disabled="mappingOperation.busy.value"
                @click="readReferences()"
                >{{ t('devices.workspace.readMappings') }}</v-btn
              >
              <p v-if="refs && !refs.mappings.length">{{ t('devices.workspace.noMapping') }}</p>
              <article
                v-for="reference in refs?.mappings"
                :key="reference.resource + ':' + reference.version"
                class="device-section"
              >
                <h3>{{ reference.resource }} · {{ reference.version }}</h3>
                <p>{{ reference.state }} · {{ reference.telemetry ? 'telemetry' : 'inventory' }}</p>
                <v-btn
                  variant="text"
                  :disabled="mappingOperation.busy.value"
                  @click="readDefinition(reference)"
                  >{{ t('devices.workspace.readDefinition') }}</v-btn
                >
                <pre
                  v-if="definitions[reference.resource + ':' + reference.version] !== undefined"
                  class="device-json"
                  >{{
                    JSON.stringify(
                      definitions[reference.resource + ':' + reference.version],
                      null,
                      2,
                    )
                  }}</pre
                >
              </article>
              <v-btn
                v-if="refs?.nextCursor"
                variant="text"
                :disabled="mappingOperation.busy.value"
                @click="readReferences(refs.nextCursor)"
                >{{ t('devices.next') }}</v-btn
              >
              <p v-if="mappingOperation.failure.value" role="alert">
                {{ t('devices.' + mappingOperation.failure.value) }}
              </p>
            </div>
            <SourceList
              v-for="source in detail.list?.sources"
              :key="source.cursor"
              :view="view"
              :field="detail.key"
              :source="source"
              @invalidated="emit('invalidated', $event)"
            />
          </template>
        </template>
        <p v-if="!visible.length">{{ t('devices.noInventory') }}</p>
      </section>
      <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    </div>
    <v-dialog
      v-model="detailOpen"
      :aria-label="t('devices.workspace.fieldDetails')"
      @after-leave="restoreFocus"
    >
      <v-card v-if="detail" :title="assetLabel(detail.key, locale)"
        ><v-card-text
          ><AssetValue
            v-if="detail.field"
            :field="{
              field: detail.key,
              state: detail.field.state,
              sources: detail.field.sources.map((s) => s.fact),
            }" />
          <p v-if="!detail.field && !detail.list">{{ t('devices.notProvided') }}</p>
          <SourceList
            v-for="source in detail.list?.sources"
            :key="source.cursor"
            :view="view"
            :field="detail.key"
            :source="source"
            @invalidated="emit('invalidated', $event)" /></v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn variant="text" @click="detailOpen = false">{{
            t('console.close')
          }}</v-btn></v-card-actions
        ></v-card
      >
    </v-dialog>
  </div>
</template>
