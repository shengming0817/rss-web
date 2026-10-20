<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../context'
import { useOperation } from '../services/useOperation'
import { registrationChannels, type RegistrationChannel } from '../services/registrationChannels'
import RegistrationStatus from './RegistrationStatus.vue'
const runtime = useMdm(),
  state = runtime.registrationChannels,
  { t } = useI18n()
const { runWrite, busy, failure } = useOperation([], () => [
  runtime.session.state.value.tenant ?? undefined,
  runtime.session.state.value.identity?.principalId,
  runtime.session.state.value.session?.id,
])
function change(channel: RegistrationChannel, replay = false) {
  const value = state.status(channel)
  if (!value || !state.canWrite.value || busy.value) return
  void runWrite(() =>
    state.change(channel, value.admission === 'allowed' ? 'paused' : 'allowed', replay),
  )
}
</script>
<template>
  <section :aria-label="t('registration.channels')">
    <h2>{{ t('registration.channels') }}</h2>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <article v-for="channel in registrationChannels" :key="channel">
      <RegistrationStatus :channel="channel" />
      <template v-if="state.canWrite.value">
        <UiButton
          v-if="!state.commands.has(channel)"
          type="button"
          :disabled="busy || !state.status(channel)"
          @click="change(channel)"
          >{{
            t(
              state.status(channel)?.admission === 'allowed'
                ? 'registration.pause'
                : 'registration.resumeAdmission',
            )
          }}</UiButton
        >
        <template v-else>
          <p>{{ t('devices.operation') }}: {{ state.commands.get(channel)?.operationId }}</p>
          <p role="status">
            {{
              t(
                state.commands.get(channel)?.state === 'submitting'
                  ? 'registration.admissionSubmitting'
                  : state.commands.get(channel)?.state === 'conflict'
                    ? 'registration.admissionConflict'
                    : 'registration.admissionUnknown',
              )
            }}
          </p>
          <UiButton
            v-if="state.commands.get(channel)?.state === 'unknown'"
            type="button"
            :disabled="busy || !state.commands.get(channel)?.queried"
            @click="change(channel, true)"
            >{{ t('registration.replay') }}</UiButton
          >
          <UiButton
            v-if="state.commands.get(channel)?.state === 'conflict'"
            type="button"
            :disabled="busy || !state.commands.get(channel)?.queried"
            @click="state.acceptCurrent(channel)"
            >{{ t('registration.acceptCurrent') }}</UiButton
          >
        </template>
      </template>
    </article>
  </section>
</template>
