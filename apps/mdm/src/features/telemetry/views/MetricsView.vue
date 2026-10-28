<script setup lang="ts">
import PolicyFieldset from '../../policies/components/PolicyFieldset.vue'
import PolicyDialog from '../../policies/components/PolicyDialog.vue'

import { VBtn, VTextField, VTable, VAlert, VCheckbox, VSelect, VTextarea } from 'vuetify/components'
import { controlEvent } from '../../policies/control-event'

import { computed, ref, shallowRef, watch, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import MdmPage from '../../../ui/MdmPage.vue'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { usePermission } from '../../enrollment/usePermission'
import {
  fieldDefinition,
  fieldInput,
  retentionPolicy,
  type FieldDefinition,
} from '../../devices/clients/assets'
import WriteRecovery from '../components/WriteRecovery.vue'
import '../telemetry.css'
import FieldTypeEditor from '../components/FieldTypeEditor.vue'
import { sourceIds } from '../../devices/clients/asset-model'
import type { FieldDefinition as Definition, FieldWrite } from '@rss/api/mdm-types'
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.devices.assets
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const permission = usePermission('inventory_read', 'inventory_fields_write'),
  { canWrite } = permission
const canReadReferences = computed(() => canWrite.value && permission.allows('resource_read'))
const fields = ref<FieldDefinition[]>([]),
  search = ref(''),
  selected = ref<FieldDefinition>(),
  open = ref(false),
  creating = ref(false)
const {
  run: runReferences,
  busy: referencesBusy,
  failure: referenceFailure,
} = useOperation([], () => [
  ...deviceBinding(runtime),
  selected.value?.key,
  String(open.value),
  String(canReadReferences.value),
])
let referenceGeneration = 0
const key = ref(''),
  unit = ref(''),
  fieldType = ref<Definition['valueType']>({ kind: 'number' }),
  manual = ref(false),
  nullable = ref(true),
  sources = ref<Record<string, number>>({
    'agent.native': 0,
    'agent.script': 1,
    'agent.osquery': 2,
  }),
  platforms = ref<Definition['platforms']>(['windows', 'macos']),
  sensitivity = ref<'standard' | 'sensitive'>('standard'),
  itemKey = ref(''),
  searchable = ref(false),
  kind = ref<'gauge' | 'cumulative_counter' | 'delta_counter' | 'state'>('gauge')
const valuePath = ref('[]'),
  intervalPath = ref('null'),
  dimensions = ref('{}'),
  maxResources = ref(1),
  retentionKey = ref(''),
  retentionRevision = ref(1)
const bindingEnabled = ref(true),
  references = ref<Awaited<ReturnType<typeof client.fieldReferences>>>(),
  confirmed = ref(false)
const retention = ref({
    key: '',
    revision: 1,
    rawSeconds: 604800,
    summarySeconds: 2592000,
    restoreSeconds: 86400,
  }),
  retentionOpen = ref(false),
  retentionBase = ref(0)
const comparison = ref<unknown>()
type Pending =
  | { kind: 'field'; field: string; body: FieldWrite }
  | { kind: 'retention'; body: Operation<ReturnType<typeof retentionPolicy>> }
const pending = shallowRef<Pending>()
const visible = computed(() =>
  fields.value.filter((f) => f.key.toLowerCase().includes(search.value.toLowerCase())),
)
const locked = computed(() => busy.value || uncertain.value || !canWrite.value)
async function load() {
  fields.value = []
  await run(
    () => client.catalog(),
    (v) => (fields.value = v.fields),
  )
}
async function loadReferences(cursor?: string) {
  const field = selected.value?.key,
    generation = ++referenceGeneration
  references.value = undefined
  if (!field || !canReadReferences.value) return
  await runReferences(
    () => client.fieldReferences(field, cursor),
    (value) => {
      if (generation === referenceGeneration && open.value && field === selected.value?.key)
        references.value = value
    },
  )
}
watch(
  [open, () => selected.value?.key, canReadReferences],
  () => {
    referenceGeneration++
    references.value = undefined
    if (open.value && selected.value && canReadReferences.value) void loadReferences()
  },
  { flush: 'sync' },
)
function edit(field?: FieldDefinition) {
  if (pending.value) return
  selected.value = field
  creating.value = !field
  key.value = field?.key ?? 'custom.'
  unit.value = field?.unit ?? ''
  fieldType.value = field ? structuredClone(toRaw(field.valueType)) : { kind: 'number' }
  manual.value = field?.manual ?? false
  nullable.value = field?.nullable ?? true
  sources.value = {
    ...(field?.sources ?? { 'agent.native': 0, 'agent.script': 1, 'agent.osquery': 2 }),
  }
  platforms.value = field ? [...field.platforms] : ['windows', 'macos']
  sensitivity.value = field?.sensitivity === 'sensitive' ? 'sensitive' : 'standard'
  itemKey.value = field?.itemKey ?? ''
  searchable.value = field?.searchable ?? false
  const b = field?.timeSeries
  bindingEnabled.value = !!b || !field
  kind.value = b?.kind ?? 'gauge'
  valuePath.value = JSON.stringify(b?.valuePath ?? [])
  intervalPath.value = JSON.stringify(b?.intervalStartPath ?? null)
  dimensions.value = JSON.stringify(b?.dimensions ?? {}, null, 2)
  maxResources.value = b?.maxResources ?? 1
  retentionKey.value = b?.retention.key ?? ''
  retentionRevision.value = b?.retention.revision ?? 1
  references.value = undefined
  confirmed.value = false
  comparison.value = undefined
  open.value = true
}
function definition() {
  const base = selected.value
    ? fieldInput(selected.value)
    : {
        key: key.value,
        version: 0,
        valueType: fieldType.value,
        nullable: nullable.value,
        manual: manual.value,
        sources: sources.value,
        platforms: platforms.value,
        sensitivity: sensitivity.value,
        unit: unit.value || null,
        searchable: searchable.value,
        itemKey: itemKey.value || null,
        timeSeries: null,
      }
  const b = selected.value?.timeSeries
  const timeSeries = b
    ? { ...b, retention: { key: retentionKey.value, revision: retentionRevision.value } }
    : bindingEnabled.value
      ? {
          kind: kind.value,
          valuePath: JSON.parse(valuePath.value),
          intervalStartPath: JSON.parse(intervalPath.value),
          dimensions: JSON.parse(dimensions.value),
          maxResources: maxResources.value,
          aggregations:
            kind.value === 'gauge'
              ? ['min', 'max', 'mean', 'count']
              : kind.value === 'state'
                ? ['timeline', 'transitions', 'coverage']
                : kind.value === 'delta_counter'
                  ? ['sum', 'rate']
                  : ['increase', 'rate'],
          retention: { key: retentionKey.value, revision: retentionRevision.value },
        }
      : null
  return fieldInput(
    fieldDefinition({
      ...base,
      version: base.version + 1,
      timeSeries,
      operations: [],
    }),
  )
}
async function submit() {
  if (locked.value || !confirmed.value) return
  try {
    const d = definition()
    pending.value = {
      kind: 'field',
      field: d.key,
      body: operation({ action: 'put', definition: d }, selected.value?.version ?? 0),
    }
    await execute()
  } catch {
    failure.value = 'invalidRequest'
    pending.value = undefined
  }
}
async function execute() {
  const p = pending.value
  if (!p || busy.value) return
  const ok =
    p.kind === 'field'
      ? await runWrite(() => client.writeField(p.field, p.body))
      : await runWrite(() => client.writeRetention(p.body))
  if (pending.value !== p) return
  if (ok) {
    pending.value = undefined
    open.value = false
    retentionOpen.value = false
    await load()
  } else if (!uncertain.value) pending.value = undefined
}
async function compare() {
  const p = pending.value
  if (!p) return
  comparison.value = undefined
  if (p.kind === 'field')
    await run(
      () => client.catalog(),
      (v) => (comparison.value = v.fields.find((f) => f.key === p.field) ?? null),
    )
  else
    await run(
      () => client.retention(p.body.input.key, p.body.input.revision),
      (v) => (comparison.value = v),
    )
}
function openRetention() {
  retentionOpen.value = true
  retentionBase.value = 0
  comparison.value = undefined
}
async function readRetention() {
  comparison.value = undefined
  await run(
    () => client.retention(retention.value.key, retention.value.revision),
    (v) => {
      comparison.value = v
      if (v) {
        retention.value = { ...v, revision: v.revision + 1 }
        retentionBase.value = v.revision
      }
    },
  )
}
async function saveRetention() {
  if (locked.value || pending.value) return
  try {
    const policy = retentionPolicy(retention.value)
    pending.value = { kind: 'retention', body: operation(policy, retentionBase.value) }
    await execute()
  } catch {
    failure.value = 'invalidRequest'
  }
}
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    fields.value = []
    pending.value = undefined
    open.value = false
    retentionOpen.value = false
    comparison.value = undefined
    void load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <MdmPage :title="t('telemetry.metricsSettings')" :busy="busy" :failure="failure"
    ><template #actions
      ><VBtn :disabled="busy || !!pending" @click="load">{{ t('devices.reload') }}</VBtn
      ><VBtn :disabled="!canWrite || !!pending" @click="edit()">{{ t('telemetry.newField') }}</VBtn
      ><VBtn :disabled="!canWrite || !!pending" @click="openRetention">{{
        t('telemetry.retentionPolicies')
      }}</VBtn></template
    >
    <p class="telemetry-caption">{{ t('telemetry.metricsHint') }}</p>
    <nav class="telemetry-tabs">
      <RouterLink :to="{ name: 'policy-policies', params: { tenant: runtime.tenant } }">{{
        t('policies.policies')
      }}</RouterLink
      ><RouterLink :to="{ name: 'policy-telemetry', params: { tenant: runtime.tenant } }">{{
        t('telemetry.profiles')
      }}</RouterLink>
    </nav>
    <label class="telemetry-search"
      >{{ t('devices.search')
      }}<VTextField
        v-model="search"
        type="search"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
    /></label>
    <div class="telemetry-table-wrap">
      <VTable density="comfortable">
        <thead>
          <tr>
            <th>{{ t('telemetry.field') }}</th>
            <th>{{ t('telemetry.valueType') }}</th>
            <th>{{ t('telemetry.historyBinding') }}</th>
            <th>{{ t('telemetry.retention') }}</th>
            <th>{{ t('telemetry.source') }}</th>
            <th>{{ t('telemetry.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in visible" :key="f.key">
            <td>
              <strong>{{ f.key }}</strong
              ><small class="telemetry-caption"> v{{ f.version }} · {{ f.unit ?? '—' }}</small>
            </td>
            <td>{{ f.valueType.kind }}</td>
            <td>{{ f.timeSeries?.kind ?? t('telemetry.unbound') }}</td>
            <td>
              {{
                f.timeSeries
                  ? f.timeSeries.retention.key + ' / ' + f.timeSeries.retention.revision
                  : '—'
              }}
            </td>
            <td>{{ Object.keys(f.sources).join(', ') }}</td>
            <td>
              <VBtn :disabled="busy || !!pending" @click="edit(f)">{{
                t(canWrite ? 'telemetry.configure' : 'telemetry.view')
              }}</VBtn>
            </td>
          </tr>
        </tbody>
      </VTable>
    </div>
    <PolicyDialog
      :open="open"
      :title="t(creating ? 'telemetry.newField' : 'telemetry.historyBinding')"
      :close-label="t('console.cancel')"
      placement="right"
      @update:open="!pending && (open = $event)"
      ><section class="telemetry-form">
        <VAlert v-if="failure" type="error" variant="tonal" :title="t('devices.' + failure)" />
        <PolicyFieldset :disabled="locked || !!pending">
          <label
            >{{ t('telemetry.field')
            }}<VTextField
              v-model="key"
              :readonly="!creating"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
          /></label>
          <PolicyFieldset :disabled="!creating">
            <FieldTypeEditor v-model="fieldType" />
            <label
              >{{ t('telemetry.unit')
              }}<VTextField
                v-model="unit"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
            /></label>
            <label
              ><VCheckbox v-model="manual" hide-details="auto" />{{
                t('telemetry.fieldUi.manual')
              }}</label
            >
            <label
              ><VCheckbox v-model="nullable" hide-details="auto" />{{
                t('telemetry.fieldUi.nullable')
              }}</label
            >
            <label
              ><VCheckbox v-model="searchable" hide-details="auto" />{{
                t('telemetry.fieldUi.searchable')
              }}</label
            >
            <label
              >{{ t('telemetry.fieldUi.sensitivity')
              }}<VSelect
                v-model="sensitivity"
                :items="[
                  { title: 'standard', value: 'standard' },
                  { title: 'sensitive', value: 'sensitive' },
                ]"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
            /></label>
            <label v-if="fieldType.kind === 'array'"
              >{{ t('telemetry.mappingUi.itemKey')
              }}<VSelect
                v-model="itemKey"
                :items="[
                  { title: '—', value: '' },
                  ...(fieldType.items.kind === 'record' || fieldType.items.kind === 'object'
                    ? Object.keys(fieldType.items.properties)
                    : []
                  ).map((name) => ({ title: String(name), value: String(name) })),
                ]"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
            /></label>
            <PolicyFieldset>
              <legend>{{ t('telemetry.fieldUi.platforms') }}</legend>
              <label v-for="platform in ['windows', 'macos']" :key="platform"
                ><VCheckbox v-model="platforms" :value="platform" hide-details="auto" />{{
                  platform
                }}</label
              >
            </PolicyFieldset>
            <PolicyFieldset>
              <legend>{{ t('telemetry.fieldUi.sources') }}</legend>
              <label v-for="source in sourceIds" :key="source"
                ><VCheckbox
                  :model-value="Object.hasOwn(sources, source)"
                  hide-details="auto"
                  @update:model-value="
                    (controlEvent($event).target as HTMLInputElement).checked
                      ? (sources[source] = 0)
                      : delete sources[source]
                  " />{{ source
                }}<VTextField
                  v-if="Object.hasOwn(sources, source)"
                  v-model.number="sources[source]"
                  type="number"
                  min="0"
                  max="65535"
                  :aria-label="source + ' ' + t('telemetry.fieldUi.priority')"
                  variant="outlined"
                  density="comfortable"
                  hide-details="auto"
              /></label>
            </PolicyFieldset>
          </PolicyFieldset>
          <p v-if="selected?.timeSeries" class="telemetry-notice">
            {{ t('telemetry.immutableBinding') }}
          </p>
          <label v-else
            ><VCheckbox v-model="bindingEnabled" hide-details="auto" />
            {{ t('telemetry.bindHistory') }}</label
          >
          <PolicyFieldset v-if="bindingEnabled" :disabled="!!selected?.timeSeries">
            <label
              >{{ t('telemetry.metricKind')
              }}<VSelect
                v-model="kind"
                :aria-label="t('telemetry.metricKind')"
                :items="[
                  ...['gauge', 'cumulative_counter', 'delta_counter', 'state'].map((k) => ({
                    title: String(k),
                    value: k,
                  })),
                ]"
                variant="outlined"
                density="comfortable"
                hide-details="auto" /></label
            ><label
              >{{ t('telemetry.valuePath')
              }}<VTextField
                v-model="valuePath"
                class="telemetry-code"
                variant="outlined"
                density="comfortable"
                hide-details="auto" /></label
            ><label
              >{{ t('telemetry.intervalPath')
              }}<VTextField
                v-model="intervalPath"
                class="telemetry-code"
                variant="outlined"
                density="comfortable"
                hide-details="auto" /></label
            ><label
              >{{ t('telemetry.dimensions')
              }}<VTextarea
                v-model="dimensions"
                class="telemetry-code"
                variant="outlined"
                density="comfortable"
                hide-details="auto" /></label
            ><label
              >{{ t('telemetry.maxResources')
              }}<VTextField
                v-model.number="maxResources"
                type="number"
                min="1"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
            /></label>
          </PolicyFieldset>
          <div v-if="bindingEnabled" class="telemetry-toolbar">
            <label
              >{{ t('telemetry.retentionKey')
              }}<VTextField
                v-model="retentionKey"
                variant="outlined"
                density="comfortable"
                hide-details="auto" /></label
            ><label
              >{{ t('telemetry.revision')
              }}<VTextField
                v-model.number="retentionRevision"
                type="number"
                min="1"
                variant="outlined"
                density="comfortable"
                hide-details="auto"
            /></label>
          </div>
          <p v-if="!canReadReferences">{{ t('telemetry.fieldUi.referencePermission') }}</p>
          <p v-if="referencesBusy" role="status">{{ t('telemetry.fieldUi.referenceLoading') }}</p>
          <p v-if="referenceFailure" role="alert">
            {{ t('devices.' + referenceFailure) }}
            <VBtn :disabled="referencesBusy" @click="loadReferences()">{{
              t('devices.reload')
            }}</VBtn>
          </p>
          <p>{{ t('telemetry.fieldUi.configurationOnly') }}</p>
          <section v-if="references">
            <h3>{{ t('telemetry.references') }}</h3>
            <ul>
              <li
                v-for="mapping in references.mappings"
                :key="mapping.resource + '/' + mapping.version"
              >
                <RouterLink
                  :to="{
                    name: 'policy-resources',
                    params: { tenant: runtime.tenant },
                    query: { resource: mapping.resource, version: mapping.version },
                  }"
                  >{{ mapping.resource }} / {{ mapping.version }}</RouterLink
                >
                · {{ mapping.state }}
              </li>
            </ul>
            <VBtn
              v-if="references.nextCursor"
              :disabled="referencesBusy"
              @click="loadReferences(references.nextCursor)"
              >{{ t('devices.next') }}</VBtn
            >
            <dl class="telemetry-facts">
              <template v-for="(count, name) in references.impact" :key="name"
                ><dt>{{ t('telemetry.reference.' + name) }}</dt>
                <dd>{{ count }}</dd></template
              >
            </dl>
          </section>
          <p class="telemetry-caption">{{ t('telemetry.newSamplesOnly') }}</p>
          <label
            ><VCheckbox v-model="confirmed" hide-details="auto" />
            {{ t('telemetry.confirmField') }}</label
          ><VBtn :disabled="!confirmed" @click="submit">{{ t('telemetry.saveVersion') }}</VBtn>
        </PolicyFieldset>
        <WriteRecovery
          v-if="pending && uncertain"
          :id="pending.body.operationId"
          :busy="busy"
          :can-write="canWrite"
          :comparison="comparison"
          @compare="compare"
          @replay="execute"
        /></section
    ></PolicyDialog>
    <PolicyDialog
      :open="retentionOpen"
      :title="t('telemetry.retentionPolicies')"
      :close-label="t('console.cancel')"
      placement="right"
      @update:open="!pending && (retentionOpen = $event)"
      ><section class="telemetry-form">
        <p>{{ t('telemetry.retentionHint') }}</p>
        <PolicyFieldset :disabled="locked || !!pending">
          <label
            >{{ t('telemetry.retentionKey')
            }}<VTextField
              v-model="retention.key"
              variant="outlined"
              density="comfortable"
              hide-details="auto" /></label
          ><label
            >{{ t('telemetry.revision')
            }}<VTextField
              v-model.number="retention.revision"
              type="number"
              min="1"
              variant="outlined"
              density="comfortable"
              hide-details="auto" /></label
          ><VBtn @click="readRetention">{{ t('telemetry.readRetention') }}</VBtn
          ><label
            v-for="name in ['rawSeconds', 'summarySeconds', 'restoreSeconds'] as const"
            :key="name"
            >{{ t('telemetry.' + name)
            }}<VTextField
              v-model.number="retention[name]"
              type="number"
              min="0"
              variant="outlined"
              density="comfortable"
              hide-details="auto" /></label
          ><VBtn @click="saveRetention">{{ t('telemetry.saveVersion') }}</VBtn>
        </PolicyFieldset>
        <pre v-if="comparison !== undefined">{{ comparison }}</pre>
        <WriteRecovery
          v-if="pending && uncertain"
          :id="pending.body.operationId"
          :busy="busy"
          :can-write="canWrite"
          :comparison="comparison"
          @compare="compare"
          @replay="execute"
        /></section
    ></PolicyDialog>
  </MdmPage>
</template>
