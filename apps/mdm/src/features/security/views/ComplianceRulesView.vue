<script setup lang="ts">
import { onMounted, ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { Criteria, FieldDefinition } from '../../devices/clients/assets'
import {
  platforms,
  severities,
  type ComplianceDefinition,
  type ComplianceRule,
  type ComplianceTask,
} from '../clients/compliance-model'
import CriteriaEditor from '../../devices/components/CriteriaEditor.vue'
import SecurityFrame from '../components/SecurityFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.compliance,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const list = ref<Awaited<ReturnType<typeof client.list>>>(),
  fields = ref<FieldDefinition[]>([]),
  groups = ref<Awaited<ReturnType<typeof runtime.devices.directory.groups>>>(),
  current = ref<ComplianceRule>(),
  historical = ref<ComplianceRule>(),
  id = ref(''),
  version = ref(1),
  name = ref(''),
  enabled = ref(true),
  severity = ref<ComplianceDefinition['severity']>('medium'),
  platform = ref<ComplianceDefinition['platform']>('all'),
  target = ref<'all' | 'groups'>('all'),
  groupIds = ref(''),
  criteria = ref<Criteria | null>(null),
  taskId = ref(''),
  task = ref<ComplianceTask>(),
  editable = ref(true)
let pending: (() => Promise<void>) | undefined
function load(after?: string) {
  void run(
    () => client.list(after),
    (v) => (list.value = v),
  )
}
function apply(v: ComplianceRule) {
  editable.value = true
  current.value = v
  id.value = v.id
  name.value = v.definition.name
  enabled.value = v.definition.enabled
  severity.value = v.definition.severity
  platform.value = v.definition.platform
  target.value = v.definition.target.kind
  groupIds.value = v.definition.target.kind === 'groups' ? v.definition.target.ids.join('\n') : ''
  criteria.value = structuredClone(v.definition.criteria)
}
function clearTask() {
  taskId.value = ''
  task.value = undefined
  historical.value = undefined
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  id.value = crypto.randomUUID()
  name.value = ''
  enabled.value = true
  editable.value = true
  pending = undefined
  severity.value = 'medium'
  platform.value = 'all'
  target.value = 'all'
  groupIds.value = ''
  criteria.value = null
  clearTask()
}
async function open(value = id.value, selectedTask?: string) {
  if (busy.value || uncertain.value) return
  create()
  id.value = value
  editable.value = false
  const loaded = await run(() => client.read(value), apply)
  if (loaded && selectedTask) {
    taskId.value = selectedTask
    refreshTask()
  }
}
function save() {
  if (busy.value || uncertain.value || !criteria.value || !editable.value) return
  const rule = current.value?.id ?? id.value,
    body = operation(
      {
        name: name.value,
        severity: severity.value,
        enabled: enabled.value,
        platform: platform.value,
        target:
          target.value === 'all'
            ? { kind: 'all' as const }
            : { kind: 'groups' as const, ids: groupIds.value.split(/\s+/).filter(Boolean) },
        criteria: structuredClone(toRaw(criteria.value)),
      },
      current.value?.revision ?? 0,
    )
  pending = async () => {
    const written = await runWrite(
      () => client.put(rule, body),
      (v) => {
        clearTask()
        taskId.value = v.task ?? ''
        list.value = undefined
        editable.value = false
      },
    )
    if (written) await run(() => client.read(rule), apply)
  }
  void pending()
}
function recompute() {
  if (!current.value || busy.value || uncertain.value) return
  const rule = current.value.id,
    body = operation({}, current.value.revision)
  pending = async () => {
    await runWrite(
      () => client.recompute(rule, body),
      (v) => {
        taskId.value = v.task
        task.value = undefined
      },
    )
  }
  void pending()
}
function refreshTask() {
  const rule = current.value?.id ?? id.value,
    selected = taskId.value
  if (selected)
    void run(
      () => client.task(rule, selected),
      (v) => (task.value = v),
    )
}
function loadVersion() {
  const rule = current.value?.id ?? id.value,
    revision = version.value
  historical.value = undefined
  void run(
    () => client.version(rule, revision),
    (v) => (historical.value = v),
  )
}
function groupPage(cursor?: string) {
  void run(
    () => runtime.devices.directory.groups(cursor),
    (v) => (groups.value = v),
  )
}
function addGroup(group: string) {
  groupIds.value = [...new Set([...groupIds.value.split(/\s+/).filter(Boolean), group])].join('\n')
}
function routeRule() {
  create()
  const rule = route.query['rule'],
    selectedTask = route.query['task']
  if (typeof rule === 'string')
    void open(rule, typeof selectedTask === 'string' ? selectedTask : undefined)
}
watch(() => route.fullPath, routeRule, { flush: 'sync' })
onMounted(async () => {
  const initial = route.fullPath
  create()
  await run(
    () => client.list(),
    (v) => (list.value = v),
  )
  if (route.fullPath !== initial) return
  await run(
    () => runtime.devices.assets.catalog(),
    (v) => (fields.value = v.fields),
  )
  if (route.fullPath === initial) routeRule()
})
</script>
<template>
  <SecurityFrame :title="t('security.rules')" :busy="busy" :failure="failure">
    <p>{{ t('security.ruleHint') }}</p>
    <button :disabled="busy || uncertain" data-testid="new-rule" @click="create">
      {{ t('devices.create') }}
    </button>
    <button :disabled="busy" @click="load()">{{ t('devices.reload') }}</button>
    <p v-if="list && !list.items.length">{{ t('security.empty') }}</p>
    <ul>
      <li v-for="rule in list?.items" :key="rule.id">
        <button :disabled="busy || uncertain" @click="open(rule.id)">
          {{ rule.definition.name }}
        </button>
        · {{ rule.revision }} · {{ t(`security.severity.${rule.definition.severity}`) }} ·
        {{ t(rule.definition.enabled ? 'security.enabled' : 'security.disabled') }}
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <form data-testid="open-rule" @submit.prevent="open()">
      <label
        >{{ t('security.ruleId')
        }}<input v-model="id" required :readonly="busy || uncertain || !!current" /></label
      ><button :disabled="busy || uncertain">{{ t('devices.open') }}</button>
    </form>
    <p v-if="current">{{ t('devices.revision') }} {{ current.revision }}</p>
    <form data-testid="edit-rule" @submit.prevent="save">
      <fieldset :disabled="busy || uncertain || !editable">
        <label
          >{{ t('devices.name')
          }}<input v-model="name" data-testid="rule-name" maxlength="128" required
        /></label>
        <label><input v-model="enabled" type="checkbox" />{{ t('security.enabled') }}</label>
        <label
          >{{ t('security.severityLabel')
          }}<select v-model="severity">
            <option v-for="value in severities" :key="value" :value="value">
              {{ t(`security.severity.${value}`) }}
            </option>
          </select></label
        >
        <label
          >{{ t('security.platform')
          }}<select v-model="platform">
            <option v-for="value in platforms" :key="value" :value="value">
              {{ t(`security.platforms.${value}`) }}
            </option>
          </select></label
        >
        <label
          >{{ t('security.target')
          }}<select v-model="target">
            <option value="all">{{ t('devices.all') }}</option>
            <option value="groups">{{ t('devices.groups') }}</option>
          </select></label
        >
        <template v-if="target === 'groups'">
          <label
            >{{ t('security.groupIds') }}<textarea v-model="groupIds" required rows="3" />
          </label>
          <button type="button" @click="groupPage()">{{ t('security.chooseGroups') }}</button>
          <ul>
            <li v-for="group in groups?.items" :key="group.id">
              <button type="button" @click="addGroup(group.id)">{{ group.name }}</button> ·
              {{ group.id }}
            </li>
          </ul>
          <button v-if="groups?.nextCursor" type="button" @click="groupPage(groups.nextCursor)">
            {{ t('devices.next') }}
          </button>
        </template>
        <CriteriaEditor v-model="criteria" :fields="fields" />
        <p v-if="!criteria">{{ t('security.criteriaRequired') }}</p>
        <button :disabled="!criteria" data-testid="save-rule">{{ t('devices.save') }}</button>
      </fieldset>
    </form>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button>
    <button v-if="current?.definition.enabled" :disabled="busy || uncertain" @click="recompute">
      {{ t('security.recompute') }}
    </button>
    <section v-if="current">
      <h2>{{ t('security.immutableVersion') }}</h2>
      <form @submit.prevent="loadVersion">
        <label
          >{{ t('devices.revision')
          }}<input
            v-model.number="version"
            type="number"
            min="1"
            :max="current.revision"
            required /></label
        ><button :disabled="busy">{{ t('devices.open') }}</button>
      </form>
      <div v-if="historical" data-testid="rule-version">
        <p>
          {{ historical.definition.name }} · {{ historical.revision }} ·
          {{ t(`security.severity.${historical.definition.severity}`) }} ·
          {{ t(`security.platforms.${historical.definition.platform}`) }} ·
          {{ t(historical.definition.enabled ? 'security.enabled' : 'security.disabled') }}
        </p>
        <p>
          {{
            historical.definition.target.kind === 'all'
              ? t('devices.all')
              : historical.definition.target.ids.join(', ')
          }}
        </p>
        <fieldset disabled>
          <CriteriaEditor :model-value="historical.definition.criteria" :fields="fields" />
        </fieldset>
      </div>
    </section>
    <section v-if="id">
      <h2>{{ t('security.evaluationTask') }}</h2>
      <form @submit.prevent="refreshTask">
        <label
          >{{ t('security.taskId')
          }}<input v-model="taskId" required :readonly="busy" @input="task = undefined" /></label
        ><button :disabled="busy">{{ t('policies.refresh') }}</button>
      </form>
      <dl v-if="task" data-testid="evaluation-task">
        <dt>{{ t('security.phase') }}</dt>
        <dd>{{ t(`security.state.${task.phase}`) }}</dd>
        <dt>{{ t('security.ruleRevision') }}</dt>
        <dd>{{ task.ruleVersion }}</dd>
        <dt>{{ t('security.watermark') }}</dt>
        <dd>{{ task.factWatermark }}</dd>
        <dt>{{ t('security.processed') }}</dt>
        <dd>{{ task.processed }}</dd>
        <dt>{{ t('security.failure') }}</dt>
        <dd>{{ task.failure ?? '—' }}</dd>
        <dt>{{ t('security.diagnostic') }}</dt>
        <dd>{{ task.diagnostic ? t('security.groupInputPending') : '—' }}</dd>
      </dl>
    </section>
  </SecurityFrame>
</template>
