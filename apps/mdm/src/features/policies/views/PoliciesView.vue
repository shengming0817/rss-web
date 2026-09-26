<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { PolicyRead, PolicyChange, PolicyProjection } from '../clients/policies'
import PolicyFrame from '../components/PolicyFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.policies.policies,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const list = ref<Awaited<ReturnType<typeof runtime.policies.catalog.list>>>(),
  current = ref<PolicyRead>(),
  id = ref(''),
  resource = ref(''),
  resourceVersion = ref('1'),
  version = ref(1),
  scope = ref(''),
  task = ref<string>(),
  status = ref<Awaited<ReturnType<typeof client.status>>>(),
  result = ref<Awaited<ReturnType<typeof client.page>>>(),
  projection = ref<PolicyProjection>('targets')
const confirmed = ref(false),
  deadline = ref(Math.floor(Date.now() / 1000) + 86400),
  execution = ref<Awaited<ReturnType<typeof client.execute>>>()
let pending: (() => Promise<void>) | undefined
function clearPreview() {
  task.value = undefined
  status.value = undefined
  result.value = undefined
  execution.value = undefined
  confirmed.value = false
}
function load(cursor?: string) {
  void run(
    () => runtime.policies.catalog.list('policies', cursor),
    (v) => (list.value = v),
  )
}
async function read(target: string) {
  await run(
    () => client.read(target),
    (v) => {
      current.value = v
      id.value = v.id
    },
  )
}
function open(target = id.value) {
  if (busy.value || uncertain.value) return
  void run(
    () => client.read(target),
    (v) => {
      current.value = v
      id.value = v.id
      clearPreview()
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  current.value = undefined
  id.value = `policy-${crypto.randomUUID()}`
  clearPreview()
}
function change(input: PolicyChange) {
  if (busy.value || uncertain.value) return
  const target = current.value?.id ?? id.value,
    body = operation(input, current.value?.storageRevision ?? 0)
  pending = async () => {
    if (
      await runWrite(
        () => client.change(target, body),
        () => {
          clearPreview()
          list.value = undefined
        },
      )
    )
      await read(target)
  }
  void pending()
}
function preview() {
  if (!current.value || busy.value || uncertain.value) return
  const target = current.value.id,
    revision = current.value.storageRevision,
    body = operation({ scope: scope.value, expectedRevision: revision }, revision)
  pending = async () => {
    await runWrite(
      () => client.preview(target, body),
      (v) => {
        clearPreview()
        task.value = v.task
      },
    )
  }
  void pending()
}
function refresh() {
  if (current.value && task.value)
    void run(
      () => client.status(current.value!.id, task.value!),
      (v) => (status.value = v),
    )
}
function page(cursor?: string) {
  if (current.value && task.value)
    void run(
      () => client.page(current.value!.id, task.value!, projection.value, cursor),
      (v) => (result.value = v),
    )
}
function save() {
  if (!current.value || !task.value || busy.value || uncertain.value) return
  const target = current.value.id,
    body = operation({ preview: task.value }, current.value.storageRevision)
  pending = async () => {
    if (
      await runWrite(
        () => client.save(target, body),
        () => (confirmed.value = false),
      )
    )
      await read(target)
  }
  void pending()
}
function execute() {
  if (!current.value?.plan || !confirmed.value || busy.value || uncertain.value) return
  const target = current.value.id,
    plan = current.value.plan,
    body = {
      operationId: crypto.randomUUID(),
      expectedRevision: current.value.storageRevision,
      deadline: deadline.value,
    }
  pending = async () => {
    await runWrite(
      () => client.execute(target, plan, body),
      (v) => {
        execution.value = v
        confirmed.value = false
      },
    )
  }
  void pending()
}
onMounted(() => load())
</script>
<template>
  <PolicyFrame :title="t('policies.policies')" :busy="busy" :failure="failure"
    ><p>{{ t('policies.policyHint') }}</p>
    <button :disabled="busy || uncertain" @click="create">{{ t('policies.create') }}</button
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
      <label for="policy-id">{{ t('policies.id') }}</label
      ><input id="policy-id" v-model="id" :readonly="!!current" /><button @click="open()">
        {{ t('policies.open') }}</button
      ><button v-if="!current" :disabled="!id" @click="change({ action: 'create' })">
        {{ t('policies.save') }}
      </button>
    </fieldset>
    <template v-if="current"
      ><p>
        {{ t(`policies.state.${current.status}`) }} · {{ t('policies.storageRevision') }}
        {{ current.storageRevision }} · {{ t('policies.revision') }} {{ current.revision }} ·
        {{ t('policies.fresh') }}
        {{ t(current.fresh ? 'policies.yes' : 'policies.no') }}
      </p>
      <form @submit.prevent="change({ action: 'activate', version, resource, resourceVersion })">
        <fieldset :disabled="busy || uncertain || current.status === 'archived'">
          <label for="policy-resource">{{ t('policies.resources') }}</label
          ><input id="policy-resource" v-model="resource" required /><label
            for="policy-resource-version"
            >{{ t('policies.version') }}</label
          ><input id="policy-resource-version" v-model="resourceVersion" required /><label
            for="policy-version"
            >{{ t('policies.policyVersion') }}</label
          ><input
            id="policy-version"
            v-model.number="version"
            type="number"
            min="1"
            required
          /><button type="submit">{{ t('policies.activate') }}</button>
        </fieldset>
      </form>
      <button
        v-for="action in ['pause', 'resume', 'archive'] as const"
        :key="action"
        :disabled="busy || uncertain || current.status === 'archived'"
        @click="change({ action })"
      >
        {{ t(`policies.${action}`) }}
      </button>
      <fieldset :disabled="busy || uncertain">
        <label for="policy-scope">{{ t('policies.scopes') }}</label
        ><input id="policy-scope" v-model="scope" /><button :disabled="!scope" @click="preview">
          {{ t('policies.preview') }}
        </button>
      </fieldset>
      <section v-if="task">
        <p>
          {{ task }} · {{ status ? t(`policies.state.${status.status}`) : '—' }} ·
          {{ status?.failure ? t(`policies.state.${status.failure}`) : '—' }}
        </p>
        <p v-if="status?.failureDetail">
          {{ status.failureDetail.device ?? '—' }} / {{ status.failureDetail.stage }} /
          {{ t(`policies.state.${status.failureDetail.reason}`) }}
        </p>
        <button :disabled="busy" @click="refresh">{{ t('policies.refresh') }}</button
        ><template v-if="status?.status === 'completed'"
          ><p>{{ t('policies.frozen') }}</p>
          <label for="policy-projection">{{ t('policies.detail') }}</label
          ><select id="policy-projection" v-model="projection">
            <option
              v-for="item in [
                'targets',
                'add',
                'supersede',
                'retain',
                'cancel',
                'predecessors',
              ] as const"
              :key="item"
              :value="item"
            >
              {{ t(`policies.projection.${item}`) }}
            </option></select
          ><button :disabled="busy" @click="page()">{{ t('policies.open') }}</button
          ><template v-if="result"
            ><p>
              {{ t('policies.targets') }} {{ result.totalTargets }} · {{ t('policies.executions') }}
              {{ result.totalExecutions }}
            </p>
            <ul v-if="result.page.kind === 'targets'">
              <li v-for="item in result.page.items" :key="item">{{ item }}</li>
            </ul>
            <ul v-else>
              <li v-for="(item, index) in result.page.items" :key="index">
                {{
                  t(
                    `policies.projection.${item.kind === 'predecessor' ? 'predecessors' : item.kind}`,
                  )
                }}
                · {{ 'device' in item ? item.device : item.execution.device }} ·
                {{ t('policies.version') }}
                {{ 'version' in item ? item.version : item.execution.version
                }}<span v-if="'reason' in item"> · {{ item.reason }}</span>
              </li>
            </ul>
            <button v-if="result.nextCursor" :disabled="busy" @click="page(result.nextCursor)">
              {{ t('policies.next') }}
            </button></template
          ><button :disabled="busy || uncertain" @click="save">
            {{ t('policies.savePlan') }}
          </button></template
        >
      </section>
      <section v-if="current.plan">
        <p>{{ current.plan }}</p>
        <fieldset :disabled="busy || uncertain || !current.fresh">
          <label for="policy-deadline">{{ t('policies.until') }}</label
          ><input id="policy-deadline" v-model.number="deadline" type="number" min="1" /><label
            ><input v-model="confirmed" type="checkbox" />{{ t('policies.confirmExecute') }}</label
          ><button :disabled="!confirmed" @click="execute">{{ t('policies.execute') }}</button>
        </fieldset>
      </section>
      <section v-if="execution">
        <RouterLink
          :to="{
            name: 'policy-executions',
            params: { tenant: runtime.tenant },
            query: { batch: execution.plan },
          }"
          >{{ t('policies.batch') }} {{ execution.plan }}</RouterLink
        >
        <ul>
          <li v-for="item in execution.operations" :key="item.operationId">
            <RouterLink
              :to="{
                name: 'policy-execution',
                params: { tenant: runtime.tenant, execution: item.operationId },
              }"
              >{{ item.operationId }}</RouterLink
            >
          </li>
        </ul>
      </section></template
    ><button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button></PolicyFrame
  >
</template>
