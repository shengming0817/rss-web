<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { ExecutionSummary } from '../clients/executions'
import type { NativeOperation } from '../clients/native'
import type { ScriptRun } from '../clients/scripts'
import PolicyFrame from '../components/PolicyFrame.vue'
import ExecutionFacts from '../components/ExecutionFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const execution = ref<ExecutionSummary>(),
  native = ref<NativeOperation>(),
  script = ref<ScriptRun>()
let pending: (() => Promise<void>) | undefined
async function load() {
  const id = String(route.params['execution'])
  await run(
    async () => {
      const summary = await runtime.policies.executions.read(id)
      const n =
        summary.origin.kind === 'native'
          ? await runtime.policies.native.read(summary.device, summary.origin.operation)
          : undefined
      const s =
        summary.origin.kind === 'script'
          ? await runtime.policies.scripts.run(summary.origin.plan, summary.origin.task)
          : undefined
      const updated = n || s ? await runtime.policies.executions.read(id) : summary
      return { summary: updated, n, s }
    },
    (v) => {
      execution.value = v.summary
      native.value = v.n
      script.value = v.s
    },
  )
}
function change(action: 'approve' | 'cancel') {
  if (busy.value || uncertain.value || !execution.value || !native.value) return
  const device = execution.value.device,
    id = native.value.operationId,
    body = { requestId: crypto.randomUUID(), expectedRevision: native.value.revision }
  pending = async () => {
    if (await runWrite(() => runtime.policies.native[action](device, id, body))) await load()
  }
  void pending()
}
watch(
  () => route.params['execution'],
  () => {
    execution.value = undefined
    native.value = undefined
    script.value = undefined
    pending = undefined
    void load()
  },
)
onMounted(() => load())
</script>
<template>
  <PolicyFrame :title="t('policies.detail')" :busy="busy" :failure="failure"
    ><button :disabled="busy" @click="load">{{ t('policies.verify') }}</button
    ><template v-if="execution"
      ><h2>{{ execution.device }} · {{ execution.id }}</h2>
      <ExecutionFacts :execution="execution" /><RouterLink
        :to="{
          name: 'policy-executions',
          params: { tenant: runtime.tenant },
          query: { batch: execution.batch ?? undefined },
        }"
        >{{ t('policies.batch') }}</RouterLink
      ><RouterLink
        v-if="execution.origin.kind === 'script'"
        :to="{
          name: 'policy-scripts',
          params: { tenant: runtime.tenant },
          query: { id: execution.origin.plan },
        }"
        >{{ t('policies.scripts') }}</RouterLink
      ><RouterLink
        v-if="execution.origin.kind === 'workflow'"
        :to="{
          name: 'policy-workflows',
          params: { tenant: runtime.tenant },
          query: { id: execution.origin.workflow, run: execution.origin.run },
        }"
        >{{ t('policies.workflows') }}</RouterLink
      ></template
    >
    <section v-if="native">
      <h2>{{ native.observation.protocol }}</h2>
      <p>
        {{ t('policies.revision') }} {{ native.revision }} ·
        {{ t(`policies.state.${native.task.kind}`) }} ·
        {{ t(`policies.state.${native.commandStatus}`) }}
      </p>
      <button :disabled="busy || uncertain" @click="change('approve')">
        {{ t('policies.reapprove') }}</button
      ><button :disabled="busy || uncertain" @click="change('cancel')">
        {{ t('policies.cancel') }}
      </button>
    </section>
    <section v-if="script">
      <h2>{{ t('policies.scripts') }}</h2>
      <p>{{ script.registrationId }} / {{ script.generation }}</p>
      <p>{{ t('policies.fact.unverified') }}</p>
      <template v-if="script.result">
        <pre>{{ JSON.stringify(script.result.output, null, 2) }}</pre>
        <pre>{{ script.result.diagnostics.stdout }}</pre>
        <pre>{{ script.result.diagnostics.stderr }}</pre>
      </template>
    </section>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button></PolicyFrame
  >
</template>
