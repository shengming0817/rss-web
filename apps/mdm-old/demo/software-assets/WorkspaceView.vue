<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { VBtn, VSelect, VTextField } from 'vuetify/components'
import MdmPage from '../../src/ui/MdmPage.vue'
import { useDemo } from '../context'
import { useOperation } from '../../src/services/useOperation'
import { useOriginalOperation } from '../../src/services/useOriginalOperation'
import { deviceBinding } from '../../src/features/devices/useDeviceBinding'
import { createSoftwareAssetsDemoClient } from './client'
import {
  emptyFilters,
  modes,
  risks,
  sources,
  type Bucket,
  type Change,
  type Detail,
  type Evidence,
  type Mapping,
  type Mode,
  type Receipt,
  type Result,
  type Snapshot,
  type Standard,
} from './model'
import { useAssetText } from './i18n'
import StandardEditor from './StandardEditor.vue'
import MappingEditor from './MappingEditor.vue'
const props = defineProps<{ section: 'assets' | 'standards' | 'mappings' }>()
const runtime = useDemo(),
  route = useRoute(),
  client = createSoftwareAssetsDemoClient(runtime.transport),
  { t } = useAssetText()
const read = useOperation([], () => deviceBinding(runtime)),
  write = useOriginalOperation(() => 'demo/software-assets/config')
const { busy: reading, failure: readFailure } = read,
  { busy: writing, pending, locked, failure: writeFailure } = write
const config = ref<Snapshot>(),
  result = ref<Result>(),
  detail = ref<Detail>(),
  bucket = ref<Bucket>(),
  filters = ref(emptyFilters()),
  collection = ref<Mode>('normal')
const cursors = ref<(string | undefined)[]>([undefined]),
  pageIndex = ref(0),
  detailCursors = ref<(string | undefined)[]>([undefined]),
  detailIndex = ref(0)
const editing = ref<'standard' | 'mapping' | null>(null),
  standardDraft = ref<Standard | null>(null),
  mappingDraft = ref<Mapping | null>(null),
  deletion = ref<Change | null>(null),
  notice = ref('')
