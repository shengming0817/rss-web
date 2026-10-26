<script setup lang="ts">
import { VAlert, VBtn } from 'vuetify/components'
import { useI18n } from 'vue-i18n'
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
    <v-alert v-if="failure" type="error" variant="tonal" role="alert">{{
      t(`devices.${failure}`)
    }}</v-alert>
    <article v-for="channel in registrationChannels" :key="channel">
      <RegistrationStatus :channel="channel" />
      <template v-if="state.canWrite.value">
        <v-btn
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
          }}</v-btn
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
          <v-btn
            v-if="state.commands.get(channel)?.state === 'unknown'"
            type="button"
            :disabled="busy || !state.commands.get(channel)?.queried"
            @click="change(channel, true)"
            >{{ t('registration.replay') }}</v-btn
          >
          <v-btn
            v-if="state.commands.get(channel)?.state === 'conflict'"
            type="button"
            :disabled="busy || !state.commands.get(channel)?.queried"
            @click="state.acceptCurrent(channel)"
            >{{ t('registration.acceptCurrent') }}</v-btn
          >
        </template>
      </template>
    </article>
  </section>
</template>
