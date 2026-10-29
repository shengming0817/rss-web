<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCardTitle,
  VCheckbox,
  VExpansionPanel,
  VExpansionPanels,
  VForm,
  VSelect,
  VTextField,
} from 'vuetify/components'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { EndpointDetail } from '../../devices/clients/endpoint-model'
import { generateEnrollmentPassword } from '../../devices/clients/enrollment'
import { nativeChannel } from '../../../services/registrationChannels'
import NativeFacts from './NativeFacts.vue'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
const props = defineProps<{ endpoint: EndpointDetail }>()
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.devices.enrollment
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => [
  ...deviceBinding(runtime),
  props.endpoint.id,
])
const source = ref<'mdm.windows' | 'mdm.apple'>('mdm.windows'),
  password = ref(''),
  handedOff = ref(false),
  id = ref('')
const result = ref<Awaited<ReturnType<typeof client.status>>>()
type Command = {
  kind: 'create' | 'resume' | 'cancel'
  operation: string
  device: string
  source: 'mdm.windows' | 'mdm.apple'
  enrollment: string
}
const pending = ref<Command>(),
  operationId = ref('')
const admitted = new Set(
  props.endpoint.enrollments.filter((e) => e.source !== 'agent.builtin').map((e) => e.enrollmentId),
)
function clearSecret() {
  password.value = ''
  handedOff.value = false
}
function generate() {
  password.value = generateEnrollmentPassword()
  handedOff.value = false
}
function recover(value = id.value) {
  if (!value || busy.value) return
  if (!admitted.has(value)) {
    result.value = undefined
    failure.value = 'notFound'
    return
  }
  result.value = undefined
  id.value = value
  void run(
    () => client.status(value),
    (v) => {
      if (id.value !== value) return
      // The endpoint projection or this component's confirmed create command owns this locator.
      // The current status contract does not independently return a device association.
      result.value = v
    },
  )
}
function submit(kind: Command['kind'], replay = false) {
  if (
    busy.value ||
    (!replay && uncertain.value) ||
    (kind !== 'cancel' && (!handedOff.value || !password.value))
  )
    return
  if (
    !replay &&
    ((kind === 'create' && !runtime.registrationChannels.allowed(nativeChannel(source.value))) ||
      (kind === 'resume' && !runtime.registrationChannels.canContinue(result.value)))
  )
    return
  const command = replay
    ? pending.value
    : {
        kind,
        operation: crypto.randomUUID(),
        device: props.endpoint.id,
        source: source.value,
        enrollment: id.value,
      }
  if (!command || (kind !== 'create' && !command.enrollment)) return
  const secret = password.value
  clearSecret()
  pending.value = command
  operationId.value = command.operation
  result.value = undefined
  void runWrite(
    () =>
      command.kind === 'create'
        ? client.create(command.operation, {
            deviceId: command.device,
            source: command.source,
            password: secret,
            ...(command.source === 'mdm.windows' ? { windowsProfile: 'Full' as const } : {}),
          })
        : command.kind === 'resume'
          ? client.resume(command.enrollment, command.operation, secret)
          : client.cancel(command.enrollment, command.operation),
    (v) => {
      admitted.add(v.enrollmentId)
      id.value = v.enrollmentId
      pending.value = undefined
      result.value = undefined
    },
  ).then((ok) => {
    if (ok) recover()
    else if (failure.value === 'enrollmentPaused') void runtime.registrationChannels.refresh()
  })
}
watch(
  () => JSON.stringify([...deviceBinding(runtime), props.endpoint.id, route.query['enrollment']]),
  () => {
    clearSecret()
    admitted.clear()
    props.endpoint.enrollments
      .filter((e) => e.source !== 'agent.builtin')
      .forEach((e) => admitted.add(e.enrollmentId))
    operationId.value = ''
    pending.value = undefined
    result.value = undefined
    const query = route.query['enrollment']
    id.value =
      typeof query === 'string'
        ? query
        : (props.endpoint.enrollments.find((e) => e.source !== 'agent.builtin')?.enrollmentId ?? '')
    if (id.value) recover()
  },
  { immediate: true, flush: 'sync' },
)
watch(
  id,
  () => {
    result.value = undefined
    clearSecret()
  },
  { flush: 'sync' },
)
onBeforeUnmount(clearSecret)
</script>
<template>
  <v-card data-native-enrollment variant="outlined" :aria-busy="busy">
    <v-card-title tag="h2">{{ t('console.enrollmentProgress') }}</v-card-title>
    <v-card-text>
      <v-alert v-if="failure" type="error" variant="tonal" role="alert">{{
        t(`devices.${failure}`)
      }}</v-alert>
      <v-btn
        v-for="e in endpoint.enrollments.filter((e) => e.source !== 'agent.builtin')"
        :key="e.enrollmentId"
        variant="text"
        :disabled="busy || uncertain"
        @click="recover(e.enrollmentId)"
        >{{ e.source }} · {{ t(`devices.${e.status}`) }}</v-btn
      >
      <v-form :novalidate="false" class="mt-3" @submit.prevent="recover()">
        <v-text-field
          v-model="id"
          :label="t('devices.enrollmentId')"
          :disabled="busy || uncertain"
          required
        />
        <v-btn :disabled="busy || !id" type="submit" variant="outlined">{{
          t('devices.recover')
        }}</v-btn>
      </v-form>
      <p v-if="operationId" data-enrollment-operation>
        {{ t('devices.operation') }}: {{ operationId }}
      </p>
      <p v-if="result">
        {{ t('devices.status') }}: {{ t(`devices.${result.status}`) }} · {{ t('devices.expires') }}:
        {{ result.expiresAt }}
      </p>
      <NativeFacts v-if="result" :value="result" :device-id="endpoint.id" class="mt-4" />
      <v-expansion-panels class="mt-4" variant="accordion"
        ><v-expansion-panel eager :title="t('onboarding.renewAuthorization')"
          ><template #text>
            <RegistrationStatus :channel="nativeChannel(source)" />
            <v-alert type="info" variant="tonal" class="my-4">{{
              t('onboarding.deviceAuthorization')
            }}</v-alert>
            <v-form :novalidate="false" @submit.prevent="submit('create')">
              <v-select
                v-model="source"
                :label="t('devices.platform')"
                :disabled="busy || uncertain"
                :items="[
                  { value: 'mdm.windows', title: 'Windows · ' + t('onboarding.enterpriseMdm') },
                  { value: 'mdm.apple', title: 'macOS · ' + t('onboarding.profileEnrollment') },
                ]"
              />
              <v-btn variant="outlined" :disabled="busy || uncertain" @click="generate">{{
                t('devices.generate')
              }}</v-btn>
              <v-text-field
                v-model="password"
                class="mt-4"
                :label="t('devices.password')"
                required
                pattern="[A-Za-z0-9_\-]{43}"
                autocomplete="off"
                spellcheck="false"
                :disabled="busy"
              />
              <v-checkbox
                v-model="handedOff"
                :label="t('devices.handoff')"
                required
                :disabled="busy"
              />
              <v-btn
                :disabled="
                  busy ||
                  uncertain ||
                  !handedOff ||
                  !password ||
                  !runtime.registrationChannels.allowed(nativeChannel(source))
                "
                color="primary"
                type="submit"
                >{{ t('devices.submitEnrollment') }}</v-btn
              >
              <v-btn
                v-if="result"
                variant="outlined"
                :disabled="
                  busy ||
                  uncertain ||
                  !handedOff ||
                  !password ||
                  !runtime.registrationChannels.canContinue(result)
                "
                @click="submit('resume')"
                >{{ t('devices.resume') }}</v-btn
              >
              <v-btn
                v-if="result?.status === 'pending'"
                color="error"
                variant="text"
                :disabled="busy || uncertain"
                @click="submit('cancel')"
                >{{ t('devices.cancel') }}</v-btn
              >
              <v-btn
                v-if="uncertain && pending"
                variant="outlined"
                :disabled="busy || (pending.kind !== 'cancel' && (!password || !handedOff))"
                @click="submit(pending!.kind, true)"
                >{{ t('devices.replay') }}</v-btn
              >
            </v-form>
          </template></v-expansion-panel
        ></v-expansion-panels
      >
      <v-alert v-if="uncertain" type="warning" variant="tonal" class="mt-4">{{
        t('devices.unknownWrite')
      }}</v-alert>
    </v-card-text>
  </v-card>
</template>
