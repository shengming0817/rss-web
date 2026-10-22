<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiDialog, UiMessage } from '@rss/core/components'
import PageFrame from '../../../components/PageFrame.vue'
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
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.devices.assets
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const { canWrite } = usePermission('inventory_read', 'inventory_fields_write')
const fields = ref<FieldDefinition[]>([]),
  search = ref(''),
  selected = ref<FieldDefinition>(),
  open = ref(false),
  creating = ref(false)
const key = ref(''),
  unit = ref(''),
  type = ref('number'),
  members = ref('running\nstopped'),
  kind = ref<'gauge' | 'cumulative_counter' | 'delta_counter' | 'state'>('gauge')
const valuePath = ref('[]'),
  intervalPath = ref('null'),
  dimensions = ref('{}'),
  maxResources = ref(1),
  retentionKey = ref(''),
  retentionRevision = ref(1)
const bindingEnabled = ref(true),
  advanced = ref(''),
  references = ref<Record<string, number>>(),
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
type FieldWrite = Operation<{ action: 'put'; definition: ReturnType<typeof fieldInput> }>
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
async function edit(field?: FieldDefinition) {
  if (pending.value) return
  selected.value = field
  creating.value = !field
  key.value = field?.key ?? 'custom.'
  unit.value = field?.unit ?? ''
  type.value = field?.valueType.kind ?? 'number'
  advanced.value = field ? JSON.stringify(field.valueType, null, 2) : ''
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
  if (field)
    await run(
      () => client.fieldReferences(field.key),
      (v) => (references.value = v),
    )
}
function definition() {
  const base = selected.value
    ? fieldInput(selected.value)
    : {
        key: key.value,
        version: 0,
        valueType:
          type.value === 'enum'
            ? { kind: 'enum', values: members.value.split('\n').filter(Boolean) }
            : { kind: type.value },
        nullable: true,
        manual: false,
        sources: { 'agent.native': 0, 'agent.script': 1, 'agent.osquery': 2 },
        platforms: ['windows', 'macos'],
        sensitivity: 'standard',
        unit: unit.value || null,
        searchable: false,
        itemKey: null,
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
      ...(!selected.value && advanced.value ? { valueType: JSON.parse(advanced.value) } : {}),
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
  <PageFrame :title="t('telemetry.metricsSettings')" :busy="busy" :failure="failure"
    ><template #actions
      ><UiButton :disabled="busy || !!pending" @click="load">{{ t('devices.reload') }}</UiButton
      ><UiButton :disabled="!canWrite || !!pending" @click="edit()">{{
        t('telemetry.newField')
      }}</UiButton
      ><UiButton :disabled="!canWrite || !!pending" @click="openRetention">{{
        t('telemetry.retentionPolicies')
      }}</UiButton></template
    >
    <p class="telemetry-caption">{{ t('telemetry.metricsHint') }}</p>
    <nav class="telemetry-tabs">
      <RouterLink :to="{ name: 'settings-overview', params: { tenant: runtime.tenant } }">{{
        t('settings.title')
      }}</RouterLink
      ><RouterLink :to="{ name: 'policy-telemetry', params: { tenant: runtime.tenant } }">{{
        t('telemetry.profiles')
      }}</RouterLink>
    </nav>
    <label class="telemetry-search"
      >{{ t('devices.search') }}<input v-model="search" type="search" class="ui-input"
    /></label>
    <div class="telemetry-table-wrap">
      <table class="telemetry-table">
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
              <UiButton :disabled="busy || !!pending" @click="edit(f)">{{
                t(canWrite ? 'telemetry.configure' : 'telemetry.view')
              }}</UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <UiDialog
      :open="open"
      :title="t(creating ? 'telemetry.newField' : 'telemetry.historyBinding')"
      :close-label="t('console.cancel')"
      placement="right"
      @update:open="!pending && (open = $event)"
      ><section class="telemetry-form">
        <UiMessage v-if="failure" tone="danger" :title="t('devices.' + failure)" />
        <fieldset :disabled="locked || !!pending">
          <label
            >{{ t('telemetry.field') }}<input v-model="key" class="ui-input" :readonly="!creating"
          /></label>
          <div v-if="creating" class="telemetry-toolbar">
            <label
              >{{ t('telemetry.valueType')
              }}<select
                v-model="type"
                :aria-label="t('telemetry.valueType')"
                class="ui-input"
                @change="advanced = ''"
              >
                <option value="number">number</option>
                <option value="integer">integer</option>
                <option value="boolean">boolean</option>
                <option value="enum">enum</option>
              </select></label
            ><label>{{ t('telemetry.unit') }}<input v-model="unit" class="ui-input" /></label>
          </div>
          <label v-if="creating && type === 'enum'"
            >{{ t('telemetry.stateMembers') }}<textarea v-model="members" class="ui-input" />
          </label>
          <details>
            <summary>{{ t('telemetry.valueType') }}</summary>
            <label
              >{{ t('telemetry.canonicalDefinition')
              }}<textarea
                v-model="advanced"
                class="ui-input telemetry-code"
                :readonly="!creating"
              />
            </label>
          </details>
          <p v-if="selected?.timeSeries" class="telemetry-notice">
            {{ t('telemetry.immutableBinding') }}
          </p>
          <label v-else
            ><input v-model="bindingEnabled" type="checkbox" />
            {{ t('telemetry.bindHistory') }}</label
          >
          <fieldset v-if="bindingEnabled" :disabled="!!selected?.timeSeries">
            <label
              >{{ t('telemetry.metricKind')
              }}<select v-model="kind" :aria-label="t('telemetry.metricKind')" class="ui-input">
                <option
                  v-for="k in ['gauge', 'cumulative_counter', 'delta_counter', 'state']"
                  :key="k"
                  :value="k"
                >
                  {{ k }}
                </option>
              </select></label
            ><label
              >{{ t('telemetry.valuePath')
              }}<input v-model="valuePath" class="ui-input telemetry-code" /></label
            ><label
              >{{ t('telemetry.intervalPath')
              }}<input v-model="intervalPath" class="ui-input telemetry-code" /></label
            ><label
              >{{ t('telemetry.dimensions')
              }}<textarea v-model="dimensions" class="ui-input telemetry-code" /></label
            ><label
              >{{ t('telemetry.maxResources')
              }}<input v-model.number="maxResources" type="number" min="1" class="ui-input"
            /></label>
          </fieldset>
          <div v-if="bindingEnabled" class="telemetry-toolbar">
            <label
              >{{ t('telemetry.retentionKey')
              }}<input v-model="retentionKey" class="ui-input" /></label
            ><label
              >{{ t('telemetry.revision')
              }}<input v-model.number="retentionRevision" type="number" min="1" class="ui-input"
            /></label>
          </div>
          <section v-if="references">
            <h3>{{ t('telemetry.references') }}</h3>
            <dl class="telemetry-facts">
              <template v-for="(count, name) in references" :key="name"
                ><dt>{{ t('telemetry.reference.' + name) }}</dt>
                <dd>{{ count }}</dd></template
              >
            </dl>
          </section>
          <p class="telemetry-caption">{{ t('telemetry.newSamplesOnly') }}</p>
          <label
            ><input v-model="confirmed" type="checkbox" /> {{ t('telemetry.confirmField') }}</label
          ><UiButton :disabled="!confirmed" @click="submit">{{
            t('telemetry.saveVersion')
          }}</UiButton>
        </fieldset>
        <WriteRecovery
          v-if="pending && uncertain"
          :id="pending.body.operationId"
          :busy="busy"
          :can-write="canWrite"
          :comparison="comparison"
          @compare="compare"
          @replay="execute"
        /></section
    ></UiDialog>
    <UiDialog
      :open="retentionOpen"
      :title="t('telemetry.retentionPolicies')"
      :close-label="t('console.cancel')"
      placement="right"
      @update:open="!pending && (retentionOpen = $event)"
      ><section class="telemetry-form">
        <p>{{ t('telemetry.retentionHint') }}</p>
        <fieldset :disabled="locked || !!pending">
          <label
            >{{ t('telemetry.retentionKey')
            }}<input v-model="retention.key" class="ui-input" /></label
          ><label
            >{{ t('telemetry.revision')
            }}<input
              v-model.number="retention.revision"
              type="number"
              min="1"
              class="ui-input" /></label
          ><UiButton @click="readRetention">{{ t('telemetry.readRetention') }}</UiButton
          ><label
            v-for="name in ['rawSeconds', 'summarySeconds', 'restoreSeconds'] as const"
            :key="name"
            >{{ t('telemetry.' + name)
            }}<input
              v-model.number="retention[name]"
              type="number"
              min="0"
              class="ui-input" /></label
          ><UiButton @click="saveRetention">{{ t('telemetry.saveVersion') }}</UiButton>
        </fieldset>
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
    ></UiDialog>
  </PageFrame>
</template>
