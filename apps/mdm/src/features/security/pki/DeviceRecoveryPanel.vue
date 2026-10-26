<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { VAlert, VTab, VTabs, VWindow, VWindowItem } from 'vuetify/components'
import type { EndpointDetail } from '../../devices/clients/endpoint-model'
import AgentRecovery from './AgentRecovery.vue'
import WindowsRecovery from './WindowsRecovery.vue'
const props = defineProps<{ endpoint?: EndpointDetail | undefined }>()
const { t } = useI18n(),
  kind = ref('registration')
const agent = computed(() =>
  props.endpoint?.channels.find((channel) => channel.channel === 'agent'),
)
const choices = ['registration', 'issuance', 'windows'] as const
watch(
  agent,
  (value) => {
    if (props.endpoint && !value && kind.value === 'registration') kind.value = 'issuance'
  },
  { immediate: true },
)
</script>
<template>
  <section :key="endpoint?.id" :aria-label="t('security.pki.recover')" class="my-4">
    <h2 class="text-h5 mb-3">{{ t('security.pki.recover') }}</h2>
    <v-alert type="info" variant="tonal" class="mb-4">{{ t('security.recovery.hint') }}</v-alert>
    <v-alert v-if="endpoint && !agent" type="info" variant="tonal" class="mb-4">{{
      t('security.recovery.noAgentRegistration')
    }}</v-alert>
    <v-tabs v-model="kind" :aria-label="t('security.pki.recover')"
      ><v-tab
        v-for="choice in choices"
        :key="choice"
        :value="choice"
        :disabled="choice === 'registration' && !!endpoint && !agent"
        >{{ t(`security.recovery.${choice}`) }}</v-tab
      ></v-tabs
    >
    <v-window v-model="kind" class="mt-4"
      ><v-window-item value="registration"
        ><AgentRecovery
          v-if="kind === 'registration' && (!endpoint || agent)"
          kind="registration"
          :registration="agent?.registrationId"
          :platform="agent?.platform ?? undefined" /></v-window-item
      ><v-window-item value="issuance"
        ><AgentRecovery v-if="kind === 'issuance'" kind="issuance" /></v-window-item
      ><v-window-item value="windows"><WindowsRecovery v-if="kind === 'windows'" /></v-window-item
    ></v-window>
  </section>
</template>