const dimension = ref<'versions' | 'components' | 'publishers' | 'platforms'>('versions')
const busy = computed(() => reading.value || writing.value)
const blocked = computed(() => busy.value || locked.value)
const errorText = computed(() => {
  const failure = readFailure.value ?? writeFailure.value
  if (!failure || pending.value?.state === 'unknown') return ''
  if (failure === 'denied') return t('forbidden')
  if (failure === 'notFound') return t('notFound')
  if (failure === 'conflict' || failure === 'cursorInvalidated')
    return t(pending.value?.state === 'conflict' ? 'conflictWrite' : 'stale')
  return t('failure')
})
const riskItems = computed(() => [
  { title: t('all'), value: '' },
  ...['unclassified', ...risks].map((value) => ({ title: t(value), value })),
])
const groupItems = computed(() =>
  (config.value?.groups ?? []).map((g) => ({ title: g.name, value: g.id })),
)
const standardItems = computed(() => [
  { title: t('all'), value: '' },
  ...(config.value?.standards ?? [])
    .filter((s) => !s.archived)
    .map((s) => ({ title: s.name, value: s.id })),
])
const availableFilters = computed(() => ({
  platform: [
    { title: t('all'), value: '' },
    ...['windows', 'macos'].map((value) => ({ title: t(value), value })),
  ],
  architecture: ['', 'x64', 'arm64'],
  source: [{ title: t('all'), value: '' }, ...sources.map((value) => ({ title: value, value }))],
  resolution: [
    { title: t('all'), value: '' },
    ...['mapped', 'unmapped', 'conflict'].map((value) => ({ title: t(value), value })),
  ],
}))
const headers = computed(() => [
  { title: t('name'), key: 'name', sortable: false },
  { title: t('risk'), key: 'risk', sortable: false },
  { title: t('count'), key: 'deviceCount', sortable: false },
  { title: t('threshold'), key: 'thresholdState', sortable: false },
  { title: t('allowGroups'), key: 'compliance', sortable: false },
  { title: t('actions'), key: 'actions', sortable: false },
])
function invalidate() {
  result.value = undefined
  detail.value = undefined
  bucket.value = undefined
  cursors.value = [undefined]
  pageIndex.value = 0
}
function closeDetail() {
  detail.value = undefined
  bucket.value = undefined
}
async function load() {
  return read.run(
    () => client.read(),
    (value) => {
      if (config.value?.revision !== value.revision) invalidate()
      config.value = value
      collection.value = value.mode
    },
  )
}
async function query() {
  if (blocked.value) return
  detail.value = undefined
  bucket.value = undefined
  const input = JSON.parse(JSON.stringify(filters.value)) as ReturnType<typeof emptyFilters>
  await read.run(
    () => client.query(input),
    (value) => {
      result.value = value
      cursors.value = [undefined]
      pageIndex.value = 0
      notice.value = ''
    },
  )
}
async function turn(next: boolean) {
  const current = result.value
  if (!current || blocked.value) return
  const index = pageIndex.value + (next ? 1 : -1),
    cursor = next ? current.nextCursor : cursors.value[index]
  if (index < 0 || (next && !cursor)) return
  await read.run(
    () => client.page(current.id, cursor ?? undefined),
    (value) => {
      if (next) cursors.value[index] = cursor ?? undefined
      pageIndex.value = index
      result.value = value
    },
  )
}
async function open(row: Bucket) {
  const current = result.value
  if (!current || blocked.value) return
  await read.run(
    () => client.details(current.id, row.id),
    (value) => {
      bucket.value = row
      detail.value = value
      detailCursors.value = [undefined]
      detailIndex.value = 0
    },
  )
}
async function turnDetail(next: boolean) {
  const current = detail.value
  if (!current || blocked.value) return
  const index = detailIndex.value + (next ? 1 : -1),
    cursor = next ? current.nextCursor : detailCursors.value[index]
  if (index < 0 || (next && !cursor)) return
  await read.run(
    () => client.details(current.queryId, current.bucketId, cursor ?? undefined),
    (value) => {
      if (next) detailCursors.value[index] = cursor ?? undefined
      detailIndex.value = index
      detail.value = value
    },
  )
}
function editor(kind: 'standard' | 'mapping', value?: Standard | Mapping) {
  if (blocked.value) return
  editing.value = kind
  if (kind === 'standard') standardDraft.value = value ? ({ ...value } as Standard) : null
  else mappingDraft.value = value ? ({ ...value } as Mapping) : null
}
function mappedFrom(e: Evidence) {
  editor('mapping', {
    id: crypto.randomUUID(),
    revision: 0,
    standardId: config.value?.standards.find((s) => !s.archived)?.id ?? '',
    enabled: true,
    source: sources.find((source) => source === e.source) ?? sources[0],
    platform: e.platform === 'macos' ? 'macos' : 'windows',
    origin: e.origin,
    identity: e.identity,
    publisher: e.publisher,
    version: null,
  })
}
function saved(_receipt: Receipt) {
  editing.value = null
  deletion.value = null
  invalidate()
  notice.value = 'changed'
  void load()
}
async function change(value: Change) {
  if (blocked.value) return
  await write.submit(value, (id, input) => client.change(id, input), saved)
  // Recovery stays reachable outside the modal while the original intent remains locked.
  if (pending.value) {
    closeDetail()
    editing.value = null
    deletion.value = null
  }
}
function saveStandard(value: Standard) {
  void change({
    kind: 'standard',
    action: 'put',
    id: value.id,
    expectedRevision: value.revision,
    value,
  })
}
function saveMapping(value: Mapping) {
  void change({
    kind: 'mapping',
    action: 'put',
    id: value.id,
    expectedRevision: value.revision,
    value,
  })
}
function deleteRecord(kind: 'standard' | 'mapping', value: Standard | Mapping) {
  if (!blocked.value)
    deletion.value = {
      kind,
      action: 'delete',
      id: value.id,
      expectedRevision: value.revision,
      value: null,
    }
}
async function original() {
  const intent = pending.value
  if (intent?.state !== 'unknown') return
  const input = intent.input as Change
  const confirmed = await read.run(
    () => client.receipt(intent.id),
    (value) => {
      if (value.kind !== input.kind || value.target !== input.id)
        throw new Error('Wrong original target')
      write.confirmOriginal(intent.id)
      write.failure.value = null
      saved(value)
      notice.value = 'originalConfirmed'
    },
  )
  if (confirmed) await load()
}
async function replay() {
  const input = pending.value?.input as Change | undefined
  if (input && pending.value?.state === 'unknown')
    await write.submit(input, (id, original) => client.change(id, original), saved, true)
}
async function resolveConflict() {
  write.resolvedConflict()
  write.failure.value = null
  editing.value = null
  deletion.value = null
  await load()
}
async function applyCollection() {
  if (!blocked.value)
    await read.run(
      () => client.collection(collection.value),
      (value) => {
        config.value = value
        invalidate()
        notice.value = 'stale'
      },
    )
}
function standardName(id: string) {
  return config.value?.standards.find((s) => s.id === id)?.name ?? id
}
function groupName(id: string) {
  return config.value?.groups.find((g) => g.id === id)?.name ?? id
}
function amount(value: number | null) {
  return value === null ? t('unknown') : String(value)
}
watch(
  filters,
  () => {
    invalidate()
    notice.value = 'filterChanged'
  },
  { deep: true, flush: 'sync' },
)
watch(readFailure, (value) => {
  if (value === 'denied') {
    config.value = undefined
    invalidate()
  }
})
watch(
  [() => route.fullPath, () => JSON.stringify(deviceBinding(runtime))],
  () => {
    config.value = undefined
    invalidate()
    filters.value = emptyFilters()
    editing.value = null
    deletion.value = null
    notice.value = ''
    void load().then((success) => {
      if (success && props.section === 'assets' && !locked.value) void query()
    })
  },
  { immediate: true },
)
</script>
<template>
  <MdmPage :title="t(section)" :description="t('hint')" :busy="busy">
    <template #actions
      ><v-btn :disabled="busy" @click="load">{{ t('reload') }}</v-btn></template
    >
    <v-alert type="warning" variant="tonal" class="mb-4"
      ><strong>{{ t('demo') }}</strong>
      <p>{{ t('gap') }}</p></v-alert
    >
    <v-tabs :model-value="section" class="mb-4" :aria-label="t('assets')">
      <v-tab
        v-for="item in ['assets', 'standards', 'mappings']"
        :key="item"
        :value="item"
        :to="`/tenants/${runtime.tenant}/software/${item}`"
        >{{ t(item) }}</v-tab
      >
      <v-tab :to="`/tenants/${runtime.tenant}/software`">{{ t('resources') }}</v-tab>
    </v-tabs>
    <v-alert v-if="errorText" type="error" role="alert" class="mb-4">{{ errorText }}</v-alert>
    <v-alert v-if="notice" type="info" class="mb-4" role="status">{{ t(notice) }}</v-alert>
    <v-alert v-if="pending?.state === 'unknown'" type="warning" class="mb-4" role="alert">
      <p>{{ t('pending') }}</p>
      <code>{{ pending.id }}</code>
      <div class="device-actions">
        <v-btn :disabled="busy" @click="original">{{ t('checkOriginal') }}</v-btn
        ><v-btn :disabled="busy" @click="replay">{{ t('replay') }}</v-btn>
      </div>
    </v-alert>
    <v-btn
      v-if="pending?.state === 'conflict'"
      class="mb-4"
      :disabled="busy"
      @click="resolveConflict"
      >{{ t('dismissConflict') }}</v-btn
    >

    <template v-if="config && section === 'assets'">
      <v-card :title="t('filter')" class="mb-4">
        <v-card-text>
          <div class="asset-grid">
            <v-select
              v-model="filters.groups"
              :items="groupItems"
              :label="t('groupFilter')"
              multiple
              chips
              :disabled="blocked"
            />
            <v-select
              v-model="filters.groupMode"
              :items="[
                { title: t('union'), value: 'any' },
                { title: t('intersection'), value: 'all' },
              ]"
              :label="t('groupMode')"
              :disabled="blocked"
            />
            <v-text-field v-model="filters.device" :label="t('device')" :disabled="blocked" />
            <v-select
              v-model="filters.platform"
              :items="availableFilters.platform"
              :label="t('platform')"
              :disabled="blocked"
            />
            <v-select
              v-model="filters.architecture"
              :items="availableFilters.architecture"
              :label="t('architecture')"
              :disabled="blocked"
            />
            <v-text-field v-model="filters.name" :label="t('software')" :disabled="blocked" />
            <v-text-field v-model="filters.version" :label="t('version')" :disabled="blocked" />
            <v-text-field v-model="filters.publisher" :label="t('publisher')" :disabled="blocked" />
            <v-select
              v-model="filters.source"
              :items="availableFilters.source"
              :label="t('source')"
              :disabled="blocked"
            />
            <v-select
              v-model="filters.standardId"
              :items="standardItems"
              :label="t('standard')"
              :disabled="blocked"
            />
            <v-select
              v-model="filters.risk"
              :items="riskItems"
              :label="t('risk')"
              :disabled="blocked"
            />
            <v-text-field v-model="filters.mark" :label="t('mark')" :disabled="blocked" />
            <v-select
              v-model="filters.resolution"
              :items="availableFilters.resolution"
              :label="t('resolution')"
              :disabled="blocked"
            />
          </div>
          <p>{{ t('searchHelp') }}</p>
        </v-card-text>
        <v-card-actions
          ><v-btn :disabled="blocked" @click="filters = emptyFilters()">{{ t('clear') }}</v-btn
          ><v-spacer /><v-btn color="primary" :disabled="blocked" @click="query">{{
            t('refresh')
          }}</v-btn></v-card-actions
        >
      </v-card>
      <v-card class="mb-4"
        ><v-card-text class="asset-mode"
          ><v-select
            v-model="collection"
            :items="
              modes.map((value) => ({
                value,
                title: t(value === 'conflict' ? 'conflictMode' : value),
              }))
            "
            :label="t('mode')"
            :disabled="blocked"
            hide-details
          /><v-btn :disabled="blocked" @click="applyCollection">{{
            t('applyMode')
          }}</v-btn></v-card-text
        ></v-card
      >
      <template v-if="result">
        <v-card class="mb-4" :title="t('coverage')"
          ><v-card-text>
            <div class="device-actions">
              <v-chip>{{ t('current') }}: {{ result.coverage.current }}</v-chip
              ><v-chip color="warning">{{ t('retained') }}: {{ result.coverage.retained }}</v-chip
              ><v-chip>{{ t('unknown') }}: {{ result.coverage.unknown }}</v-chip
              ><v-chip color="error">{{ t('conflict') }}: {{ result.coverage.conflict }}</v-chip
              ><v-chip>{{ t('knownEmpty') }}: {{ result.coverage.empty }}</v-chip>
            </div>
            <p>
              {{ t('devices') }}: {{ amount(result.devices) }} · {{ t('range') }}:
              {{ result.totalRows }}
            </p>
            <p>{{ t('totalsHint') }}</p>
            <p>{{ t('fixedScope') }}</p>
            <code>{{ result.watermark }}</code>
            <v-alert
              v-if="result.coverage.unknown || result.coverage.conflict"
              type="warning"
              variant="tonal"
              class="mt-3"
              >{{ t('incomplete') }}</v-alert
            >
          </v-card-text></v-card
        >
        <v-data-table
          :headers="headers"
          :items="result.rows"
          item-value="id"
          :items-per-page="-1"
          hide-default-footer
          :no-data-text="t('noRows')"
        >
          <template #[`item.name`]="{ item }"
            ><strong>{{ item.name }}</strong>
            <div>
              <v-chip size="small" :color="item.resolution === 'conflict' ? 'error' : undefined">{{
                t(item.resolution)
              }}</v-chip
              ><v-chip v-for="mark in item.marks" :key="mark" size="small">{{ mark }}</v-chip>
            </div></template
          >
          <template #[`item.risk`]="{ item }">{{ t(item.risk ?? 'unclassified') }}</template>
          <template #[`item.deviceCount`]="{ item }">{{ amount(item.deviceCount) }}</template>
          <template #[`item.thresholdState`]="{ item }"
            ><v-chip :color="item.thresholdState === 'reached' ? 'warning' : undefined">{{
              t(`threshold_${item.thresholdState}`)
            }}</v-chip>
            <div v-if="item.threshold !== null">
              {{ t('assessment') }}: {{ amount(item.assessmentCount) }} / {{ item.threshold }}
            </div></template
          >
          <template #[`item.compliance`]="{ item }"
            ><div>{{ t(`compliance_${item.compliance.state}`) }}</div>
            <template v-if="item.compliance.state !== 'disabled'"
              ><div>
                {{ t('allowed') }}: {{ item.compliance.allowed }} · {{ t('denied') }}:
                {{ item.compliance.denied }}
              </div>
              <div v-if="item.compliance.unknown">
                {{ t('unknown') }}: {{ item.compliance.unknown }}
              </div></template
            ></template
          >
          <template #[`item.actions`]="{ item }"
            ><v-btn variant="text" :disabled="blocked" @click="open(item)">{{
              t('details')
            }}</v-btn></template
          >
        </v-data-table>
        <div class="device-actions my-4">
          <v-btn :disabled="blocked || pageIndex === 0" @click="turn(false)">{{
            t('previous')
          }}</v-btn
          ><span>{{ pageIndex + 1 }}</span
          ><v-btn :disabled="blocked || !result.nextCursor" @click="turn(true)">{{
            t('next')
          }}</v-btn>
        </div>
      </template>
    </template>

    <template v-if="config && section === 'standards'">
      <v-btn color="primary" class="mb-4" :disabled="blocked" @click="editor('standard')">{{
        t('addStandard')
      }}</v-btn>
      <v-table
        ><thead>
          <tr>
            <th>{{ t('name') }}</th>
            <th>{{ t('risk') }}</th>
            <th>{{ t('threshold') }}</th>
            <th>{{ t('allowGroups') }}</th>
            <th>{{ t('status') }}</th>
            <th>{{ t('actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in config.standards" :key="item.id">
            <td>
              <strong>{{ item.name }}</strong>
              <div v-for="mark in item.marks" :key="mark">
                <v-chip size="small">{{ mark }}</v-chip>
              </div>
              <small>{{ item.id }} · r{{ item.revision }}</small>
            </td>
            <td>{{ t(item.risk ?? 'unclassified') }}</td>
            <td>{{ item.threshold ?? t('disabled') }}</td>
            <td>
              <template v-if="item.allowedGroups"
                ><div v-for="id in item.allowedGroups" :key="id">{{ groupName(id) }}</div></template
              ><template v-else>{{ t('disabled') }}</template>
            </td>
            <td>{{ t(item.archived ? 'archived' : 'active') }}</td>
            <td>
              <div class="device-actions">
                <v-btn variant="text" :disabled="blocked" @click="editor('standard', item)">{{
                  t('edit')
                }}</v-btn
                ><v-btn
                  variant="text"
                  :disabled="blocked"
                  @click="
                    item.archived
                      ? saveStandard({ ...item, archived: false })
                      : change({
                          kind: 'standard',
                          action: 'archive',
                          id: item.id,
                          expectedRevision: item.revision,
                          value: null,
                        })
                  "
                  >{{ t(item.archived ? 'restore' : 'archive') }}</v-btn
                ><v-btn
                  variant="text"
                  color="error"
                  :disabled="blocked"
                  @click="deleteRecord('standard', item)"
                  >{{ t('delete') }}</v-btn
                >
              </div>
            </td>
          </tr>
        </tbody></v-table
      >
      <p class="mt-4">{{ t('fixedScope') }}</p>
      <p>{{ t('allowHint') }}</p>
    </template>

    <template v-if="config && section === 'mappings'">
      <v-btn color="primary" class="mb-4" :disabled="blocked" @click="editor('mapping')">{{
        t('addMapping')
      }}</v-btn
      ><v-alert type="info" variant="tonal" class="mb-4">{{ t('mappingHint') }}</v-alert>
      <v-table
        ><thead>
          <tr>
            <th>{{ t('identity') }}</th>
            <th>{{ t('standard') }}</th>
            <th>{{ t('source') }}</th>
            <th>{{ t('status') }}</th>
            <th>{{ t('actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in config.mappings" :key="item.id">
            <td>
              {{ item.identity }}
              <div>{{ item.publisher }} · {{ item.version ?? t('any') }}</div>
              <small>{{ item.id }} · r{{ item.revision }}</small>
            </td>
            <td>{{ standardName(item.standardId) }}</td>
            <td>
              {{ item.source }}
              <div>{{ t(item.platform) }} · {{ item.origin ?? t('any') }}</div>
            </td>
            <td>{{ t(item.enabled ? 'enabled' : 'disabled') }}</td>
            <td>
              <div class="device-actions">
                <v-btn variant="text" :disabled="blocked" @click="editor('mapping', item)">{{
                  t('edit')
                }}</v-btn
                ><v-btn
                  variant="text"
                  :disabled="blocked"
                  @click="saveMapping({ ...item, enabled: !item.enabled })"
                  >{{ t(item.enabled ? 'disable' : 'enable') }}</v-btn
                ><v-btn
                  variant="text"
                  color="error"
                  :disabled="blocked"
                  @click="deleteRecord('mapping', item)"
                  >{{ t('delete') }}</v-btn
                >
              </div>
            </td>
          </tr>
        </tbody></v-table
      >
      <p v-if="!config.mappings.length">{{ t('noMappings') }}</p>
    </template>

    <v-dialog
      :model-value="!!detail"
      max-width="1280"
      :persistent="blocked"
      @update:model-value="
        (value) => {
          if (!value) {
            detail = undefined
            bucket = undefined
          }
        }
      "
    >
      <v-card v-if="detail && bucket" :title="bucket.name"
        ><v-card-text>
          <p>{{ t('evidenceHint') }}</p>
          <p>{{ t('count') }}: {{ amount(bucket.deviceCount) }}</p>
          <v-select
            v-model="dimension"
            :items="
              ['versions', 'components', 'publishers', 'platforms'].map((value) => ({
                value,
                title: t(value),
              }))
            "
            :label="t('filter')"
          />
          <v-table density="compact"
            ><thead>
              <tr>
                <th>{{ t(dimension) }}</th>
                <th>{{ t('devices') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="facet in bucket[dimension]" :key="facet.value">
                <td>{{ facet.value }}</td>
                <td>{{ facet.devices }}</td>
              </tr>
            </tbody></v-table
          >
          <v-alert v-if="!detail.devices.length" type="info" variant="tonal">{{
            t('noDevices')
          }}</v-alert>
          <v-card
            v-for="device in detail.devices"
            :key="device.id"
            :title="device.name"
            variant="outlined"
            class="my-4"
            ><v-card-text>
              <p>
                <code>{{ device.id }}</code> ·
                {{ t(device.verdict === 'disabled' ? 'compliance_disabled' : device.verdict) }}
              </p>
              <v-table density="compact"
                ><thead>
                  <tr>
                    <th>{{ t('identity') }}</th>
                    <th>{{ t('versions') }} / {{ t('components') }}</th>
                    <th>{{ t('scope') }}</th>
                    <th>{{ t('source') }}</th>
                    <th>{{ t('observation') }}</th>
                    <th>{{ t('mappingIds') }}</th>
                    <th>{{ t('actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in device.evidence" :key="e.id">
                    <td>
                      {{ e.name }}
                      <div>{{ e.identity }} · {{ e.publisher }}</div>
                    </td>
                    <td>{{ e.version }} / {{ e.component }}</td>
                    <td>{{ e.scope }}</td>
                    <td>
                      {{ e.source }}
                      <div>{{ e.platform }} · {{ e.origin }}</div>
                    </td>
                    <td>
                      {{ e.observedAt
                      }}<v-chip size="small" :color="e.retained ? 'warning' : 'success'">{{
                        t(e.retained ? 'retained' : 'current')
                      }}</v-chip>
                    </td>
                    <td>
                      <div v-for="id in e.mappingIds" :key="id">
                        <code>{{ id }}</code>
                      </div>
                      <div v-for="id in e.standardIds" :key="id">{{ standardName(id) }}</div>
                      <v-chip v-if="e.standardIds.length > 1" color="error">{{
                        t('conflict')
                      }}</v-chip>
                    </td>
                    <td>
                      <v-btn variant="text" :disabled="blocked" @click="mappedFrom(e)">{{
                        t('addMapping')
                      }}</v-btn>
                    </td>
                  </tr>
                </tbody></v-table
              >
            </v-card-text></v-card
          >
          <div class="device-actions">
            <v-btn :disabled="blocked || detailIndex === 0" @click="turnDetail(false)">{{
              t('previous')
            }}</v-btn
            ><span>{{ detailIndex + 1 }}</span
            ><v-btn :disabled="blocked || !detail.nextCursor" @click="turnDetail(true)">{{
              t('next')
            }}</v-btn>
          </div> </v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn :disabled="blocked" @click="closeDetail">{{
            t('back')
          }}</v-btn></v-card-actions
        ></v-card
      >
    </v-dialog>
    <v-dialog
      :model-value="!!editing"
      max-width="800"
      :persistent="locked"
      @update:model-value="
        (value) => {
          if (!value && !locked) editing = null
        }
      "
    >
      <StandardEditor
        v-if="editing === 'standard' && config"
        :initial="standardDraft"
        :groups="config.groups"
        :locked="blocked"
        @save="saveStandard"
        @cancel="editing = null"
      />
      <MappingEditor
        v-if="editing === 'mapping' && config"
        :initial="mappingDraft"
        :standards="config.standards"
        :locked="blocked"
        @save="saveMapping"
        @cancel="editing = null"
      />
    </v-dialog>
    <v-dialog
      :model-value="!!deletion"
      max-width="580"
      :persistent="locked"
      @update:model-value="
        (value) => {
          if (!value && !locked) deletion = null
        }
      "
      ><v-card :title="t('confirmDelete')"
        ><v-card-text>{{ t('deleteHint') }}</v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn :disabled="blocked" @click="deletion = null">{{ t('cancel') }}</v-btn
          ><v-btn color="error" :disabled="blocked" @click="deletion && change(deletion)">{{
            t('confirm')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
  </MdmPage>
</template>
<style scoped>
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px;
}
.asset-form {
  display: grid;
  gap: 8px;
}
.asset-mode {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}
.asset-mode > :first-child {
  min-width: 240px;
  flex: 1;
}
td {
  vertical-align: top;
  padding-block: 12px !important;
}
code,
small {
  overflow-wrap: anywhere;
}
</style>
