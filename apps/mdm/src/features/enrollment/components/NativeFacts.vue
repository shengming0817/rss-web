<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCardTitle,
  VForm,
  VList,
  VListItem,
  VTextField,
  VExpansionPanels,
  VExpansionPanel,
} from 'vuetify/components'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { windowsEnrollmentLink, type decodeEnrollment } from '../../devices/clients/enrollment'
import { useAttachment } from '../useAttachment'
import { useOperation } from '../../../services/useOperation'
const props = defineProps<{
  value: ReturnType<typeof decodeEnrollment>
  deviceId?: string | undefined
  profileUrl?: string | undefined
  profileFilename?: string | undefined
  profileBusy?: boolean
  profileFailure?: string | null | undefined
  refreshable?: boolean
}>()
const emit = defineEmits<{ refresh: [] }>()
const { t } = useI18n(),
  runtime = useMdm(),
  delivery = useAttachment(),
  { url, filename } = delivery,
  { run, busy, failure } = useOperation(
    [],
    () => [
      runtime.session.state.value.tenant ?? undefined,
      runtime.session.state.value.identity?.principalId,
      runtime.session.state.value.session?.id,
    ],
    () => props.value.enrollmentId,
  ),
  password = ref(''),
  recoveryOpen = ref(false)
const deliveredUrl = computed(() => props.profileUrl ?? url.value)
const deliveredFilename = computed(() => props.profileFilename ?? filename.value)
const profileFailure = computed(() =>
  deliveredUrl.value ? null : (props.profileFailure ?? failure.value),
)
const recovering = computed(() => recoveryOpen.value || !!profileFailure.value)
const windowsLink = computed(() => windowsEnrollmentLink(props.value.instructions))
const progress = computed(() => [
  {
    label: 'profilePrepared',
    complete: props.value.progress.profilePrepared === 'observed',
    value: t(`onboarding.${props.value.progress.profilePrepared}`),
  },
  {
    label: 'certificateIssued',
    complete: props.value.progress.certificateIssued,
    value: t(`devices.${props.value.progress.certificateIssued ? 'yes' : 'no'}`),
  },
  {
    label: 'firstCheckIn',
    complete: props.value.progress.firstAuthenticatedCheckIn,
    value: t(`devices.${props.value.progress.firstAuthenticatedCheckIn ? 'yes' : 'no'}`),
  },
  {
    label: 'systemConfirmation',
    complete: props.value.progress.systemConfirmation === 'observed',
    value: t(`onboarding.${props.value.progress.systemConfirmation}`),
  },
  {
    label: 'managementReady',
    complete: props.value.progress.managementReady,
    value: t(`devices.${props.value.progress.managementReady ? 'yes' : 'no'}`),
  },
])
async function profile() {
  if (!runtime.registrationChannels.canContinue(props.value) || busy.value || !password.value)
    return
  const secret = password.value
  password.value = ''
  delivery.clear()
  const stamp = delivery.stamp()
  let file: Awaited<ReturnType<typeof runtime.onboarding.native.profile>> | undefined
  try {
    await run(
      async () => {
        file = await runtime.onboarding.native.profile(props.value.enrollmentId, secret)
        return file
      },
      (file) => delivery.deliver(file, 'RSS-MDM.mobileconfig', stamp),
    )
    if (failure.value === 'enrollmentPaused') void runtime.registrationChannels.refresh()
  } finally {
    if (file) new Uint8Array(file.bytes).fill(0)
  }
}
watch(
  [
    () => props.value.enrollmentId,
    () => props.value.expiresAt,
    () => props.value.status,
    () => runtime.session.state.value.session?.id,
  ],
  () => {
    password.value = ''
    recoveryOpen.value = false
    delivery.clear()
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  password.value = ''
})
</script>
<template>
  <v-card variant="outlined" :aria-busy="busy || profileBusy">
    <v-card-title tag="h2">{{ t('onboarding.finishSystem') }}</v-card-title>
    <v-card-text>
      <template v-if="value.instructions.platform === 'windows'">
        <p class="mb-4">{{ t('onboarding.openWindowsGuide') }}</p>
        <v-btn
          v-if="windowsLink"
          color="primary"
          variant="flat"
          :href="windowsLink"
          :disabled="!runtime.registrationChannels.canContinue(value)"
          >{{ t('onboarding.openWindowsEnrollment') }}</v-btn
        >
        <p v-if="value.instructions.requiresLocalAdministrator" class="text-body-2 mt-3">
          {{ t('onboarding.localAdministrator') }}
        </p>
      </template>
      <template v-else-if="value.instructions.platform === 'macos'">
        <p class="mb-4">{{ t('onboarding.macosSteps') }}</p>
        <v-btn
          v-if="deliveredUrl"
          color="primary"
          :href="deliveredUrl"
          :download="deliveredFilename"
          >{{ t('onboarding.saveProfile') }}</v-btn
        >
        <v-alert v-else-if="profileBusy || busy" type="info" variant="tonal">{{
          t('onboarding.preparingProfile')
        }}</v-alert>
        <v-btn
          v-else-if="!recovering"
          color="primary"
          variant="outlined"
          @click="recoveryOpen = true"
          >{{ t('onboarding.recoverProfile') }}</v-btn
        >
        <v-alert v-if="profileFailure" type="warning" variant="tonal" class="mt-4" role="alert"
          >{{ t('onboarding.profileReadFailed') }} {{ t(`devices.${profileFailure}`) }}</v-alert
        >
        <v-form
          v-if="recovering && !deliveredUrl"
          :novalidate="false"
          class="mt-4"
          @submit.prevent="profile"
        >
          <p class="mb-3">{{ t('onboarding.profileAuthority') }}</p>
          <v-text-field
            v-model="password"
            :label="t('onboarding.originalEnrollmentPassword')"
            type="password"
            autocomplete="off"
            required
            pattern="[A-Za-z0-9_\-]{43}"
            :disabled="busy"
          />
          <v-btn
            :disabled="busy || !password || !runtime.registrationChannels.canContinue(value)"
            type="submit"
            color="primary"
            >{{ t('onboarding.downloadProfile') }}</v-btn
          >
        </v-form>
      </template>
      <v-alert
        v-else-if="value.instructions.platform === 'unavailable'"
        type="warning"
        variant="tonal"
        >{{ t('onboarding.channelUnavailable') }}</v-alert
      >
      <p v-else-if="value.instructions.platform === 'macos_account'">
        {{ t('onboarding.accountSteps') }}: {{ value.instructions.managedAccount }}
      </p>
      <p v-else-if="value.instructions.platform === 'macos_ade'">{{ t('onboarding.adeSteps') }}</p>
      <p v-else>{{ t('onboarding.entraSteps') }}</p>
      <v-alert
        :type="value.progress.managementReady ? 'success' : 'info'"
        variant="tonal"
        class="my-4"
        >{{ t(`onboarding.${value.progress.diagnostic}`) }}</v-alert
      >
      <p class="mb-3">{{ t('onboarding.verifyFacts') }}</p>
      <v-btn v-if="refreshable" variant="outlined" @click="emit('refresh')">{{
        t('onboarding.verifyEnrollment')
      }}</v-btn>
      <v-expansion-panels class="mt-5" variant="accordion"
        ><v-expansion-panel :title="t('onboarding.technicalDetails')"
          ><template #text>
            <v-list density="compact">
              <v-list-item :title="t('devices.enrollmentId')" :subtitle="value.enrollmentId" />
              <v-list-item v-if="deviceId" :title="t('devices.deviceId')" :subtitle="deviceId" />
              <v-list-item :title="t('devices.status')" :subtitle="t(`devices.${value.status}`)" />
              <v-list-item :title="t('devices.expires')" :subtitle="String(value.expiresAt)" />
              <template v-if="value.instructions.platform === 'windows'">
                <v-list-item
                  :title="t('onboarding.username')"
                  :subtitle="value.instructions.username"
                />
                <v-list-item
                  :title="t('onboarding.discovery')"
                  :subtitle="value.instructions.discoveryUrl"
                />
                <v-list-item
                  :title="t('registration.profile')"
                  :subtitle="value.instructions.windowsProfile"
                />
              </template>
              <v-list-item
                v-for="fact in progress"
                :key="fact.label"
                :title="t(`onboarding.${fact.label}`)"
                :subtitle="fact.value"
                :prepend-icon="fact.complete ? '$complete' : '$info'"
              />
            </v-list>
            <template v-if="value.instructions.platform === 'windows'">
              <p class="my-3">{{ t('onboarding.protocolUsernameNote') }}</p>
              <v-btn variant="outlined" href="ms-settings:workplace">{{
                t('onboarding.openSettings')
              }}</v-btn>
              <p class="mt-3">{{ t('onboarding.windowsSteps') }}</p>
            </template>
          </template></v-expansion-panel
        ></v-expansion-panels
      >
    </v-card-text>
  </v-card>
</template>
