<script setup lang="ts">
import { ref, watch } from 'vue'
import { UiButton } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { ViewEndpoint } from '../clients/endpoint-model'
import type { User } from '../../operations/clients/authorization'
import TenantUserSelect from './TenantUserSelect.vue'
const props = defineProps<{ endpoint: ViewEndpoint }>()
const emit = defineEmits<{ changed: []; invalidated: [reason: 'denied'] }>()
const runtime = useMdm(),
  { t } = useI18n()
const { run, runWrite, busy, failure, uncertain } = useOperation([], () => [
  ...deviceBinding(runtime),
  props.endpoint.id,
])
const editing = ref(false),
  principal = ref(''),
  instance = ref(''),
  saved = ref(false),
  compared = ref(false)
const owner = ref(props.endpoint.registrationUser)
const pending = ref<{ operation: string; revision: number; user: User | null }>()
watch(
  () => JSON.stringify([props.endpoint, ...deviceBinding(runtime)]),
  () => {
    owner.value = props.endpoint.registrationUser
    editing.value = false
    pending.value = undefined
    compared.value = false
    saved.value = false
  },
  { flush: 'sync' },
)
async function read() {
  await run(
    async () => ({
      state: await runtime.devices.registration.responsibility(props.endpoint.id),
      me: await runtime.devices.registration.me(),
    }),
    (value) => {
      owner.value = value.state
      instance.value = value.me.instanceId
      principal.value = value.state.user?.principalId ?? ''
      editing.value = true
      if (uncertain.value) compared.value = true
    },
  )
  if (failure.value === 'denied') emit('invalidated', 'denied')
}
async function save(replay = false) {
  if (busy.value || !owner.value || (uncertain.value && (!replay || !compared.value))) return
  const command = replay
    ? pending.value
    : {
        operation: crypto.randomUUID(),
        revision: owner.value.revision,
        user: principal.value
          ? { tenantId: runtime.tenant, instanceId: instance.value, principalId: principal.value }
          : null,
      }
  if (!command) return
  pending.value = command
  compared.value = false
  await runWrite(
    () =>
      runtime.devices.registration.assign(
        props.endpoint.id,
        command.operation,
        command.revision,
        command.user,
      ),
    (value) => {
      owner.value = value
      saved.value = true
      pending.value = undefined
      editing.value = false
      emit('changed')
    },
  )
  if (failure.value === 'denied') emit('invalidated', 'denied')
}
</script>
<template>
  <section class="console-panel" :data-personnel-device="endpoint.id" :aria-busy="busy">
    <h2>{{ t('devices.personnel') }} · {{ endpoint.id }}</h2>
    <p>{{ t('devices.personnelNote') }}</p>
    <dl>
      <dt>{{ t('devices.registrationUser') }}</dt>
      <dd>
        {{
          owner === undefined
            ? t('devices.notProvided')
            : (owner.user?.principalId ?? t('registration.empty'))
        }}
      </dd>
      <dt>{{ t('devices.currentUser') }}</dt>
      <dd>
        {{
          endpoint.currentUser === undefined
            ? t('devices.notProvided')
            : t('devices.currentUserState.' + endpoint.currentUser.state)
        }}<span v-if="endpoint.currentUser?.user">
          · {{ endpoint.currentUser.user.principalId }}</span
        >
      </dd>
      <template v-if="endpoint.currentUser?.confirmedAt != null"
        ><dt>{{ t('devices.userConfirmedAt') }}</dt>
        <dd>{{ new Date(endpoint.currentUser.confirmedAt * 1000).toISOString() }}</dd></template
      >
    </dl>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <UiButton
      v-if="owner !== undefined && !editing"
      :disabled="busy || uncertain"
      data-action="edit-owner"
      @click="read"
      >{{ t('devices.editOwner') }}</UiButton
    >
    <form v-if="editing" @submit.prevent="save()">
      <fieldset :disabled="busy || uncertain">
        <TenantUserSelect v-model="principal" :disabled="busy || uncertain" /><UiButton
          type="submit"
          >{{ t('registration.save') }}</UiButton
        >
      </fieldset>
    </form>
    <UiButton
      v-if="failure === 'conflict' || uncertain"
      :disabled="busy"
      data-action="compare-owner"
      @click="read"
      >{{ t('devices.compare') }}</UiButton
    >
    <UiButton
      v-if="uncertain && pending && compared"
      :disabled="busy"
      data-action="replay-owner"
      @click="save(true)"
      >{{ t('devices.replay') }}</UiButton
    >
    <p v-if="saved" role="status">{{ t('registration.saved') }}</p>
  </section>
</template>
