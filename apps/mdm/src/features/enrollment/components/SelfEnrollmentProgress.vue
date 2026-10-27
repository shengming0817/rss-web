<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCardTitle,
  VCheckbox,
  VForm,
  VExpansionPanels,
  VExpansionPanel,
  VTextField,
} from 'vuetify/components'
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { generateEnrollmentPassword, type decodeEnrollment } from '../../devices/clients/enrollment'
import NativeFacts from './NativeFacts.vue'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import { nativeChannel } from '../../../services/registrationChannels'
import { enrollmentTargetKey } from '../target'
const props = defineProps<{ deviceId?: string; enrollmentId: string; showInstructions?: boolean }>()
const emit = defineEmits<{
  updated: [value: ReturnType<typeof decodeEnrollment>]
  invalidated: []
}>()
const runtime = useMdm(),
  { t } = useI18n(),
  client = runtime.devices.enrollment,
  resolveTarget = inject(enrollmentTargetKey, undefined)
const missingTarget = computed(() => !!props.deviceId && !resolveTarget)
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => [
  ...deviceBinding(runtime),
  props.deviceId,
  props.enrollmentId,
])
const current = ref<Awaited<ReturnType<typeof client.status>>>()
const password = ref(''),
  handedOff = ref(false)
type Command = { kind: 'resume' | 'cancel'; id: string; operation: string }
const pending = ref<Command>()
const needsRecovery = computed(
  () =>
    uncertain.value ||
    ['expired', 'reauthentication_required', 'credential_unavailable'].includes(
      current.value?.progress.diagnostic ?? '',
    ),
)
const canResume = computed(
  () => !!current.value && runtime.registrationChannels.canContinue(current.value),
)
function clearSecret() {
  password.value = ''
  handedOff.value = false
}
function generate() {
  password.value = generateEnrollmentPassword()
  handedOff.value = false
}
function refresh() {
  if (busy.value) return
  current.value = undefined
  if (missingTarget.value) return
  void runtime.registrationChannels.refresh()
  void run(
    async () => {
      if (props.deviceId) {
        const target = await resolveTarget!(props.enrollmentId)
        if (target.enrollmentId !== props.enrollmentId || target.deviceId !== props.deviceId)
          throw new Error('Unverified enrollment target')
      }
      return client.status(props.enrollmentId)
    },
    (value) => {
      current.value = value
      emit('updated', value)
    },
  )
}
function submit(kind: Command['kind'], replay = false) {
  if (
    busy.value ||
    (!replay && (uncertain.value || !current.value)) ||
    (kind === 'resume' && (!password.value || !handedOff.value || (!replay && !canResume.value)))
  )
    return
  const command = replay
    ? pending.value
    : { kind, id: props.enrollmentId, operation: crypto.randomUUID() }
  if (!command) return
  const secret = password.value
  clearSecret()
  pending.value = command
  emit('invalidated')
  void runWrite(
    () =>
      command.kind === 'resume'
        ? client.resume(command.id, command.operation, secret)
        : client.cancel(command.id, command.operation),
    () => {
      pending.value = undefined
    },
  ).then((ok) => {
    if (ok) refresh()
    else if (failure.value === 'enrollmentPaused') void runtime.registrationChannels.refresh()
  })
}
watch(
  () => JSON.stringify([...deviceBinding(runtime), props.deviceId, props.enrollmentId]),
  () => {
    clearSecret()
    current.value = undefined
    pending.value = undefined
    refresh()
  },
  { immediate: true, flush: 'sync' },
)
onBeforeUnmount(clearSecret)
</script>
<template>
  <v-card data-self-enrollment-progress variant="outlined" :aria-busy="busy">
    <v-card-title tag="h2">{{ t('onboarding.selfProgress') }}</v-card-title>
    <v-card-text>
      <v-alert type="info" variant="tonal">{{ t('onboarding.selfProgressNote') }}</v-alert>
      <v-alert v-if="missingTarget" type="info" variant="tonal" class="mt-4" role="status">{{
        t('onboarding.targetUnavailable')
      }}</v-alert>
      <v-alert v-if="failure" type="error" variant="tonal" role="alert" class="mt-4">{{
        t(`devices.${failure}`)
      }}</v-alert>
      <v-btn v-if="!missingTarget" variant="text" :disabled="busy" class="my-3" @click="refresh">{{
        t('devices.reload')
      }}</v-btn>
      <template v-if="current">
        <p>{{ t('devices.status') }}: {{ t(`devices.${current.status}`) }}</p>
        <NativeFacts
          v-if="showInstructions !== false"
          :value="current"
          :device-id="deviceId"
          refreshable
          @refresh="refresh"
        />
      </template>
      <v-expansion-panels
        v-if="
          (uncertain && pending?.kind === 'resume') ||
          (current && ['pending', 'bound', 'expired'].includes(current.status))
        "
        :model-value="needsRecovery ? [0] : undefined"
        multiple
        class="mt-4"
        ><v-expansion-panel :title="t('onboarding.selfRecovery')"
          ><template #text>
            <RegistrationStatus
              v-if="current"
              :channel="nativeChannel(current.source)"
              class="mb-4"
            />
            <v-form :novalidate="false" class="mt-4" @submit.prevent="submit('resume')">
              <v-btn variant="outlined" :disabled="busy || uncertain" @click="generate">{{
                t('devices.generate')
              }}</v-btn>
              <v-text-field
                v-model="password"
                class="mt-4"
                :label="t('devices.password')"
                pattern="[A-Za-z0-9_\-]{43}"
                autocomplete="off"
                :disabled="busy"
                required
              />
              <v-checkbox
                v-model="handedOff"
                :label="t('devices.handoff')"
                :disabled="busy"
                required
              />
              <v-btn
                type="submit"
                color="primary"
                :disabled="busy || uncertain || !password || !handedOff || !canResume"
                >{{ t('devices.resume') }}</v-btn
              >
            </v-form>
          </template></v-expansion-panel
        ></v-expansion-panels
      >
      <v-btn
        v-if="current?.status === 'pending'"
        variant="text"
        color="error"
        :disabled="busy || uncertain"
        class="mt-3"
        @click="submit('cancel')"
        >{{ t('devices.cancel') }}</v-btn
      >
      <template v-if="uncertain && pending">
        <v-alert type="warning" variant="tonal" class="my-4">{{
          t('devices.unknownWrite')
        }}</v-alert>
        <v-btn
          variant="outlined"
          :disabled="busy || (pending.kind === 'resume' && (!password || !handedOff))"
          @click="submit(pending!.kind, true)"
          >{{ t('devices.replay') }}</v-btn
        >
      </template>
    </v-card-text>
  </v-card>
</template>
