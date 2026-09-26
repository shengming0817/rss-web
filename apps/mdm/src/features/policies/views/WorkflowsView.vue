<script setup lang="ts">
import { onMounted, ref, toRaw, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { Workflow, WorkflowDefinition, WorkflowRun } from '../clients/workflows'
import type { FieldDefinition } from '../../devices/clients/asset-model'
import PolicyFrame from '../components/PolicyFrame.vue'
import ScheduleEditor from '../components/ScheduleEditor.vue'
import WorkflowStepEditor from '../components/WorkflowStepEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.workflows,
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const id = ref(typeof route.query['id'] === 'string' ? route.query['id'] : ''),
  current = ref<Workflow>(),
  activeRun = ref<WorkflowRun>(),
  fields = ref<FieldDefinition[]>([]),
  list = ref<Awaited<ReturnType<typeof runtime.policies.catalog.list>>>(),
  runs = ref<Awaited<ReturnType<typeof client.runs>>>()
function empty(): WorkflowDefinition {
  return {
    name: '',
    scope: '',
    schedule: {
      trigger: { kind: 'manual' },
      misfire: 'skip',
      notBefore: Math.floor(Date.now() / 1000) - 60,
      until: Math.floor(Date.now() / 1000) + 86400,
      jitterSeconds: 0,
      window: null,
    },
    steps: [],
  }
}
const definition = ref(empty()) as Ref<WorkflowDefinition>
let pending: (() => Promise<boolean>) | undefined
function load(cursor?: string) {
  void run(
    () => runtime.policies.catalog.list('workflows', cursor),
    (v) => (list.value = v),
  )
}
function apply(v: Workflow) {
  current.value = v
  id.value = v.id
  definition.value = structuredClone(v.definition)
}
async function open(target = id.value) {
  if (busy.value || uncertain.value) return
  await run(
    () => client.read(target),
    (v) => {
      apply(v)
      activeRun.value = undefined
      runs.value = undefined
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  id.value = crypto.randomUUID()
  current.value = undefined
  activeRun.value = undefined
  runs.value = undefined
  definition.value = empty()
}
function save() {
  if (busy.value || uncertain.value) return
  const target = current.value?.id ?? id.value,
    body = operation(
      { action: 'put' as const, definition: structuredClone(toRaw(definition.value)) },
      current.value?.revision ?? 0,
    )
  pending = () =>
    runWrite(
      () => client.change(target, body),
      (v) => {
        apply(v)
        list.value = undefined
      },
    )
  void pending()
}
function archive() {
  if (!current.value || busy.value || uncertain.value) return
  const target = current.value.id,
    body = operation({ action: 'archive' as const }, current.value.revision)
  pending = () => runWrite(() => client.change(target, body), apply)
  void pending()
}
function start() {
  if (!current.value || busy.value || uncertain.value) return
  const target = current.value.id,
    body = operation({}, current.value.revision)
  pending = () =>
    runWrite(
      () => client.start(target, body),
      (v) => (activeRun.value = v),
    )
  void pending()
}
function changeRun(action: 'approve' | 'reapprove' | 'cancel') {
  if (!activeRun.value || busy.value || uncertain.value) return
  const target = activeRun.value.workflow,
    task = activeRun.value.id,
    body = operation({}, activeRun.value.revision)
  pending = () =>
    runWrite(
      () => client.changeRun(target, task, action, body),
      (v) => (activeRun.value = v),
    )
  void pending()
}
function readRun(task = activeRun.value?.id) {
  if (!current.value || !task) return
  void run(
    () => client.run(current.value!.id, task),
    (v) => (activeRun.value = v),
  )
}
function page(cursor?: string) {
  if (current.value)
    void run(
      () => client.runs(current.value!.id, cursor),
      (v) => (runs.value = v),
    )
}
function add() {
  definition.value.steps.push({
    id: crypto.randomUUID(),
    name: t('policies.step'),
    action: { kind: 'approval' },
    condition: null,
    onFailure: 'stop',
  })
}
function move(index: number, direction: number) {
  const target = index + direction,
    step = definition.value.steps[index]
  if (step && target >= 0 && target < definition.value.steps.length) {
    definition.value.steps.splice(index, 1)
    definition.value.steps.splice(target, 0, step)
  }
}
onMounted(async () => {
  await run(
    async () =>
      Promise.all([runtime.policies.catalog.list('workflows'), runtime.devices.assets.catalog()]),
    ([l, f]) => {
      list.value = l
      fields.value = f.fields
    },
  )
  if (id.value) await open(id.value)
  if (typeof route.query['run'] === 'string') readRun(route.query['run'])
})
</script>
<template>
  <PolicyFrame :title="t('policies.workflows')" :busy="busy" :failure="failure"
    ><p>{{ t('policies.candidate') }}</p>
    <p>{{ t('policies.workflowApprovalHint') }}</p>
    <p v-if="activeRun?.approval === 'pending'">
      {{ t('policies.pendingApprovalHint')
      }}<span v-if="runtime.demo"> {{ t('policies.demoReviewerHint') }}</span>
    </p>
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button
    ><button :disabled="busy" @click="load()">{{ t('policies.reload') }}</button>
    <p v-if="list && !list.items.length">{{ t('policies.empty') }}</p>
    <ul>
      <li v-for="item in list?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">{{ item.label }}</button>
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <form @submit.prevent="save">
      <fieldset :disabled="busy || uncertain || current?.status === 'archived'">
        <label for="workflow-id">{{ t('policies.id') }}</label
        ><input id="workflow-id" v-model="id" :readonly="!!current" required /><button
          type="button"
          @click="open()"
        >
          {{ t('policies.open') }}</button
        ><label for="workflow-name">{{ t('policies.name') }}</label
        ><input id="workflow-name" v-model="definition.name" required /><label
          for="workflow-scope"
          >{{ t('policies.scopes') }}</label
        ><input id="workflow-scope" v-model="definition.scope" required /><ScheduleEditor
          v-model="definition.schedule"
        />
        <div v-for="(step, index) in definition.steps" :key="step.id">
          <WorkflowStepEditor v-model="definition.steps[index]!" :fields="fields" /><button
            type="button"
            :disabled="index === 0"
            @click="move(index, -1)"
          >
            {{ t('policies.up') }}</button
          ><button
            type="button"
            :disabled="index === definition.steps.length - 1"
            @click="move(index, 1)"
          >
            {{ t('policies.down') }}</button
          ><button type="button" @click="definition.steps.splice(index, 1)">
            {{ t('policies.remove') }}
          </button>
        </div>
        <button type="button" :disabled="definition.steps.length >= 20" @click="add">
          {{ t('policies.addStep') }}</button
        ><button type="submit" :disabled="!definition.steps.length">
          {{ t('policies.save') }}
        </button>
      </fieldset>
    </form>
    <section v-if="current">
      <p>
        {{ t('policies.version') }} {{ current.version }} · {{ t('policies.revision') }}
        {{ current.revision }}
      </p>
      <button :disabled="busy || uncertain || current.status === 'archived'" @click="archive">
        {{ t('policies.archive') }}</button
      ><button :disabled="busy || uncertain || current.status === 'archived'" @click="start">
        {{ t('policies.startWorkflow') }}</button
      ><button :disabled="busy" @click="page()">{{ t('policies.executions') }}</button>
      <ul>
        <li v-for="item in runs?.items" :key="item.id">
          <button :disabled="busy || uncertain" @click="readRun(item.id)">
            {{ item.id }} · {{ t(`policies.state.${item.state}`) }}
          </button>
        </li>
      </ul>
      <button v-if="runs?.nextCursor" :disabled="busy" @click="page(runs.nextCursor)">
        {{ t('policies.next') }}
      </button>
    </section>
    <section v-if="activeRun">
      <h2>{{ activeRun.id }}</h2>
      <p>
        {{ t(`policies.state.${activeRun.state}`) }} ·
        {{ t(`policies.state.${activeRun.approval}`) }} · {{ t('policies.author') }}
        {{ activeRun.author }}
      </p>
      <p>
        {{ t('policies.frozen') }} {{ activeRun.targets.join(', ') }} · {{ t('policies.version') }}
        {{ activeRun.version }}
      </p>
      <button :disabled="busy" @click="readRun()">{{ t('policies.verify') }}</button
      ><button
        v-for="action in (['completed', 'partial', 'cancelled', 'cancel_requested'].includes(
          activeRun.state,
        )
          ? []
          : activeRun.approval === 'pending'
            ? ['approve', 'cancel']
            : ['cancel']) as ('approve' | 'cancel')[]"
        :key="action"
        :disabled="busy || uncertain"
        @click="changeRun(action)"
      >
        {{ t(`policies.${action}`) }}
      </button>
      <ul>
        <li v-for="execution in activeRun.executions" :key="execution">
          <RouterLink
            :to="{ name: 'policy-execution', params: { tenant: runtime.tenant, execution } }"
            >{{ execution }}</RouterLink
          >
        </li>
      </ul>
    </section>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button></PolicyFrame
  >
</template>
