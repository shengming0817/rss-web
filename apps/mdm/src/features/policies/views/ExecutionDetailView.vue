<script setup lang="ts">
import { VBtn, VTextField, VCheckbox } from 'vuetify/components'

import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { NativeOperation, Reauthorization } from '../clients/native'
import MdmPage from '../../../ui/MdmPage.vue'
import AuthorizationFacts from '../components/AuthorizationFacts.vue'
import NativeTaskFacts from '../components/NativeTaskFacts.vue'
import PolicyRunFacts from '../components/PolicyRunFacts.vue'
import OperationStages from '../components/OperationStages.vue'
import CopyDeepLink from '../../../components/CopyDeepLink.vue'
import { uuid } from '../../../services/decode'
import type { PolicyRun } from '../clients/runs'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const confirmation = ref(false),
  registration = ref(''),
  generation = ref(1)
const native = ref<NativeOperation>(),
  software = ref<PolicyRun>()
watch(
  [registration, generation],
  () => {
    confirmation.value = false
  },
  { flush: 'sync' },
)
async function load() {
  native.value = undefined
  software.value = undefined
  compared.value = false
  let id: string
  try {
    id = uuid(String(route.params['execution']))
  } catch {
    failure.value = 'invalidRequest'
    return
  }
  const policy = route.query['policy'],
    device = route.query['device']
  if ((typeof policy === 'string') === (typeof device === 'string')) {
    failure.value = 'invalidRequest'
    return
  }
  if (typeof policy === 'string') {
    await run(
      () => runtime.policies.runs.read(policy, id),
      (value) => {
        software.value = value
      },
    )
  } else if (typeof device === 'string') {
    await run(
      () => runtime.policies.native.read(device, id),
      (value) => {
        native.value = value
        confirmation.value = false
        compared.value = true
      },
    )
  }
}
const pending = ref<{
    device: string
    id: string
    action: 'reauthorize' | 'cancel'
    body: Reauthorization
  }>(),
  compared = ref(false)
async function repeat() {
  const original = pending.value
  if (!original || busy.value || !compared.value) return
  if (
    await runWrite(() =>
      runtime.policies.native[original.action](original.device, original.id, original.body),
    )
  ) {
    pending.value = undefined
    await load()
  }
}

function change(action: 'reauthorize' | 'cancel') {
  if (
    busy.value ||
    uncertain.value ||
    !native.value ||
    typeof route.query['device'] !== 'string' ||
    (action === 'reauthorize' &&
      (native.value.reauthorization.state !== 'available' ||
        (native.value.reauthorization.confirmationRequired &&
          (!confirmation.value ||
            !registration.value ||
            !Number.isSafeInteger(generation.value) ||
            generation.value < 1))))
  )
    return
  const device = String(route.query['device']),
    id = native.value.operationId,
    body: Reauthorization = {
      requestId: crypto.randomUUID(),
      expectedRevision: native.value.revision,
      ...(action === 'reauthorize' &&
      native.value.reauthorization.state === 'available' &&
      native.value.reauthorization.confirmationRequired &&
      confirmation.value
        ? {
            confirmation: {
              confirmed: true,
              expectedRegistrationId: registration.value,
              expectedGeneration: generation.value,
            },
          }
        : {}),
    }
  pending.value = { device, id, action, body }
  compared.value = false
  confirmation.value = false
  void (async () => {
    if (await runWrite(() => runtime.policies.native[action](device, id, body))) {
      pending.value = undefined
      await load()
    }
  })()
}

