<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import {
  enrollmentSources,
  generateEnrollmentPassword,
  type EnrollmentSource,
} from '../clients/enrollment'
import { useOperation } from '../../../services/useOperation'
import DeviceFrame from '../components/DeviceFrame.vue'
const { t } = useI18n(),
  route = useRoute(),
  runtime = useMdm(),
  client = runtime.devices.enrollment,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const device = ref(''),
  source = ref<EnrollmentSource>('agent.builtin'),
  password = ref(''),
  handedOff = ref(false),
  id = ref('')
const result = ref<Awaited<ReturnType<typeof client.status>>>(),
  op = ref<string>()
type Pending = {
  kind: 'create' | 'resume' | 'cancel'
  operation: string
  device: string
  source: EnrollmentSource
  enrollment: string
}
let pending: Pending | undefined
function submit(kind: Pending['kind'], replay = false) {
  if (
    busy.value ||
    (!replay && uncertain.value) ||
    (kind !== 'cancel' && (!handedOff.value || !password.value))
  )
    return
  const command = replay
    ? pending
    : {
        kind,
        operation: crypto.randomUUID(),
        device: device.value,
        source: source.value,
        enrollment: id.value,
      }
  if (!command) return
  const secret = password.value
  password.value = ''
  handedOff.value = false
  pending = command
  op.value = command.operation
  void runWrite(
    () =>
      command.kind === 'create'
        ? client.create(command.operation, {
            deviceId: command.device,
            source: command.source,
            password: secret,
          })
        : command.kind === 'resume'
          ? client.resume(command.enrollment, command.operation, secret)
          : client.cancel(command.enrollment, command.operation),
    (v) => {
      result.value = v
      id.value = v.enrollmentId
      pending = undefined
    },
  )
}
function recover() {
  void run(
    () => client.status(id.value),
    (v) => (result.value = v),
  )
}
watch(
  () => route.fullPath,
  () => {
    password.value = ''
    handedOff.value = false
    pending = undefined
    result.value = undefined
    op.value = undefined
    device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
    source.value = enrollmentSources.includes(route.query['source'] as EnrollmentSource)
      ? (route.query['source'] as EnrollmentSource)
      : 'agent.builtin'
    id.value = typeof route.query['enrollment'] === 'string' ? route.query['enrollment'] : ''
  },
  { immediate: true },
)
function generate() {
  password.value = generateEnrollmentPassword()
  handedOff.value = false
}
</script>
<template>
  <DeviceFrame :title="t('devices.enroll')" :busy="busy" :failure="failure">
    <p>{{ t('devices.guide') }}</p>
    <p>{{ t('devices.enrollmentNote') }}</p>
    <p>{{ t('devices.handoffNote') }}</p>
    <form @submit.prevent="submit('create')">
      <fieldset :disabled="busy">
        <label
          >{{ t('devices.deviceId')
          }}<input v-model="device" required maxlength="256" autocomplete="off" /></label
        ><label
          >{{ t('devices.source')
          }}<select v-model="source">
            <option v-for="value in enrollmentSources" :key="value" :value="value">
              {{ value }}
            </option>
          </select></label
        ><button type="button" @click="generate()">
          {{ t('devices.generate') }}
        </button>
        <label
          >{{ t('devices.password')
          }}<input
            v-model="password"
            type="text"
            required
            pattern="[A-Za-z0-9_\-]{43}"
            autocomplete="off"
            spellcheck="false" /></label
        ><label
          ><input v-model="handedOff" type="checkbox" required />{{ t('devices.handoff') }}</label
        ><button :disabled="uncertain || !handedOff">{{ t('devices.submitEnrollment') }}</button>
        <button
          v-if="id"
          type="button"
          :disabled="uncertain || !handedOff || !password"
          @click="submit('resume')"
        >
          {{ t('devices.resume') }}
        </button>
        <button
          v-if="uncertain && pending"
          type="button"
          :disabled="pending.kind !== 'cancel' && (!handedOff || !password)"
          @click="submit(pending!.kind, true)"
        >
          {{ t('devices.replay') }}
        </button>
      </fieldset>
    </form>
    <p v-if="op">{{ t('devices.operation') }}: {{ op }}</p>
    <form @submit.prevent="recover">
      <label>{{ t('devices.enrollmentId') }}<input v-model="id" required /></label
      ><button :disabled="busy">{{ t('devices.recover') }}</button
      ><button type="button" :disabled="busy || uncertain || !id" @click="submit('cancel')">
        {{ t('devices.cancel') }}
      </button>
    </form>
    <dl v-if="result">
      <dt>{{ t('devices.enrollmentId') }}</dt>
      <dd>{{ result.enrollmentId }}</dd>
      <dt>{{ t('devices.status') }}</dt>
      <dd>{{ t(`devices.${result.status}`) }}</dd>
      <dt>{{ t('devices.source') }}</dt>
      <dd>{{ result.source }}</dd>
      <dt>{{ t('devices.expires') }}</dt>
      <dd>{{ result.expiresAt }}</dd>
      <dt>{{ t('devices.registration') }}</dt>
      <dd>{{ result.registrationId ?? '—' }}</dd>
    </dl>
    <RouterLink
      v-if="device && result"
      :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device } }"
      >{{ t('devices.detail') }}</RouterLink
    >
  </DeviceFrame>
</template>
