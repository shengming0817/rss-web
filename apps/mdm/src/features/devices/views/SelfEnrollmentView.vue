<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import NativeFacts from '../../enrollment/components/NativeFacts.vue'
import { generateEnrollmentPassword } from '../clients/enrollment'
import RegistrationFrame from '../components/RegistrationFrame.vue'
const { t } = useI18n(),
  route = useRoute(),
  runtime = useMdm(),
  client = runtime.devices.registration
const { run, runWrite, busy, uncertain, failure } = useOperation()
const usage = ref<Awaited<ReturnType<typeof client.me>>>(),
  channel = ref<'windows_mdm' | 'macos_mdm'>('windows_mdm')
const profile = ref<'Full' | 'Device'>('Device')
const password = ref(''),
  handedOff = ref(false),
  enrollmentId = ref(''),
  deviceId = ref('')
const native = ref<Awaited<ReturnType<typeof runtime.devices.enrollment.status>>>()
type Command = {
  kind: 'create' | 'resume' | 'cancel'
  operation: string
  channel: 'windows_mdm' | 'macos_mdm'
  profile: 'Full' | 'Device'
  id: string
}
const pending = ref<Command>()
let nativeTargetVersion = 0
function refresh() {
  const knownNative = native.value,
    version = nativeTargetVersion
  void run(
    async () => ({
      usage: await client.me(),
      native: enrollmentId.value
        ? await runtime.devices.enrollment.status(enrollmentId.value)
        : undefined,
    }),
    (v) => {
      usage.value = v.usage
      if (v.native && version === nativeTargetVersion)
        native.value = { ...knownNative, ...v.native }
    },
  )
}
function clearSecret() {
  password.value = ''
  handedOff.value = false
}
function generate() {
  password.value = generateEnrollmentPassword()
  handedOff.value = false
}
function submit(kind: Command['kind'], replay = false) {
  if (busy.value || (!replay && uncertain.value)) return
  const command = replay
    ? pending.value
    : {
        kind,
        operation: crypto.randomUUID(),
        channel: channel.value,
        profile: profile.value,
        id: native.value?.enrollmentId ?? '',
      }
  if (
    !command ||
    (command.kind !== 'create' && !command.id) ||
    ((command.kind === 'create' || command.kind === 'resume') &&
      (!handedOff.value || !password.value))
  )
    return
  const secret = password.value
  clearSecret()
  pending.value = command
  void runWrite(
    async () => {
      if (command.kind === 'cancel')
        return { native: await runtime.devices.enrollment.cancel(command.id, command.operation) }
      if (command.kind === 'resume')
        return {
          native: await runtime.devices.enrollment.resume(command.id, command.operation, secret),
        }
      return {
        native: await client.enroll(
          command.operation,
          secret,
          command.channel === 'windows_mdm' ? 'mdm.windows' : 'mdm.apple',
          command.profile,
        ),
      }
    },
    (v) => {
      if (v.native) {
        enrollmentId.value = v.native.enrollmentId
        if ('deviceId' in v.native) deviceId.value = v.native.deviceId
        native.value = undefined
      }
      pending.value = undefined
    },
  ).then((ok) => {
    if (ok) refresh()
  })
}
function status() {
  const id = enrollmentId.value,
    version = nativeTargetVersion
  if (!id) return
  void run(
    () => runtime.devices.enrollment.status(id),
    (v) => {
      if (version === nativeTargetVersion && id === enrollmentId.value)
        native.value = { ...native.value, ...v }
    },
  )
}
watch(
  enrollmentId,
  () => {
    nativeTargetVersion++
    deviceId.value = ''
    native.value = undefined
    clearSecret()
  },
  { flush: 'sync' },
)
watch(
  () => [route.fullPath, runtime.session.state.value.session?.id],
  () => {
    clearSecret()
    native.value = undefined
    pending.value = undefined
    enrollmentId.value = ''
    usage.value = undefined
  },
  { flush: 'sync' },
)
onBeforeUnmount(clearSecret)
refresh()
</script>
<template>
  <RegistrationFrame :title="t('registration.self')" :busy="busy" :failure="failure">
    <p>{{ t('registration.note') }}</p>
    <button type="button" :disabled="busy" @click="refresh()">
      {{ t('registration.refresh') }}
    </button>
    <table v-if="usage">
      <thead>
        <tr>
          <th>{{ t('devices.source') }}</th>
          <th>{{ t('registration.limit') }}</th>
          <th>{{ t('registration.active') }}</th>
          <th>{{ t('registration.reserved') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in usage.channels" :key="c.channel">
          <th>{{ t(`registration.${c.channel}`) }}</th>
          <td>{{ c.limit }}</td>
          <td>{{ c.active }}</td>
          <td>{{ c.reserved }}</td>
        </tr>
      </tbody>
    </table>
    <p>{{ t('registration.handoff') }}</p>
    <form @submit.prevent="submit('create')">
      <fieldset :disabled="busy">
        <label
          >{{ t('devices.source')
          }}<select v-model="channel" :disabled="uncertain">
            <option
              v-for="c in usage?.channels.filter((c) => c.channel !== 'agent')"
              :key="c.channel"
              :value="c.channel"
              :disabled="!c.canEnroll"
            >
              {{ t(`registration.${c.channel}`) }}
            </option>
          </select></label
        >
        <label v-if="channel === 'windows_mdm'"
          >{{ t('registration.profile')
          }}<select v-model="profile" :disabled="uncertain">
            <option value="Device">Device</option>
            <option value="Full">Full</option>
          </select></label
        >
        <button type="button" :disabled="uncertain" @click="generate()">
          {{ t('devices.generate') }}
        </button>
        <label
          >{{ t('devices.password')
          }}<input
            v-model="password"
            required
            pattern="[A-Za-z0-9_\-]{43}"
            autocomplete="off"
            spellcheck="false"
        /></label>
        <label
          ><input v-model="handedOff" type="checkbox" required />{{ t('devices.handoff') }}</label
        >
        <button
          :disabled="
            uncertain ||
            !handedOff ||
            !usage?.channels.find((c) => c.channel === channel)?.canEnroll
          "
        >
          {{ t('devices.submitEnrollment') }}
        </button>
        <button
          v-if="uncertain && pending"
          type="button"
          :disabled="['create', 'resume'].includes(pending.kind) && (!password || !handedOff)"
          @click="submit(pending!.kind, true)"
        >
          {{ t('devices.replay') }}
        </button>
      </fieldset>
    </form>
    <RouterLink :to="{ name: 'agent-downloads' }">{{ t('onboarding.downloads') }}</RouterLink>
    <NativeFacts v-if="native" :value="native" />
    <dl v-if="native">
      <dt>{{ t('devices.enrollmentId') }}</dt>
      <dd>{{ native.enrollmentId }}</dd>
      <dt>{{ t('devices.deviceId') }}</dt>
      <dd>{{ deviceId || '—' }}</dd>
      <dt>{{ t('devices.status') }}</dt>
      <dd>{{ t(`devices.${native.status}`) }}</dd>
      <dt>{{ t('devices.expires') }}</dt>
      <dd>{{ native.expiresAt }}</dd>
    </dl>
    <form @submit.prevent="status()">
      <label
        >{{ t('devices.enrollmentId')
        }}<input v-model="enrollmentId" required :disabled="busy || uncertain" /></label
      ><button :disabled="busy">{{ t('devices.recover') }}</button>
    </form>
    <button
      v-if="native && ['pending', 'bound'].includes(native.status)"
      type="button"
      :disabled="busy || uncertain || !password || !handedOff"
      @click="submit('resume')"
    >
      {{ t('devices.resume') }}
    </button>
    <button
      v-if="native?.status === 'pending'"
      type="button"
      :disabled="busy || uncertain"
      @click="submit('cancel')"
    >
      {{ t('devices.cancel') }}
    </button>
  </RegistrationFrame>
</template>
