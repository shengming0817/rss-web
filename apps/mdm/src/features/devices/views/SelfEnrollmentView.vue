<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VBtnToggle,
  VCard,
  VCardText,
  VCheckbox,
  VExpansionPanel,
  VExpansionPanels,
  VForm,
  VList,
  VListItem,
  VStepper,
  VTextField,
} from 'vuetify/components'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import NativeFacts from '../../enrollment/components/NativeFacts.vue'
import { useAttachment } from '../../enrollment/useAttachment'
import { generateEnrollmentPassword } from '../clients/enrollment'
import MdmPage from '../../../ui/MdmPage.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.registration
const binding = () => [
  runtime.session.state.value.tenant ?? undefined,
  runtime.session.state.value.identity?.principalId,
  runtime.session.state.value.session?.id,
]
const write = useOperation([], binding),
  read = useOperation([], binding),
  profileRead = useOperation([], binding)
const delivery = useAttachment(),
  { url: profileUrl, filename: profileFilename } = delivery
const copying = ref(false)
const step = ref(1),
  channel = ref<'windows_mdm' | 'macos_mdm'>('windows_mdm')
const usage = ref<Awaited<ReturnType<typeof client.me>>>()
const channelState = runtime.registrationChannels
const quota = computed(() => usage.value?.channels.find((c) => c.channel === channel.value))
const quotaAvailable = computed(() => !!quota.value && quota.value.used < quota.value.limit)
const canCreate = computed(() => channelState.allowed(channel.value) && quotaAvailable.value)
const busy = computed(
  () => copying.value || write.busy.value || read.busy.value || profileRead.busy.value,
)
const password = ref(''),
  manualCopy = ref(false),
  recoveryPassword = ref(''),
  recoverySaved = ref(false)
const enrollmentId = ref(''),
  deviceId = ref('')
