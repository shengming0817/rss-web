<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { DeviceControlAction } from '../clients/native'
import PageFrame from '../../../components/PageFrame.vue'
import { deviceBinding } from '../../devices/useDeviceBinding'
import ExecutionFacts from '../components/ExecutionFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => deviceBinding(runtime))
const batch = ref(typeof route.query['batch'] === 'string' ? route.query['batch'] : ''),
  records = ref<Awaited<ReturnType<typeof runtime.policies.executions.directory>>>(),
  page = ref<Awaited<ReturnType<typeof runtime.policies.executions.list>>>()
const device = ref(typeof route.query['device'] === 'string' ? route.query['device'] : ''),
  action = ref<'restart' | 'lock' | 'wipe'>('restart'),
  registration = ref(''),
  generation = ref(1),
  confirmed = ref(false),
  pin = ref(''),
  deadline = ref(Math.floor(Date.now() / 1000) + 3600),
  accepted = ref<{ id: string; device: string }>()
async function submit() {
  if (busy.value || uncertain.value) return
  const target = device.value,
    body = {
      operationId: crypto.randomUUID(),
      action: (action.value === 'restart'
        ? { kind: 'restart' }
        : {
            kind: action.value,
            confirmed: confirmed.value,
            expectedRegistrationId: registration.value,
            expectedGeneration: generation.value,
            ...(action.value === 'lock' ? { pin: pin.value } : {}),
          }) as DeviceControlAction,
      deadline: deadline.value,
    }
  pin.value = ''
  confirmed.value = false
  try {
    await runWrite(
      () => runtime.policies.native.create(target, body),
      (v) => {
        accepted.value = { id: v.operationId, device: target }
      },
    )
  } finally {
    if (body.action.kind === 'lock') body.action.pin = ''
  }
}
function directory(cursor?: { id: string; kind: 'command' | 'action_run' }) {
  void run(
    () => runtime.policies.executions.directory({ after: cursor?.id, afterKind: cursor?.kind }),
    (v) => {
      records.value = v
    },
  )
}
function load(cursor?: string) {
  if (!batch.value) {
    directory()
    return
  }
  void run(
    () => runtime.policies.executions.list(cursor, batch.value || undefined),
    (v) => (page.value = v),
  )
}
watch(
  () => [route.fullPath, ...deviceBinding(runtime)],
  () => {
    page.value = undefined
    records.value = undefined
    accepted.value = undefined
    pin.value = ''
    confirmed.value = false
    batch.value = typeof route.query['batch'] === 'string' ? route.query['batch'] : ''
    load()
  },
  { immediate: true },
)
</script>
<template>
  <PageFrame :title="t('policies.executions')" :busy="busy" :failure="failure"
    ><form @submit.prevent="load()">
      <label for="execution-batch">{{ t('policies.batch') }}</label
      ><input id="execution-batch" v-model="batch" class="ui-input" :disabled="busy" /><UiButton
        :disabled="!!busy"
        type="submit"
      >
        {{ t('policies.reload') }}
      </UiButton>
    </form>
    <details class="console-panel console-task" :open="uncertain || undefined">
      <summary>{{ t('policies.nativeAction') }}</summary>
      <form @submit.prevent="submit">
        <fieldset :disabled="busy || uncertain">
          <label for="native-device">{{ t('policies.device') }}</label
          ><input id="native-device" v-model="device" class="ui-input" required /><label
            for="native-kind"
            >{{ t('policies.kind') }}</label
          ><select id="native-kind" v-model="action" class="ui-input">
            <option v-for="kind in ['restart', 'lock', 'wipe']" :key="kind" :value="kind">
              {{ t(`policies.control_${kind}`) }}
            </option>
          </select>
          <template v-if="action !== 'restart'"
            ><label
              >{{ t('devices.registration')
              }}<input v-model="registration" class="ui-input" required /></label
            ><label
              >{{ t('policies.generation')
              }}<input
                v-model.number="generation"
                class="ui-input"
                type="number"
                min="1"
                required /></label
            ><label
              ><input v-model="confirmed" type="checkbox" required />{{
                t('policies.confirmControl')
              }}</label
            ><label v-if="action === 'lock'"
              >PIN<input
                v-model="pin"
                type="password"
                class="ui-input"
                pattern="[0-9]{6}"
                required
                autocomplete="off" /></label
          ></template>
          <label for="native-deadline">{{ t('policies.until') }}</label
          ><input
            id="native-deadline"
            v-model.number="deadline"
            class="ui-input"
            type="number"
            min="1"
            required
          /><UiButton type="submit">{{ t('policies.submitNative') }}</UiButton>
        </fieldset>
      </form>
      <RouterLink
        v-if="accepted"
        :to="{
          name: 'policy-execution',
          params: { tenant: runtime.tenant, execution: accepted.id },
          query: { device: accepted.device },
        }"
        >{{ t('policies.detail') }} {{ accepted.id }}</RouterLink
      >
    </details>
    <section v-if="records && !batch" class="console-panel">
      <p>{{ records.statistics.total }} · {{ records.asOf }}</p>
      <ul>
        <li v-for="item in records.items" :key="`${item.kind}/${item.id}`">
          <RouterLink
            :to="{
              name: 'policy-execution',
              params: { tenant: runtime.tenant, execution: item.id },
              query: item.kind === 'command' ? { device: item.device } : { policy: item.policy },
            }"
            >{{ item.device }} · {{ item.id }} · {{ item.status }}</RouterLink
          >
          <p>{{ item.registrationId }} / {{ item.generation }}</p>
        </li>
      </ul>
      <UiButton v-if="records.nextCursor" :disabled="busy" @click="directory(records.nextCursor)">{{
        t('policies.next')
      }}</UiButton>
    </section>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <article v-for="item in page?.items" :key="item.id" class="console-panel">
      <h2>
        <RouterLink
          :to="{ name: 'policy-execution', params: { tenant: runtime.tenant, execution: item.id } }"
          >{{ item.device }} · {{ item.id }}</RouterLink
        >
      </h2>
      <ExecutionFacts :execution="item" />
    </article>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="load(page.nextCursor)"
    >
      {{ t('policies.next') }}
    </UiButton></PageFrame
  >
</template>
