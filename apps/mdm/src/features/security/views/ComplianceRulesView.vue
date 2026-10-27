<script setup lang="ts">
import { deviceBinding } from '../../devices/useDeviceBinding'
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCheckbox,
  VCol,
  VExpansionPanel,
  VExpansionPanels,
  VList,
  VListItem,
  VRow,
  VSelect,
  VTable,
  VTextarea,
  VTextField,
} from 'vuetify/components'
import { onMounted, ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { InventoryCondition, FieldDefinition } from '../../devices/clients/assets'
import {
  platforms,
  severities,
  type ComplianceDefinition,
  type ComplianceRule,
  type ComplianceTask,
} from '../clients/compliance-model'
import ConditionEditor from '../../devices/components/ConditionEditor.vue'
import MdmPage from '../../../ui/MdmPage.vue'
const editorOpen = ref(false)
function beginCreate() {
  if (busy.value || uncertain.value) return
  create()
  editorOpen.value = true
}
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.compliance,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const list = ref<Awaited<ReturnType<typeof client.list>>>(),
  fields = ref<FieldDefinition[]>([]),
  groups = ref<Awaited<ReturnType<typeof runtime.devices.groups.list>>>(),
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
  criteria = ref<InventoryCondition | null>(null),
  taskId = ref(''),
  task = ref<ComplianceTask>(),
  editable = ref(true)
let pending: (() => Promise<void>) | undefined
function load(after?: string) {
  list.value = undefined
  void run(
    () => client.list({ cursor: after }),
    (v) => (list.value = v),
  )
}
function apply(v: ComplianceRule) {
  editable.value = true
  current.value = v
  editorOpen.value = true
  id.value = v.id
  name.value = v.definition.presentation.name
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
  editorOpen.value = false
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
        presentation: {
          ...structuredClone(toRaw(current.value?.definition.presentation ?? {})),
          name: name.value,
        },
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
    () => runtime.devices.groups.list({ cursor }),
    (v) =>
      (groups.value = {
        ...v,
        items: v.items.filter((group) => group.assetContext === 'endpoint'),
      }),
  )
}
function addGroup(group: string) {
  if (!groups.value?.items.some((g) => g.id === group && g.assetContext === 'endpoint')) return
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
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    list.value = undefined
    current.value = undefined
    historical.value = undefined
    fields.value = []
    groups.value = undefined
    pending = undefined
    task.value = undefined
    taskId.value = ''
    id.value = ''
    editorOpen.value = false
  },
  { flush: 'sync' },
)
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
  <MdmPage
    :title="t('security.rules')"
    :description="t('security.ruleHint')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><v-btn :disabled="busy || uncertain" data-testid="new-rule" @click="beginCreate">{{
        t('devices.create')
      }}</v-btn
      ><v-btn variant="tonal" :disabled="busy" @click="load()">{{
        t('devices.reload')
      }}</v-btn></template
    >
    <v-card class="mb-4"
      ><v-table :aria-label="t('security.rules')"
        ><thead>
          <tr>
            <th>{{ t('devices.name') }}</th>
            <th>{{ t('devices.revision') }}</th>
            <th>{{ t('security.severityLabel') }}</th>
            <th>{{ t('settings.state') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in list?.items" :key="rule.id">
            <td>
              <v-btn variant="text" :disabled="busy || uncertain" @click="open(rule.id)">{{
                rule.definition.presentation.name
              }}</v-btn>
            </td>
            <td>{{ rule.revision }}</td>
            <td>{{ t(`security.severity.${rule.definition.severity}`) }}</td>
            <td>{{ t(rule.definition.enabled ? 'security.enabled' : 'security.disabled') }}</td>
          </tr>
          <tr v-if="list && !list.items.length">
            <td colspan="4">{{ t('security.empty') }}</td>
          </tr>
        </tbody></v-table
      ><v-btn
        v-if="list?.nextCursor"
        variant="text"
        :disabled="busy"
        @click="load(list.nextCursor)"
        >{{ t('devices.next') }}</v-btn
      ></v-card
    >
    <v-expansion-panels class="mb-4"
      ><v-expansion-panel :title="t('console.advanced')" eager
        ><template #text
          ><form data-testid="open-rule" @submit.prevent="open()">
            <v-text-field
              v-model="id"
              :label="t('security.ruleId')"
              required
              :readonly="busy || uncertain || !!current"
            /><v-btn :disabled="busy || uncertain" type="submit">{{ t('devices.open') }}</v-btn>
          </form></template
        ></v-expansion-panel
      ></v-expansion-panels
    >
    <v-card v-if="editorOpen || current || uncertain" :title="t('console.edit')" class="mb-4"
      ><v-card-text
        ><p v-if="current" class="mb-3">{{ t('devices.revision') }} {{ current.revision }}</p>
        <form data-testid="edit-rule" @submit.prevent="save">
          <fieldset :disabled="busy || uncertain || !editable" class="security-fieldset">
            <v-text-field
              v-model="name"
              :label="t('devices.name')"
              data-testid="rule-name"
              maxlength="128"
              required
              :disabled="busy || uncertain || !editable"
            />
            <v-checkbox
              v-model="enabled"
              :label="t('security.enabled')"
              :disabled="busy || uncertain || !editable"
            />
            <v-row
              ><v-col cols="12" md="4"
                ><v-select
                  v-model="severity"
                  :label="t('security.severityLabel')"
                  :items="
                    severities.map((value) => ({ value, title: t(`security.severity.${value}`) }))
                  "
                  :disabled="busy || uncertain || !editable" /></v-col
              ><v-col cols="12" md="4"
                ><v-select
                  v-model="platform"
                  :label="t('security.platform')"
                  :items="
                    platforms.map((value) => ({ value, title: t(`security.platforms.${value}`) }))
                  "
                  :disabled="busy || uncertain || !editable" /></v-col
              ><v-col cols="12" md="4"
                ><v-select
                  v-model="target"
                  :label="t('security.target')"
                  :items="[
                    { value: 'all', title: t('devices.all') },
                    { value: 'groups', title: t('devices.groups') },
                  ]"
                  :disabled="busy || uncertain || !editable" /></v-col
            ></v-row>
            <template v-if="target === 'groups'"
              ><v-textarea
                v-model="groupIds"
                :label="t('security.groupIds')"
                required
                rows="3"
                :disabled="busy || uncertain || !editable"
              /><v-btn
                variant="tonal"
                :disabled="busy || uncertain || !editable"
                @click="groupPage()"
                >{{ t('security.chooseGroups') }}</v-btn
              ><v-list
                ><v-list-item
                  v-for="group in groups?.items"
                  :key="group.id"
                  :title="group.presentation.name"
                  :subtitle="group.id"
                  ><template #append
                    ><v-btn
                      variant="text"
                      :disabled="busy || uncertain || !editable"
                      @click="addGroup(group.id)"
                      >{{ t('devices.open') }}</v-btn
                    ></template
                  ></v-list-item
                ></v-list
              ><v-btn
                v-if="groups?.nextCursor"
                variant="text"
                @click="groupPage(groups.nextCursor)"
                >{{ t('devices.next') }}</v-btn
              ></template
            >
            <ConditionEditor v-model="criteria" :fields="fields" /><v-alert
              v-if="!criteria"
              type="info"
              variant="tonal"
              class="my-3"
              >{{ t('security.criteriaRequired') }}</v-alert
            ><v-btn
              :disabled="!criteria || busy || uncertain || !editable"
              data-testid="save-rule"
              type="submit"
              >{{ t('devices.save') }}</v-btn
            >
          </fieldset>
        </form></v-card-text
      ></v-card
    >
    <v-alert v-if="uncertain" type="warning" variant="tonal" class="mb-4"
      >{{ t('devices.unknownWrite')
      }}<v-btn v-if="pending" :disabled="busy" @click="pending()">{{
        t('policies.replay')
      }}</v-btn></v-alert
    >
    <v-btn
      v-if="current?.definition.enabled"
      :disabled="busy || uncertain"
      class="mb-4"
      @click="recompute"
      >{{ t('security.recompute') }}</v-btn
    >
    <v-expansion-panels v-if="current" class="mb-4"
      ><v-expansion-panel :title="t('security.immutableVersion')"
        ><template #text
          ><form @submit.prevent="loadVersion">
            <v-text-field
              v-model.number="version"
              type="number"
              min="1"
              :max="current.revision"
              :label="t('devices.revision')"
              required
              :disabled="busy"
            /><v-btn :disabled="busy" type="submit">{{ t('devices.open') }}</v-btn>
          </form>
          <div v-if="historical" data-testid="rule-version" class="mt-4">
            <p>
              {{ historical.definition.presentation.name }} · {{ historical.revision }} ·
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
            <fieldset disabled class="security-fieldset">
              <ConditionEditor :model-value="historical.definition.criteria" :fields="fields" />
            </fieldset></div></template></v-expansion-panel
    ></v-expansion-panels>
    <v-card v-if="id" :title="t('security.evaluationTask')"
      ><v-card-text
        ><form @submit.prevent="refreshTask">
          <v-text-field
            v-model="taskId"
            :label="t('security.taskId')"
            required
            :readonly="busy"
            @update:model-value="task = undefined"
          /><v-btn :disabled="busy" type="submit">{{ t('policies.refresh') }}</v-btn>
        </form>
        <v-table v-if="task" data-testid="evaluation-task" class="mt-4"
          ><tbody>
            <tr>
              <th>{{ t('security.phase') }}</th>
              <td>{{ t(`security.state.${task.phase}`) }}</td>
            </tr>
            <tr>
              <th>{{ t('security.ruleRevision') }}</th>
              <td>{{ task.ruleVersion }}</td>
            </tr>
            <tr>
              <th>{{ t('security.watermark') }}</th>
              <td>{{ task.factWatermark }}</td>
            </tr>
            <tr>
              <th>{{ t('security.processed') }}</th>
              <td>{{ task.processed }}</td>
            </tr>
            <tr>
              <th>{{ t('security.failure') }}</th>
              <td>{{ task.failure ?? '—' }}</td>
            </tr>
            <tr>
              <th>{{ t('security.diagnostic') }}</th>
              <td>{{ task.diagnostic ? t('security.groupInputPending') : '—' }}</td>
            </tr>
          </tbody></v-table
        ></v-card-text
      ></v-card
    >
  </MdmPage>
</template>
<style scoped>
.security-fieldset {
  border: 0;
  min-width: 0;
  padding: 0;
}
</style>
