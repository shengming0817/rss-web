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
  VTimeline,
  VTimelineItem,
} from 'vuetify/components'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { windowsEnrollmentLink, type decodeEnrollment } from '../../devices/clients/enrollment'
import { useAttachment } from '../useAttachment'
import { useOperation } from '../../../services/useOperation'
const props = defineProps<{ value: ReturnType<typeof decodeEnrollment> }>()
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
  password = ref('')
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
    delivery.clear()
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  password.value = ''
})
</script>
<template>
  <v-card variant="outlined" :aria-busy="busy">
    <v-card-title>{{ t('onboarding.nativeSteps') }}</v-card-title>
    <v-card-text>
      <template v-if="value.instructions.platform === 'windows'">
        <p>{{ t('onboarding.windowsSteps') }}</p>
        <v-alert type="info" variant="tonal" class="my-4">{{
          t('onboarding.protocolUsernameNote')
        }}</v-alert>
        <v-btn
          v-if="windowsLink"
          color="primary"
          variant="flat"
          :href="windowsLink"
          :disabled="!runtime.registrationChannels.canContinue(value)"
          >{{ t('onboarding.openWindowsEnrollment') }}</v-btn
        >
        <v-btn variant="text" href="ms-settings:workplace">{{
          t('onboarding.openSettings')
        }}</v-btn>
        <v-list density="compact">
          <v-list-item :title="t('onboarding.username')" :subtitle="value.instructions.username" />
          <v-list-item
            :title="t('onboarding.discovery')"
            :subtitle="value.instructions.discoveryUrl"
          />
          <v-list-item
            :title="t('registration.profile')"
            :subtitle="value.instructions.windowsProfile"
          />
        </v-list>
        <v-alert
          v-if="value.instructions.requiresLocalAdministrator"
          type="warning"
          variant="tonal"
          >{{ t('onboarding.localAdministrator') }}</v-alert
        >
      </template>
      <template v-else-if="value.instructions.platform === 'macos'">
        <v-timeline side="end" align="start" density="compact">
          <v-timeline-item dot-color="primary" :title="t('onboarding.macDownload')">
            <h3>{{ t('onboarding.macDownload') }}</h3>
            <p>{{ t('onboarding.profileAuthority') }}</p>
            <v-form @submit.prevent="profile">
              <v-text-field
                v-model="password"
                :label="t('devices.password')"
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
              <v-btn
                v-if="url"
                :href="url"
                :download="filename"
                color="primary"
                variant="outlined"
                class="ms-2"
                >{{ t('onboarding.saveProfile') }}</v-btn
              >
            </v-form>
          </v-timeline-item>
          <v-timeline-item dot-color="primary"
            ><h3>{{ t('onboarding.macInstall') }}</h3>
            <p>{{ t('onboarding.macosSteps') }}</p></v-timeline-item
          >
          <v-timeline-item :dot-color="value.progress.managementReady ? 'success' : 'grey'"
            ><h3>{{ t('onboarding.macVerify') }}</h3>
            <p>{{ t('onboarding.verifyFacts') }}</p></v-timeline-item
          >
        </v-timeline>
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
      <p v-else>{{ t('onboarding.entraSteps') }}: {{ value.instructions.discoveryUrl }}</p>
      <v-alert v-if="failure" type="error" variant="tonal" role="alert">{{
        t(`devices.${failure}`)
      }}</v-alert>
      <v-list density="compact" :aria-label="t('onboarding.nativeSteps')">
        <v-list-item
          v-for="fact in progress"
          :key="fact.label"
          :title="t(`onboarding.${fact.label}`)"
          :subtitle="fact.value"
          :prepend-icon="fact.complete ? '$complete' : '$info'"
        />
      </v-list>
      <v-alert :type="value.progress.managementReady ? 'success' : 'info'" variant="tonal">{{
        t(`onboarding.${value.progress.diagnostic}`)
      }}</v-alert>
    </v-card-text>
  </v-card>
</template>
