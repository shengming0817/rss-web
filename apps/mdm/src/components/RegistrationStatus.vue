<script setup lang="ts">
import { VBtn, VCard, VCardText } from 'vuetify/components'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../context'
import type { RegistrationChannel } from '../services/registrationChannels'
const props = defineProps<{ channel: RegistrationChannel }>()
const runtime = useMdm(),
  state = runtime.registrationChannels,
  { t } = useI18n()
const value = computed(() => state.status(props.channel))
watch(
  [
    () => props.channel,
    () => runtime.session.state.value.status,
    () => runtime.session.state.value.tenant,
    () => runtime.session.state.value.identity?.principalId,
    () => runtime.session.state.value.session?.id,
  ],
  () => {
    void state.refresh()
  },
  { immediate: true },
)
</script>
<template>
  <v-card
    variant="outlined"
    class="console-panel"
    :aria-busy="state.loading.value"
    :aria-label="t('registration.channelStatus')"
    ><v-card-text>
      <h2>{{ t(`registration.${channel}`) }}</h2>
      <template v-if="value">
        <p>
          {{ t('registration.channelStatus') }}: {{ t(`registration.${value.availability}`) }} ·
          {{ t(`registration.${value.admission}`) }}
        </p>
        <p v-if="value.reason">{{ t(`registration.${value.reason}`) }}</p>
        <p>{{ t('devices.revision') }}: {{ value.revision }}</p>
      </template>
      <p v-else role="status">
        {{ t(state.failure.value ? 'registration.readFailure' : 'registration.unknown') }}
      </p>
      <v-btn type="button" :disabled="state.loading.value" @click="state.refresh()">{{
        t('registration.refreshChannel')
      }}</v-btn>
      <p>{{ t('registration.admissionNote') }}</p>
    </v-card-text></v-card
  >
</template>
