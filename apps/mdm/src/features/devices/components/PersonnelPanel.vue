<script setup lang="ts">
import { VDialog, VCard, VCardActions } from 'vuetify/components'
import { useDialogFocus } from '../../../ui/dialog-focus'
import { VBtn } from 'vuetify/components'
import { computed, ref, watch } from 'vue'

import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { ViewEndpoint } from '../clients/endpoint-model'
import type { User } from '../../operations/clients/authorization'
import TenantUserSelect from './TenantUserSelect.vue'
import PersonDisplay from './PersonDisplay.vue'
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
type Owner = Omit<NonNullable<ViewEndpoint['registrationUser']>, 'display'>
const owner = ref<Owner | undefined>(props.endpoint.registrationUser)
const ownerDisplay = computed(() => {
  const projected = props.endpoint.registrationUser
  const current = owner.value?.user
  const shown = projected?.user
  return !busy.value &&
    !failure.value &&
    owner.value?.revision === projected?.revision &&
    current?.tenantId === shown?.tenantId &&
    current?.instanceId === shown?.instanceId &&
    current?.principalId === shown?.principalId
    ? (projected?.display ?? null)
    : null
})
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
const restoreDialogFocus = useDialogFocus(editing)
</script>
<template>
  <section class="console-panel" :data-personnel-device="endpoint.id" :aria-busy="busy">
    <h2>{{ t('devices.personnel') }}</h2>
    <details>
      <summary>{{ t('devices.originalEndpoint') }}</summary>
      {{ endpoint.id }}
    </details>
    <p>{{ t('devices.personnelNote') }}</p>
    <dl>
      <dt>{{ t('devices.registrationUser') }}</dt>
      <dd>
        <template v-if="owner === undefined">{{ t('devices.notProvided') }}</template>
        <PersonDisplay v-else-if="owner.user" :display="ownerDisplay" />
        <template v-else>{{ t('registration.empty') }}</template>
      </dd>
      <dt>{{ t('devices.currentUser') }}</dt>
      <dd>
        {{
          endpoint.currentUser === undefined
            ? t('devices.notProvided')
            : t('devices.currentUserState.' + endpoint.currentUser.state)
        }}<PersonDisplay
          v-if="endpoint.currentUser?.user"
          :display="endpoint.currentUser.display"
        />
      </dd>
      <template v-if="endpoint.currentUser?.confirmedAt != null"
        ><dt>{{ t('devices.userConfirmedAt') }}</dt>
        <dd>{{ new Date(endpoint.currentUser.confirmedAt * 1000).toISOString() }}</dd></template
      >
    </dl>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <v-btn
      v-if="owner !== undefined && !editing"
      :disabled="busy || uncertain"
      data-action="edit-owner"
      @click="read"
      >{{ t('devices.editOwner') }}</v-btn
    >
    <details v-if="owner?.user || endpoint.currentUser?.user">
      <summary>{{ t('devices.evidence') }}</summary>
      <p>{{ owner?.user?.principalId }}</p>
      <p>{{ endpoint.currentUser?.user?.principalId }}</p>
    </details>
    <v-dialog
      :model-value="editing"
      :aria-label="t('devices.editOwner')"
      :data-state="editing ? 'open' : 'closed'"
      @update:model-value="editing = $event"
      @after-leave="restoreDialogFocus"
      ><v-card :title="t('devices.editOwner')"
        ><div class="device-dialog-body">
          <form @submit.prevent="save()">
            <fieldset :disabled="busy || uncertain">
              <TenantUserSelect v-model="principal" :disabled="busy || uncertain" /><v-btn
                type="submit"
                >{{ t('registration.save') }}</v-btn
              >
            </fieldset>
          </form>
        </div>
        <v-card-actions
          ><v-btn variant="text" @click="editing = false">{{
            t('console.cancel')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
    <v-btn
      v-if="failure === 'conflict' || uncertain"
      :disabled="busy"
      data-action="compare-owner"
      @click="read"
      >{{ t('devices.compare') }}</v-btn
    >
    <v-btn
      v-if="uncertain && pending && compared"
      :disabled="busy"
      data-action="replay-owner"
      @click="save(true)"
      >{{ t('devices.replay') }}</v-btn
    >
    <p v-if="saved" role="status">{{ t('registration.saved') }}</p>
  </section>
</template>