watch(
  () => [route.fullPath, ...deviceBinding(runtime)],
  () => {
    native.value = undefined
    software.value = undefined
    confirmation.value = false
    registration.value = ''
    pending.value = undefined
    compared.value = false
    void load()
  },
  { immediate: true },
)
</script>
<template>
  <MdmPage
    :title="t('policies.detail')"
    :description="t('policies.ux.executionsHint')"
    :busy="busy"
    :failure="failure"
  >
    <RouterLink
      v-if="typeof route.query['device'] === 'string'"
      :to="{
        name: 'device-activities',
        params: { tenant: runtime.tenant, device: route.query['device'] },
        query: { operation: route.params['execution'] },
      }"
      >{{ t('policies.entry.activities') }}</RouterLink
    >
    <template v-if="software"
      ><RouterLink
        :to="{
          name: 'device-activities',
          params: { tenant: runtime.tenant, device: software.device },
          query: { task: software.taskId },
        }"
        >{{ t('policies.entry.activities') }}</RouterLink
      ><CopyDeepLink
        :target="{
          kind: 'task',
          instance: runtime.serviceId,
          tenant: runtime.tenant,
          device: software.device,
          task: software.taskId,
        }"
    /></template>

    <template #actions
      ><VBtn :disabled="!!busy" type="submit" @click="load">{{
        t('policies.verify')
      }}</VBtn></template
    >
    <RouterLink
      :to="{
        name: 'policy-executions',
        params: { tenant: runtime.tenant },
        query: { device: route.query['device'], policy: route.query['policy'] },
      }"
      >← {{ t('policies.executions') }}</RouterLink
    >
    <p class="coordinate">{{ route.params['execution'] }}</p>
    <p v-if="uncertain && pending">
      {{ t('policies.originalChange') }} {{ pending.body.requestId }} ·
      {{ pending.body.expectedRevision }}
    </p>
    <section v-if="uncertain && native" class="console-panel">
      <h2>{{ t('devices.compare') }}</h2>
      <p>
        {{ t('policies.revision') }} {{ native.revision }} · {{ native.commandStatus }} ·
        {{ t(`policies.authorization.${native.authorization.state}`) }}
      </p>
    </section>
    <VBtn v-if="uncertain && pending" :disabled="busy || !compared" @click="repeat">{{
      t('policies.replay')
    }}</VBtn>
    <section v-if="native" class="console-panel">
      <OperationStages
        kind="command"
        :dispatch="native.commandStatus"
        :receipt="native.observation.progress"
        :effect="native.observation.effect"
      />
      <p class="ui-help">{{ t('policies.ux.stagesHint') }}</p>
      <h2>{{ native.observation.protocol }}</h2>
      <NativeTaskFacts :operation="native" :device="String(route.query['device'])" />
      <details v-if="native.dispatchFailure" open>
        <summary>{{ t('policies.dispatchFailure') }}</summary>
        <pre>{{ JSON.stringify(native.dispatchFailure, null, 2) }}</pre>
      </details>
      <details v-if="native.agentInstallation">
        <summary>{{ t('software.installAgent') }}</summary>
        <pre>{{ JSON.stringify(native.agentInstallation, null, 2) }}</pre>
      </details>
      <details class="task-technical">
        <summary>{{ t('policies.ux.technical') }}</summary>
        <dl>
          <template v-for="(value, key) in native.observation" :key="key"
            ><dt>{{ t(`policies.observation.${key}`) }}</dt>
            <dd>{{ value === null ? '—' : value }}</dd></template
          >
        </dl>
      </details>
      <p>
        {{ t('policies.revision') }} {{ native.revision }} ·
        {{ t(`policies.state.${native.task.platform}`) }} ·
        {{ t(`policies.state.${native.commandStatus}`) }}
      </p>
      <AuthorizationFacts
        :authorization="native.authorization"
        :reauthorization="native.reauthorization"
      />
      <fieldset
        v-if="
          native.reauthorization.state === 'available' &&
          native.reauthorization.confirmationRequired
        "
        :disabled="busy || uncertain"
      >
        <label
          >{{ t('devices.registration')
          }}<VTextField
            v-model="registration"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto" /></label
        ><label
          >{{ t('policies.generation')
          }}<VTextField
            v-model.number="generation"
            type="number"
            min="1"
            required
            variant="outlined"
            density="comfortable"
            hide-details="auto" /></label
        ><label
          ><VCheckbox v-model="confirmation" hide-details="auto" />{{
            t('policies.confirmControl')
          }}</label
        >
      </fieldset>
      <VBtn
        v-if="native.reauthorization.state === 'available'"
        :disabled="
          !!(
            busy ||
            uncertain ||
            (native.reauthorization.state === 'available' &&
              native.reauthorization.confirmationRequired &&
              (!confirmation ||
                !registration ||
                !Number.isSafeInteger(generation) ||
                generation < 1))
          )
        "
        type="submit"
        @click="change('reauthorize')"
      >
        {{ t('policies.reauthorize') }}</VBtn
      ><VBtn
        v-if="
          ['queued', 'published', 'received'].includes(native.commandStatus) &&
          !['succeeded', 'failed'].includes(native.observation.progress)
        "
        :disabled="!!(busy || uncertain)"
        type="submit"
        @click="change('cancel')"
      >
        {{ t('policies.cancel') }}
      </VBtn>
    </section>
    <template v-if="software">
      <RouterLink
        v-if="software.result"
        :to="{
          name: 'policy-policies',
          params: { tenant: runtime.tenant },
          query: {
            id: typeof route.query['policy'] === 'string' ? route.query['policy'] : undefined,
          },
        }"
        >{{
          t(
            software.result?.kind === 'enrollment'
              ? 'software.bootstrap'
              : software.result?.kind === 'software'
                ? 'software.deployments'
                : 'policies.policies',
          )
        }}</RouterLink
      >
      <OperationStages
        kind="action_run"
        :dispatch="software.state.delivery.kind"
        :receipt="software.state.execution"
        :effect="software.effect"
      />
      <p class="ui-help">{{ t('policies.ux.stagesHint') }}</p>
      <PolicyRunFacts :run="software" />
    </template>
  </MdmPage>
</template>
