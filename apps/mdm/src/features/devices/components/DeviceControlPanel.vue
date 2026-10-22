<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { uuid } from '../../../services/decode'
import { useI18n } from 'vue-i18n'
import { UiButton, UiDialog } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { EndpointDetail } from '../clients/endpoint-model'
import type { DeviceControlAction, NativeOperation } from '../../policies/clients/native'
const props = defineProps<{ endpoint: EndpointDetail; deviceName: string }>()
const runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  { t } = useI18n(),
  { run, runWrite, busy, uncertain, failure } = useOperation([], () => [
    ...deviceBinding(runtime),
    props.endpoint.id,
    JSON.stringify(props.endpoint.primaryMdmRegistration),
  ])
const action = ref<'restart' | 'lock' | 'wipe'>(),
  pin = ref(''),
  confirmation = ref('')
const original = ref<{ device: string; id: string }>(),
  result = ref<NativeOperation>()
const primary = computed(() => props.endpoint.primaryMdmRegistration)
const binding = computed(() => JSON.stringify([props.endpoint.id, primary.value]))
const locked = computed(() => busy.value || uncertain.value || !!original.value)
const canSubmit = computed(
  () =>
    !!primary.value &&
    (action.value === 'restart' ||
      (action.value === 'lock'
        ? /^\d{6}$/.test(pin.value)
        : confirmation.value === props.deviceName)),
)
function clearSecrets() {
  pin.value = ''
  confirmation.value = ''
}
watch(action, clearSecrets)
watch(
  binding,
  () => {
    clearSecrets()
    action.value = undefined
    original.value = undefined
    result.value = undefined
  },
  { flush: 'sync' },
)
function hidden() {
  if (document.hidden) clearSecrets()
}
document.addEventListener('visibilitychange', hidden)
onBeforeUnmount(() => {
  clearSecrets()
  document.removeEventListener('visibilitychange', hidden)
})
watch(
  () => deviceBinding(runtime),
  () => {
    clearSecrets()
    action.value = undefined
    original.value = undefined
    result.value = undefined
  },
  { flush: 'sync' },
)
async function lookup() {
  if (!original.value) return
  const op = original.value
  if (
    await run(
      () => runtime.policies.native.read(op.device, op.id),
      (v) => (result.value = v),
    )
  ) {
    original.value = undefined
    action.value = undefined
    await router.replace({
      query: { ...route.query, operation: undefined, operationDevice: undefined },
    })
  }
}
if (
  route.query['operationDevice'] === props.endpoint.id &&
  typeof route.query['operation'] === 'string'
) {
  try {
    original.value = { device: props.endpoint.id, id: uuid(route.query['operation']) }
    void lookup()
  } catch {
    failure.value = 'invalidRequest'
  }
}
async function submit() {
  if (!canSubmit.value || !action.value || !primary.value || locked.value) return
  const id = crypto.randomUUID(),
    device = props.endpoint.id
  const input: DeviceControlAction =
    action.value === 'restart'
      ? { kind: 'restart' }
      : action.value === 'lock'
        ? {
            kind: 'lock',
            confirmed: true,
            expectedRegistrationId: primary.value.registrationId,
            expectedGeneration: primary.value.generation,
            pin: pin.value,
          }
        : {
            kind: 'wipe',
            confirmed: true,
            expectedRegistrationId: primary.value.registrationId,
            expectedGeneration: primary.value.generation,
          }
  clearSecrets()
  action.value = undefined
  original.value = { device, id }
  result.value = undefined
  await router.replace({ query: { ...route.query, operation: id, operationDevice: device } })
  try {
    const ok = await runWrite(() =>
      runtime.policies.native.create(device, {
        operationId: id,
        action: input,
        deadline: Math.floor(Date.now() / 1000) + 3600,
      }),
    )
    if (ok) {
      action.value = undefined
      await lookup()
    } else if (!uncertain.value) {
      original.value = undefined
      await router.replace({
        query: { ...route.query, operation: undefined, operationDevice: undefined },
      })
    }
  } finally {
    if (input.kind === 'lock') input.pin = ''
  }
}
</script>
<template>
  <section class="console-panel">
    <h2>{{ t('devices.remoteManagement') }}</h2>
    <p>{{ t('devices.controlAuthority') }}</p>
    <p v-if="!primary">{{ t('devices.not_registered') }}</p>
    <div class="console-inline-actions">
      <UiButton
        v-for="kind in ['restart', 'lock', 'wipe'] as const"
        :key="kind"
        :disabled="locked || !primary || (kind === 'lock' && primary.source === 'mdm.windows')"
        @click="action = kind"
        >{{ t('policies.control_' + kind) }}</UiButton
      >
    </div>
    <p v-if="primary?.source === 'mdm.windows'">{{ t('devices.windowsLockUnsupported') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <UiButton v-if="original" :disabled="busy" @click="lookup">{{
      t('devices.queryOriginal')
    }}</UiButton>
    <article v-if="result">
      <h3>{{ t('devices.operationResult') }}</h3>
      <dl>
        <dt>{{ t('devices.dispatch') }}</dt>
        <dd>{{ result.commandStatus }}</dd>
        <dt>{{ t('devices.receipt') }}</dt>
        <dd>{{ result.observation.progress }}</dd>
        <dt>{{ t('devices.effect') }}</dt>
        <dd>{{ result.observation.effect }}</dd>
      </dl>
      <RouterLink
        :to="{
          name: 'policy-execution',
          params: { tenant: runtime.tenant, execution: result.operationId },
          query: { device: endpoint.id },
        }"
        >{{ t('devices.evidence') }}</RouterLink
      >
    </article>
    <UiDialog
      :open="!!action"
      :title="t('policies.control_' + (action ?? 'restart'))"
      :close-label="t('console.cancel')"
      kind="alertdialog"
      @update:open="!$event && (action = undefined)"
      ><p>{{ deviceName }}</p>
      <p>{{ t('devices.controlConfirmation') }}</p>
      <form @submit.prevent="submit">
        <fieldset :disabled="locked">
          <label v-if="action === 'lock'"
            >{{ t('devices.lockPin')
            }}<input
              v-model="pin"
              class="ui-input"
              type="password"
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              autocomplete="new-password"
              required /></label
          ><label v-if="action === 'wipe'"
            >{{ t('devices.confirmDeviceName')
            }}<input v-model="confirmation" class="ui-input" autocomplete="off" required /></label
          ><UiButton type="submit" variant="danger" :disabled="!canSubmit">{{
            t('devices.confirmAction')
          }}</UiButton>
        </fieldset>
      </form></UiDialog
    >
  </section>
</template>
