<script setup lang="ts">
import { onMounted, ref, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { ScriptCreate, ScriptPlan, Schedule, RunCursor } from '../clients/scripts'
import { jsonValue, type Platform, type Architecture } from '../clients/resources'
import PolicyFrame from '../components/PolicyFrame.vue'
import ScheduleEditor from '../components/ScheduleEditor.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.scripts,
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const id = ref(typeof route.query['id'] === 'string' ? route.query['id'] : ''),
  current = ref<ScriptPlan>(),
  list = ref<Awaited<ReturnType<typeof runtime.policies.catalog.list>>>(),
  runs = ref<Awaited<ReturnType<typeof client.runs>>>()
const resource = ref(''),
  version = ref('1'),
  variant = ref('main'),
  platform = ref<Platform>('windows'),
  architecture = ref<Architecture>('x86_64'),
  parameters = ref('{}'),
  devices = ref(''),
  lifetime = ref(3600)
const schedule = ref<Schedule>({
  trigger: { kind: 'manual' },
  misfire: 'skip',
  notBefore: Math.floor(Date.now() / 1000) - 60,
  until: Math.floor(Date.now() / 1000) + 86400,
  jitterSeconds: 0,
  window: null,
})
let pending: (() => Promise<void>) | undefined
function load(cursor?: string) {
  void run(
    () => runtime.policies.catalog.list('script-plans', cursor),
    (v) => (list.value = v),
  )
}
async function refresh(target: string) {
  await run(
    () => client.read(target),
    (v) => {
      current.value = v
      id.value = v.planId
    },
  )
}
function open(target = id.value) {
  if (busy.value || uncertain.value) return
  runs.value = undefined
  void refresh(target)
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  id.value = ''
  runs.value = undefined
}
function validate(event: Event) {
  const input = event.target as HTMLTextAreaElement
  try {
    jsonValue(JSON.parse(input.value), 8192)
    input.setCustomValidity('')
  } catch {
    input.setCustomValidity(t('policies.invalidJson'))
  }
}
function submit() {
  if (busy.value || uncertain.value) return
  const body: ScriptCreate = {
    operationId: crypto.randomUUID(),
    resource: resource.value,
    version: version.value,
    variant: variant.value,
    platform: platform.value,
    architecture: architecture.value,
    parameters: jsonValue(JSON.parse(parameters.value), 8192),
    devices: [...new Set(devices.value.split(/[\s,]+/).filter(Boolean))],
    schedule: structuredClone(toRaw(schedule.value)),
    runLifetimeSeconds: lifetime.value,
  }
  pending = async () => {
    let created: string | undefined
    if (
      (await runWrite(
        () => client.create(body),
        (v) => {
          created = v.planId
          id.value = v.planId
          list.value = undefined
          runs.value = undefined
        },
      )) &&
      created
    )
      await refresh(created)
  }
  void pending()
}
function change(action: 'approve' | 'cancel') {
  if (!current.value || busy.value || uncertain.value) return
  const target = current.value.planId,
    operationId = crypto.randomUUID()
  pending = async () => {
    const acknowledged =
      action === 'approve'
        ? await runWrite(() => client.approve(target, operationId))
        : await runWrite(() => client.cancel(target, operationId))
    if (acknowledged) await refresh(target)
  }
  void pending()
}
function page(cursor?: RunCursor) {
  if (current.value)
    void run(
      () => client.runs(current.value!.planId, cursor),
      (v) => (runs.value = v),
    )
}
onMounted(async () => {
  await run(
    () => runtime.policies.catalog.list('script-plans'),
    (v) => (list.value = v),
  )
  if (id.value) await refresh(id.value)
})
</script>
<template>
  <PolicyFrame :title="t('policies.scripts')" :busy="busy" :failure="failure"
    ><p>{{ t('policies.independent') }}</p>
    <p>{{ t('policies.osqueryHint') }}</p>
    <RouterLink :to="{ name: 'policy-resources', params: { tenant: runtime.tenant } }">{{
      t('policies.resources')
    }}</RouterLink
    ><RouterLink :to="{ name: 'policy-workflows', params: { tenant: runtime.tenant } }">{{
      t('policies.generalQuery')
    }}</RouterLink
    ><button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button
    ><button :disabled="busy" @click="load()">{{ t('policies.reload') }}</button>
    <ul>
      <li v-for="item in list?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">
          {{ item.label }} · {{ t(`policies.state.${item.status}`) }}
        </button>
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">
      {{ t('policies.next') }}
    </button>
    <fieldset :disabled="busy || uncertain">
      <label for="script-id">{{ t('policies.id') }}</label
      ><input id="script-id" v-model="id" /><button @click="open()">
        {{ t('policies.open') }}
      </button>
    </fieldset>
    <form v-if="!current" @submit.prevent="submit">
      <fieldset :disabled="busy || uncertain">
        <label for="script-resource">{{ t('policies.resources') }}</label
        ><input id="script-resource" v-model="resource" required /><label for="script-version">{{
          t('policies.version')
        }}</label
        ><input id="script-version" v-model="version" required /><label for="script-variant">{{
          t('policies.variant')
        }}</label
        ><input id="script-variant" v-model="variant" required /><label for="script-platform">{{
          t('policies.platform')
        }}</label
        ><select id="script-platform" v-model="platform">
          <option value="windows">Windows</option>
          <option value="macos">macOS</option></select
        ><label for="script-architecture">{{ t('policies.architecture') }}</label
        ><select id="script-architecture" v-model="architecture">
          <option value="x86_64">x86_64</option>
          <option value="aarch64">aarch64</option></select
        ><label for="script-parameters">{{ t('policies.parameters') }}</label
        ><textarea
          id="script-parameters"
          v-model="parameters"
          required
          rows="5"
          @input="validate"
        /><label for="script-devices">{{ t('policies.deviceIds') }}</label
        ><textarea id="script-devices" v-model="devices" required /><label for="script-lifetime">{{
          t('policies.lifetime')
        }}</label
        ><input
          id="script-lifetime"
          v-model.number="lifetime"
          type="number"
          min="1"
          max="86400"
          required
        /><ScheduleEditor v-model="schedule" /><button type="submit">
          {{ t('policies.submitReview') }}
        </button>
      </fieldset>
    </form>
    <section v-if="current">
      <h2>{{ current.planId }}</h2>
      <p>
        {{ current.definition.input.resource }} / {{ current.definition.input.version }} ·
        {{ current.definition.definition.profile }}
      </p>
      <p>{{ t('policies.frozen') }} {{ current.definition.input.devices.join(', ') }}</p>
      <p>
        {{ t('policies.active') }}: {{ t(current.active ? 'policies.yes' : 'policies.no') }} ·
        {{ t('policies.approved') }}:
        {{ t(current.approved ? 'policies.yes' : 'policies.no') }}
      </p>
      <button
        :disabled="busy || uncertain || current.approved || !current.active"
        @click="change('approve')"
      >
        {{ t('policies.approve') }}</button
      ><button :disabled="busy || uncertain || !current.active" @click="change('cancel')">
        {{ t('policies.cancelPlan') }}</button
      ><button :disabled="busy" @click="page()">{{ t('policies.executions') }}</button>
      <ul>
        <li v-for="item in runs?.items" :key="item.taskId">
          <RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: item.taskId },
            }"
            >{{ item.device }} · {{ item.taskId }}</RouterLink
          >
          · {{ t(`policies.state.${item.state.execution}`) }} /
          {{ t(`policies.state.${item.state.cancellation}`) }}
        </li>
      </ul>
      <button v-if="runs?.nextCursor" :disabled="busy" @click="page(runs.nextCursor)">
        {{ t('policies.next') }}
      </button>
    </section>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button></PolicyFrame
  >
</template>
