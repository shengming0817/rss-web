<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { ExecutionSummary } from '../clients/executions'
import type { NativeOperation, Reauthorization } from '../clients/native'
import PageFrame from '../../../components/PageFrame.vue'
import ExecutionFacts from '../components/ExecutionFacts.vue'
import SoftwareRunFacts from '../../software/components/SoftwareRunFacts.vue'
import type { SoftwareRun } from '../clients/runs'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const confirmation = ref(false),
  registration = ref(''),
  generation = ref(1)
const execution = ref<ExecutionSummary>(),
  native = ref<NativeOperation>(),
  software = ref<SoftwareRun>()
async function load() {
  const id = String(route.params['execution'])
  const policy = route.query['policy']
  if (typeof policy === 'string') {
    await run(
      () => runtime.policies.runs.read(policy, id),
      (v) => {
        software.value = v
      },
    )
    return
  }
  const device = route.query['device']
  if (typeof device === 'string') {
    await run(
      () => runtime.policies.native.read(device, id),
      (v) => {
        native.value = v
      },
    )
    return
  }
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
          ? await runtime.policies.runs.read(summary.origin.policy, summary.origin.task)
          : undefined
      return { summary: s ? await runtime.policies.executions.read(id) : updated, n, s }
    },
    (v) => {
      execution.value = v.summary
      native.value = v.n
      software.value = v.s
    },
  )
}
function change(action: 'reauthorize' | 'cancel') {
  if (
    busy.value ||
    uncertain.value ||
    !native.value ||
    (!execution.value && typeof route.query['device'] !== 'string')
  )
    return
  const device = execution.value?.device ?? String(route.query['device']),
    id = native.value.operationId,
    body: Reauthorization = {
      requestId: crypto.randomUUID(),
      expectedRevision: native.value.revision,
      ...(action === 'reauthorize' && confirmation.value
        ? {
            confirmation: {
              confirmed: true,
              expectedRegistrationId: registration.value,
              expectedGeneration: generation.value,
            },
          }
        : {}),
    }
  const change = async () => {
    if (await runWrite(() => runtime.policies.native[action](device, id, body))) await load()
  }
  confirmation.value = false
  void change()
}
watch(
  () => [route.fullPath, ...deviceBinding(runtime)],
  () => {
    execution.value = undefined
    native.value = undefined
    software.value = undefined
    confirmation.value = false
    registration.value = ''
    void load()
  },
  { immediate: true },
)
</script>
<template>
  <PageFrame :title="t('policies.detail')" :busy="busy" :failure="failure"
    ><UiButton :disabled="!!busy" type="submit" @click="load">{{ t('policies.verify') }}</UiButton
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
    <section
      v-if="execution?.origin.kind === 'policy' && execution.origin.output !== null"
      class="console-panel"
    >
      <h2>{{ t('policies.output') }}</h2>
      <pre>{{ JSON.stringify(execution.origin.output, null, 2) }}</pre>
    </section>
    <section v-if="execution?.origin.kind === 'policy'" class="console-panel">
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
    <section v-if="native" class="console-panel">
      <h2>{{ native.observation.protocol }}</h2>
      <details v-if="native.agentInstallation">
        <summary>{{ t('software.installAgent') }}</summary>
        <pre>{{ JSON.stringify(native.agentInstallation, null, 2) }}</pre>
      </details>
      <dl>
        <template v-for="(value, key) in native.observation" :key="key"
          ><dt>{{ t(`policies.observation.${key}`) }}</dt>
          <dd>{{ value === null ? '—' : value }}</dd></template
        >
      </dl>
      <p>
        {{ t('policies.revision') }} {{ native.revision }} ·
        {{ t(`policies.state.${native.task.platform}`) }} ·
        {{ t(`policies.state.${native.commandStatus}`) }}
      </p>
      <fieldset :disabled="busy || uncertain">
        <label
          ><input v-model="confirmation" type="checkbox" />{{ t('policies.confirmControl') }}</label
        ><template v-if="confirmation"
          ><label
            >{{ t('devices.registration')
            }}<input v-model="registration" class="ui-input" required /></label
          ><label
            >{{ t('policies.generation')
            }}<input
              v-model.number="generation"
              type="number"
              min="1"
              class="ui-input"
              required /></label
        ></template>
      </fieldset>
      <UiButton
        v-if="
          native.authorization === 'blocked' &&
          !['cancelled', 'applied', 'rejected', 'timed_out', 'superseded'].includes(
            native.commandStatus,
          )
        "
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change('reauthorize')"
      >
        {{ t('policies.reauthorize') }}</UiButton
      ><UiButton
        v-if="
          ['queued', 'published', 'received'].includes(native.commandStatus) &&
          !['succeeded', 'failed'].includes(native.observation.progress)
        "
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change('cancel')"
      >
        {{ t('policies.cancel') }}
      </UiButton>
    </section>
    <template v-if="software">
      <RouterLink
        :to="{
          name: 'software-deployments',
          params: { tenant: runtime.tenant },
          query: {
            id:
              typeof route.query['policy'] === 'string'
                ? route.query['policy']
                : execution?.origin.kind === 'software'
                  ? execution.origin.policy
                  : undefined,
          },
        }"
        >{{ t('software.deployments') }}</RouterLink
      >
      <SoftwareRunFacts :run="software" />
    </template>
  </PageFrame>
</template>