const native = ref<Awaited<ReturnType<typeof runtime.devices.enrollment.status>>>()
type Command = { operation: string; channel: 'windows_mdm' | 'macos_mdm' }
const pending = ref<Command>()
let generation = 0
function clearSecret() {
  password.value = ''
  recoveryPassword.value = ''
  recoverySaved.value = false
  manualCopy.value = false
}
function prepare() {
  if (busy.value || write.uncertain.value || enrollmentId.value || !canCreate.value) return
  clearSecret()
  password.value = generateEnrollmentPassword()
  step.value = 2
}
async function refresh(rejection?: string) {
  void channelState.refresh()
  const id = enrollmentId.value,
    device = deviceId.value
  await read.run(
    async () => ({
      usage: await client.me(),
      native: id ? await runtime.devices.enrollment.status(id) : undefined,
    }),
    (value) => {
      usage.value = value.usage
      if (rejection) write.failure.value = rejection
      if (id === enrollmentId.value && value.native) {
        if (value.native.deviceId !== device) read.failure.value = 'invalidResponse'
        else native.value = value.native
      }
    },
  )
}
async function submit(secret: string, replay = false) {
  if (busy.value || (!replay && (write.uncertain.value || !canCreate.value)) || !secret) return
  const command = replay
    ? pending.value
    : { operation: crypto.randomUUID(), channel: channel.value }
  if (!command) return
  const own = generation
  clearSecret()
  delivery.clear()
  pending.value = command
  try {
    const ok = await write.runWrite(
      () =>
        client.enroll(
          command.operation,
          secret,
          command.channel === 'windows_mdm' ? 'mdm.windows' : 'mdm.apple',
          'Full',
        ),
      (receipt) => {
        enrollmentId.value = receipt.enrollmentId
        deviceId.value = receipt.deviceId
        native.value = undefined
        pending.value = undefined
        step.value = 3
      },
    )
    if (!ok) {
      if (!write.uncertain.value) pending.value = undefined
      if (write.failure.value === 'enrollmentPaused' || write.failure.value === 'registrationLimit')
        await refresh(write.failure.value)
      return
    }
    await refresh()
    if (
      own !== generation ||
      document.visibilityState === 'hidden' ||
      command.channel !== 'macos_mdm' ||
      native.value?.deviceId !== deviceId.value ||
      native.value.instructions.platform !== 'macos'
    )
      return
    const stamp = delivery.stamp()
    let file: Awaited<ReturnType<typeof runtime.onboarding.native.profile>> | undefined
    try {
      // Profile delivery is a separate authenticated read. A failure cannot change the confirmed create receipt into an unknown write.
      await profileRead.run(
        async () => {
          file = await runtime.onboarding.native.profile(enrollmentId.value, secret)
          return file
        },
        (value) => delivery.deliver(value, 'RSS-MDM.mobileconfig', stamp),
      )
    } finally {
      if (file) new Uint8Array(file.bytes).fill(0)
    }
  } finally {
    secret = ''
  }
}
function back() {
  clearSecret()
  step.value = 1
}
async function copyAndContinue() {
  if (!password.value || busy.value || write.uncertain.value) return
  let secret = password.value
  const own = generation,
    selected = channel.value
  copying.value = true
  try {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(secret)
    } catch {
      if (own === generation && selected === channel.value && secret === password.value)
        manualCopy.value = true
      return
    } finally {
      copying.value = false
    }
    if (own !== generation || selected !== channel.value || secret !== password.value) return
    await submit(secret)
  } finally {
    secret = ''
  }
}
function replay() {
  if (recoverySaved.value) void submit(recoveryPassword.value, true)
}
watch(channel, () => {
  clearSecret()
  step.value = 1
})
watch(
  () => JSON.stringify(binding()),
  () => {
    generation++
    clearSecret()
    delivery.clear()
    native.value = undefined
    pending.value = undefined
    enrollmentId.value = ''
    deviceId.value = ''
    usage.value = undefined
    step.value = 1
    void refresh()
  },
  { flush: 'sync' },
)
watch(
  () => native.value?.status,
  (status) => {
    if (status && ['cancelled', 'expired'].includes(status)) delivery.clear()
  },
)
function hide() {
  if (document.visibilityState === 'hidden') {
    generation++
    clearSecret()
  }
}
window.addEventListener('pagehide', clearSecret)
document.addEventListener('visibilitychange', hide)
onBeforeUnmount(() => {
  generation++
  clearSecret()
  window.removeEventListener('pagehide', clearSecret)
  document.removeEventListener('visibilitychange', hide)
})
void refresh()
</script>
<template>
  <MdmPage
    :title="t('registration.self')"
    :description="t('onboarding.enrollmentJourney')"
    :busy="busy"
    :failure="write.failure.value ?? read.failure.value"
  >
    <template #actions
      ><v-btn variant="text" :to="{ name: 'agent-downloads' }">{{
        t('onboarding.downloads')
      }}</v-btn></template
    >
    <v-alert
      v-if="usage && !quotaAvailable && !enrollmentId"
      type="warning"
      variant="tonal"
      class="mb-4"
      >{{ t('registration.quotaBlocked')
      }}<v-btn variant="text" :disabled="busy" @click="refresh()">{{
        t('registration.refresh')
      }}</v-btn></v-alert
    >
    <v-alert
      v-else-if="!channelState.loading.value && !channelState.allowed(channel) && !enrollmentId"
      type="warning"
      variant="tonal"
      class="mb-4"
      >{{ t('onboarding.channelUnavailable')
      }}<v-btn variant="text" :disabled="busy" @click="refresh()">{{
        t('registration.refresh')
      }}</v-btn></v-alert
    >
    <v-stepper
      v-model="step"
      class="enrollment-guide"
      :items="[
        {
          title: t('onboarding.chooseSystem'),
          value: 1,
          props: { color: 'primary', complete: step > 1 },
        },
        {
          title: t('onboarding.prepareSystem'),
          value: 2,
          props: {
            color: 'primary',
            complete: step > 2 && (channel === 'windows_mdm' || !!profileUrl),
          },
        },
        { title: t('onboarding.finishSystem'), value: 3, props: { color: 'primary' } },
      ]"
      hide-actions
      :editable="false"
      alt-labels
    >
      <template #[`item.1`]>
        <h2 class="text-h5 mb-3">{{ t('onboarding.chooseSystem') }}</h2>
        <p class="mb-5">{{ t('onboarding.enterpriseChoice') }}</p>
        <v-btn-toggle
          v-model="channel"
          mandatory
          divided
          color="primary"
          :disabled="busy || write.uncertain.value"
          :aria-label="t('devices.platform')"
          class="mb-5"
        >
          <v-btn value="windows_mdm" size="large">Windows</v-btn
          ><v-btn value="macos_mdm" size="large">macOS</v-btn>
        </v-btn-toggle>
        <p class="mb-5">
          {{ t(channel === 'windows_mdm' ? 'onboarding.windowsChoice' : 'onboarding.macChoice') }}
        </p>
        <v-btn color="primary" :disabled="busy || !canCreate" @click="prepare">{{
          t('onboarding.continuePreparation')
        }}</v-btn>
      </template>
      <template #[`item.2`]>
        <h2 class="text-h5 mb-3">
          {{ t(channel === 'windows_mdm' ? 'onboarding.prepareWindows' : 'onboarding.prepareMac') }}
        </h2>
        <template v-if="!write.uncertain.value">
          <p class="mb-4">
            {{
              t(
                channel === 'windows_mdm'
                  ? 'onboarding.windowsPasswordGuide'
                  : 'onboarding.macPasswordGuide',
              )
            }}
          </p>
          <v-card v-if="password" variant="tonal" class="mb-4"
            ><v-card-text
              ><p class="text-caption mb-2">{{ t('devices.password') }}</p>
              <code data-enrollment-secret class="text-break">{{ password }}</code></v-card-text
            ></v-card
          >
          <v-alert v-if="manualCopy" type="info" variant="tonal" class="mb-4">{{
            t('onboarding.manualCopy')
          }}</v-alert>
          <v-btn
            v-if="password && !manualCopy"
            color="primary"
            :disabled="busy || !canCreate"
            @click="copyAndContinue"
            >{{ t('onboarding.copyAndContinue') }}</v-btn
          >
          <v-btn
            v-else-if="password"
            color="primary"
            :disabled="busy || !canCreate"
            @click="submit(password)"
            >{{ t('onboarding.savedAndContinue') }}</v-btn
          >
          <v-btn v-else :disabled="busy || !canCreate" color="primary" @click="prepare">{{
            t('onboarding.prepareAgain')
          }}</v-btn>
          <v-btn variant="text" :disabled="busy" @click="back">{{
            t('onboarding.changeSystem')
          }}</v-btn>
        </template>
        <template v-else>
          <v-alert type="warning" variant="tonal" class="mb-4">{{
            t('onboarding.unknownEnrollment')
          }}</v-alert>
          <v-form :novalidate="false" @submit.prevent="replay">
            <v-text-field
              v-model="recoveryPassword"
              type="password"
              :label="t('onboarding.originalEnrollmentPassword')"
              pattern="[A-Za-z0-9_\-]{43}"
              autocomplete="off"
              required
              :disabled="busy"
            />
            <v-checkbox
              v-model="recoverySaved"
              :label="t('devices.handoff')"
              :disabled="busy"
              required
            />
            <v-btn
              type="submit"
              color="primary"
              :disabled="busy || !recoveryPassword || !recoverySaved"
              >{{ t('devices.replay') }}</v-btn
            >
          </v-form>
        </template>
      </template>
      <template #[`item.3`]>
        <NativeFacts
          v-if="native"
          :value="native"
          :profile-url="profileUrl"
          :profile-filename="profileFilename"
          :profile-busy="profileRead.busy.value"
          :profile-failure="profileRead.failure.value"
          refreshable
          @refresh="refresh()"
        />
        <v-alert v-else type="info" variant="tonal"
          >{{ t('onboarding.confirmedReadPending')
          }}<v-btn variant="text" :disabled="busy" @click="refresh()">{{
            t('devices.reload')
          }}</v-btn></v-alert
        >
        <v-btn
          v-if="deviceId"
          class="mt-4"
          variant="text"
          :to="{
            name: 'device-management',
            params: { tenant: runtime.tenant, device: deviceId },
            query: { mode: 'self-enrollment', enrollment: enrollmentId },
          }"
          >{{ t('onboarding.continueInDevice') }}</v-btn
        >
      </template>
    </v-stepper>
    <v-expansion-panels class="mt-5" variant="accordion"
      ><v-expansion-panel :title="t('onboarding.quotaDetails')"
        ><template #text>
          <RegistrationStatus :channel="channel" />
          <p class="my-3">{{ t('registration.note') }}</p>
          <v-list v-if="usage" density="compact"
            ><v-list-item
              v-for="item in usage.channels"
              :key="item.channel"
              :title="t(`registration.${item.channel}`)"
              :subtitle="`${t('registration.used')}: ${item.used} / ${item.limit} · ${t('registration.reserved')}: ${item.reserved}`"
          /></v-list>
          <v-btn variant="text" :disabled="busy" @click="refresh()">{{
            t('registration.refresh')
          }}</v-btn>
        </template></v-expansion-panel
      ></v-expansion-panels
    >
  </MdmPage>
</template>

<style scoped>
.enrollment-guide
  :deep(
    .v-stepper-item:not(.v-stepper-item--selected):not(.v-stepper-item--complete)
      .v-stepper-item__avatar
  ) {
  color: rgb(var(--v-theme-on-surface));
}
</style>
