<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCardTitle,
  VCheckbox,
  VCol,
  VForm,
  VList,
  VListItem,
  VRow,
  VSelect,
  VTextField,
} from 'vuetify/components'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import NativeFacts from '../../enrollment/components/NativeFacts.vue'
import { generateEnrollmentPassword } from '../clients/enrollment'
import MdmPage from '../../../ui/MdmPage.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.registration
const { run, runWrite, busy, uncertain, failure } = useOperation([], () => [
  runtime.session.state.value.tenant ?? undefined,
  runtime.session.state.value.identity?.principalId,
  runtime.session.state.value.session?.id,
])
const usage = ref<Awaited<ReturnType<typeof client.me>>>(),
  channel = ref<'windows_mdm' | 'macos_mdm'>('windows_mdm')
const channelState = runtime.registrationChannels
const quota = computed(() => usage.value?.channels.find((c) => c.channel === channel.value))
const quotaAvailable = computed(() => !!quota.value && quota.value.used < quota.value.limit)
const canCreate = computed(
  () =>
    channelState.allowed(channel.value) && !!quota.value && quota.value.used < quota.value.limit,
)
const password = ref(''),
  handedOff = ref(false),
  enrollmentId = ref(''),
  deviceId = ref('')
const native = ref<Awaited<ReturnType<typeof runtime.devices.enrollment.status>>>()
type Command = { operation: string; channel: 'windows_mdm' | 'macos_mdm' }
const pending = ref<Command>()
function clearSecret() {
  password.value = ''
  handedOff.value = false
}
function generate() {
  password.value = generateEnrollmentPassword()
  handedOff.value = false
}
function refresh(rejection?: string) {
  void channelState.refresh()
  const id = enrollmentId.value
  void run(
    async () => ({
      usage: await client.me(),
      native: id ? await runtime.devices.enrollment.status(id) : undefined,
    }),
    (v) => {
      usage.value = v.usage
      if (rejection) failure.value = rejection
      if (id === enrollmentId.value && v.native) native.value = v.native
    },
  )
}
function submit(replay = false) {
  if (
    busy.value ||
    (!replay && (uncertain.value || !canCreate.value)) ||
    !password.value ||
    !handedOff.value
  )
    return
  const command = replay
    ? pending.value
    : { operation: crypto.randomUUID(), channel: channel.value }
  if (!command) return
  const secret = password.value
  clearSecret()
  pending.value = command
  void runWrite(
    () =>
      client.enroll(
        command.operation,
        secret,
        command.channel === 'windows_mdm' ? 'mdm.windows' : 'mdm.apple',
        'Full',
      ),
    (v) => {
      enrollmentId.value = v.enrollmentId
      deviceId.value = v.deviceId
      native.value = undefined
      pending.value = undefined
    },
  ).then((ok) => {
    if (ok) refresh()
    else if (failure.value === 'enrollmentPaused' || failure.value === 'registrationLimit')
      refresh(failure.value)
  })
}
watch(channel, clearSecret)
watch(
  () =>
    JSON.stringify([
      runtime.session.state.value.tenant,
      runtime.session.state.value.identity?.principalId,
      runtime.session.state.value.session?.id,
    ]),
  () => {
    clearSecret()
    native.value = undefined
    pending.value = undefined
    enrollmentId.value = ''
    deviceId.value = ''
    usage.value = undefined
    refresh()
  },
  { flush: 'sync' },
)
onBeforeUnmount(clearSecret)
refresh()
</script>
<template>
  <MdmPage
    :title="t('registration.self')"
    :description="t('onboarding.enrollmentJourney')"
    :busy="busy"
    :failure="failure"
  >
    <template #actions
      ><v-btn variant="text" :disabled="busy" @click="refresh()">{{
        t('registration.refresh')
      }}</v-btn
      ><v-btn variant="outlined" :to="{ name: 'agent-downloads' }">{{
        t('onboarding.downloads')
      }}</v-btn></template
    >
    <v-row>
      <v-col cols="12" lg="8">
        <v-card variant="outlined">
          <v-card-title>{{ t('onboarding.authorizeDevice') }}</v-card-title>
          <v-card-text>
            <v-alert type="info" variant="tonal" class="mb-4">{{
              t('onboarding.enrollmentAuthorization')
            }}</v-alert>
            <v-form @submit.prevent="submit()">
              <v-select
                v-model="channel"
                :label="t('devices.platform')"
                :disabled="busy || uncertain || !!enrollmentId"
                :items="[
                  { value: 'windows_mdm', title: 'Windows · ' + t('onboarding.enterpriseMdm') },
                  { value: 'macos_mdm', title: 'macOS · ' + t('onboarding.profileEnrollment') },
                ]"
              />
              <template v-if="!enrollmentId || uncertain">
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
                  :disabled="busy"
                  required
                />
                <v-btn
                  type="submit"
                  color="primary"
                  :disabled="busy || uncertain || !handedOff || !password || !canCreate"
                  >{{ t('onboarding.authorizeDevice') }}</v-btn
                >
                <v-btn
                  v-if="uncertain && pending"
                  variant="outlined"
                  :disabled="busy || !password || !handedOff"
                  @click="submit(true)"
                  >{{ t('devices.replay') }}</v-btn
                >
              </template>
            </v-form>
            <v-alert v-if="uncertain" type="warning" variant="tonal" class="mt-4">{{
              t('devices.unknownWrite')
            }}</v-alert>
            <v-alert
              v-if="usage && !quotaAvailable && !enrollmentId"
              type="warning"
              variant="tonal"
              class="mt-4"
              >{{ t('registration.quotaBlocked') }}</v-alert
            >
          </v-card-text>
        </v-card>
        <NativeFacts v-if="native" :value="native" class="mt-4" />
        <v-card v-if="enrollmentId" variant="outlined" class="mt-4">
          <v-card-title>{{ t('console.enrollmentProgress') }}</v-card-title>
          <v-card-text>
            <p>{{ t('devices.enrollmentId') }}: {{ enrollmentId }}</p>
            <p v-if="native">{{ t('devices.status') }}: {{ t(`devices.${native.status}`) }}</p>
            <v-btn
              v-if="deviceId"
              color="primary"
              :to="{
                name: 'device-management',
                params: { tenant: runtime.tenant, device: deviceId },
                query: { enrollment: enrollmentId },
              }"
              >{{ t('onboarding.continueInDevice') }}</v-btn
            >
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" lg="4">
        <RegistrationStatus :channel="channel" />
        <v-card v-if="usage" variant="outlined" class="mt-4">
          <v-card-title>{{ t('registration.quotas') }}</v-card-title>
          <v-card-text
            ><p>{{ t('registration.note') }}</p>
            <v-list density="compact"
              ><v-list-item
                v-for="c in usage.channels"
                :key="c.channel"
                :title="t(`registration.${c.channel}`)"
                :subtitle="`${t('registration.used')}: ${c.used} / ${c.limit} · ${t('registration.reserved')}: ${c.reserved}`" /></v-list
          ></v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </MdmPage>
</template>
