<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { decodeEnrollment } from '../../devices/clients/enrollment'
import { useAttachment } from '../useAttachment'
import { useOperation } from '../../../services/useOperation'
const props = defineProps<{ value: ReturnType<typeof decodeEnrollment> }>()
const { t } = useI18n(),
  runtime = useMdm(),
  delivery = useAttachment(),
  { url, filename } = delivery,
  { run, busy, failure } = useOperation(),
  password = ref('')
async function profile() {
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
  } finally {
    if (file) new Uint8Array(file.bytes).fill(0)
  }
}
watch(
  () => [props.value.enrollmentId, runtime.session.state.value.session?.id],
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
  <section :aria-busy="busy">
    <h2>{{ t('onboarding.nativeSteps') }}</h2>
    <template v-if="value.instructions.platform === 'windows'">
      <p>{{ t('onboarding.windowsSteps') }}</p>
      <a href="ms-settings:workplace">{{ t('onboarding.openSettings') }}</a>
      <dl>
        <dt>{{ t('onboarding.discovery') }}</dt>
        <dd>{{ value.instructions.discoveryUrl }}</dd>
        <dt>{{ t('onboarding.server') }}</dt>
        <dd>{{ value.instructions.server }}</dd>
        <dt>{{ t('onboarding.username') }}</dt>
        <dd>{{ value.instructions.username }}</dd>
        <dt>{{ t('registration.profile') }}</dt>
        <dd>{{ value.instructions.windowsProfile }}</dd>
      </dl>
      <p v-if="value.instructions.requiresLocalAdministrator">
        {{ t('onboarding.localAdministrator') }}
      </p>
    </template>
    <template v-else-if="value.instructions.platform === 'macos'">
      <p>{{ t('onboarding.macosSteps') }}</p>
      <form @submit.prevent="profile">
        <label
          >{{ t('devices.password')
          }}<input
            v-model="password"
            type="password"
            autocomplete="off"
            required
            pattern="[A-Za-z0-9_\-]{43}" /></label
        ><button :disabled="busy || !password">{{ t('onboarding.downloadProfile') }}</button>
      </form>
      <a v-if="url" :href="url" :download="filename">{{ t('onboarding.saveProfile') }}</a>
    </template>
    <p v-else-if="value.instructions.platform === 'unavailable'">
      {{ t('onboarding.channelUnavailable') }}
    </p>
    <p v-else-if="value.instructions.platform === 'macos_account'">
      {{ t('onboarding.accountSteps') }}: {{ value.instructions.managedAccount }}
    </p>
    <p v-else-if="value.instructions.platform === 'macos_ade'">{{ t('onboarding.adeSteps') }}</p>
    <p v-else>{{ t('onboarding.entraSteps') }}: {{ value.instructions.discoveryUrl }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <dl>
      <dt>{{ t('onboarding.profilePrepared') }}</dt>
      <dd>{{ t(`onboarding.${value.progress.profilePrepared}`) }}</dd>
      <dt>{{ t('onboarding.certificateIssued') }}</dt>
      <dd>{{ t(`devices.${value.progress.certificateIssued ? 'yes' : 'no'}`) }}</dd>
      <dt>{{ t('onboarding.firstCheckIn') }}</dt>
      <dd>{{ t(`devices.${value.progress.firstAuthenticatedCheckIn ? 'yes' : 'no'}`) }}</dd>
      <dt>{{ t('onboarding.systemConfirmation') }}</dt>
      <dd>{{ t(`onboarding.${value.progress.systemConfirmation}`) }}</dd>
      <dt>{{ t('onboarding.managementReady') }}</dt>
      <dd>{{ t(`devices.${value.progress.managementReady ? 'yes' : 'no'}`) }}</dd>
      <dt>{{ t('onboarding.diagnostic') }}</dt>
      <dd>{{ t(`onboarding.${value.progress.diagnostic}`) }}</dd>
    </dl>
  </section>
</template>
