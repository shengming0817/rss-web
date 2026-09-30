<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { ExecutionSummary } from '../clients/executions'
import type { NativeOperation } from '../clients/native'
import PolicyFrame from '../components/PolicyFrame.vue'
import ExecutionFacts from '../components/ExecutionFacts.vue'
import SoftwareRunFacts from '../../software/components/SoftwareRunFacts.vue'
import BootstrapAttemptFacts from '../../software/components/BootstrapAttemptFacts.vue'
import type { BootstrapAttempt } from '../../software/clients/bootstrap'
import type { SoftwareRun } from '../../software/clients/runs'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const execution = ref<ExecutionSummary>(),
  native = ref<NativeOperation>(),
  software = ref<SoftwareRun>(),
  bootstrap = ref<BootstrapAttempt>()
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
      const updated = n ? await runtime.policies.executions.read(id) : summary
      const s =
        summary.origin.kind === 'software'
          ? await runtime.software.runs.read(summary.origin.policy, summary.origin.task)
          : undefined
      const b =
        summary.origin.kind === 'bootstrap'
          ? await runtime.software.bootstrap.attempt(summary.origin.policy, summary.id)
          : undefined
      return { b, summary: s ? await runtime.policies.executions.read(id) : updated, n, s }
    },
    (v) => {
      execution.value = v.summary
      native.value = v.n
      software.value = v.s
      bootstrap.value = v.b
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
    software.value = undefined
    bootstrap.value = undefined
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
        v-if="execution.origin.kind === 'policy'"
        :to="{
          name: 'policy-policies',
          params: { tenant: runtime.tenant },
          query: { id: execution.origin.policy },
        }"
        >{{ t('policies.policies') }}</RouterLink
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
    <RouterLink
      v-if="execution?.origin.kind === 'security'"
      :to="{
        name: 'security-actions',
        params: { tenant: runtime.tenant },
        query: { id: execution.id },
      }"
      >{{ t('security.actions') }}</RouterLink
    >
    <RouterLink
      v-if="execution?.origin.kind === 'update'"
      :to="{
        name: 'software-updates',
        params: { tenant: runtime.tenant },
        query: { id: execution.origin.ring },
      }"
      >{{ t('software.updates') }}</RouterLink
    >
    <template v-if="bootstrap && execution?.origin.kind === 'bootstrap'"
      ><RouterLink
        :to="{
          name: 'software-bootstrap',
          params: { tenant: runtime.tenant },
          query: { id: execution.origin.policy },
        }"
        >{{ t('software.bootstrap') }}</RouterLink
      ><BootstrapAttemptFacts :attempt="bootstrap"
    /></template>
    <section v-if="execution?.origin.kind === 'policy' && execution.origin.output !== null">
      <h2>{{ t('policies.output') }}</h2>
      <pre>{{ JSON.stringify(execution.origin.output, null, 2) }}</pre>
    </section>
    <section v-if="execution?.origin.kind === 'policy'">
      <h2>{{ t('policies.executionBasis') }}</h2>
      <p>
        {{ execution.origin.basis.source }} · {{ execution.origin.basis.resource }} /
        {{ execution.origin.basis.version }} · Scope {{ execution.origin.basis.scope }} /
        {{ execution.origin.basis.scopeRevision }}
      </p>
      <p>
        {{ execution.origin.basis.resourceDigest }} · {{ execution.origin.basis.parameterDigest }}
      </p>
      <ul>
        <li v-for="identity in execution.origin.basis.registrations" :key="identity.id">
          {{ identity.id }} / {{ identity.generation }}
        </li>
      </ul>
    </section>
    <section v-if="native">
      <h2>{{ native.observation.protocol }}</h2>
      <dl>
        <template v-for="(value, key) in native.observation" :key="key"
          ><dt>{{ t(`policies.observation.${key}`) }}</dt>
          <dd>{{ value === null ? '—' : value }}</dd></template
        >
      </dl>
      <p>
        {{ t('policies.revision') }} {{ native.revision }} ·
        {{ t(`policies.state.${native.task.kind}`) }} ·
        {{ t(`policies.state.${native.commandStatus}`) }}
      </p>
      <button
        v-if="
          native.authorization === 'blocked' &&
          !['cancelled', 'applied', 'rejected', 'timed_out', 'superseded'].includes(
            native.commandStatus,
          )
        "
        :disabled="busy || uncertain"
        @click="change('approve')"
      >
        {{ t('policies.reapprove') }}</button
      ><button
        v-if="
          ['queued', 'published', 'received'].includes(native.commandStatus) &&
          !['succeeded', 'failed'].includes(native.observation.progress)
        "
        :disabled="busy || uncertain"
        @click="change('cancel')"
      >
        {{ t('policies.cancel') }}
      </button>
    </section>
    <template v-if="software && execution?.origin.kind === 'software'">
      <RouterLink
        :to="{
          name: 'software-deployments',
          params: { tenant: runtime.tenant },
          query: { id: execution.origin.policy },
        }"
        >{{ t('software.deployments') }}</RouterLink
      >
      <SoftwareRunFacts :run="software" />
    </template>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button></PolicyFrame
  >
</template>
