<script setup lang="ts">
import { VForm, VSelect, VTextField, VBtn, VCard, VCardText, VTable } from 'vuetify/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { Limits } from '../clients/registration'
import { registrationChannels as channels } from '../../../services/registrationChannels'
import type { User } from '../../operations/clients/authorization'
import RegistrationChannels from '../../../components/RegistrationChannels.vue'
import { usePermission } from '../../enrollment/usePermission'
import MdmPage from '../../../ui/MdmPage.vue'
import TenantUserSelect from '../components/TenantUserSelect.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.devices.registration
const { run, runWrite, busy, uncertain, failure } = useOperation([], () => [
  runtime.session.state.value.tenant ?? undefined,
  runtime.session.state.value.identity?.principalId,
  runtime.session.state.value.session?.id,
])
const { canRead, canWrite } = usePermission(
  'registration_configuration_read',
  'registration_configuration_write',
)
const mode = ref<'defaults' | 'override'>('defaults'),
  principal = ref(''),
  instance = ref('')
const revision = ref<number>(),
  limits = ref<Limits>({ agent: 20, windows_mdm: 20, macos_mdm: 20 })
const currentUsage = ref<Awaited<ReturnType<typeof client.usage>>>()
const saved = ref(false)
type Command = { operation: string; revision: number; limits: Limits; target?: User | undefined }
const pending = ref<Command>()
function updateLimit(channel: (typeof channels)[number], value: string) {
  limits.value[channel] = value === '' ? null : Number(value)
}
function target(): User | undefined {
  return mode.value === 'override'
    ? { tenantId: runtime.tenant, instanceId: instance.value, principalId: principal.value }
    : undefined
}
function load() {
  revision.value = undefined
  currentUsage.value = undefined
  saved.value = false
  if (!canRead.value) return
  if (mode.value === 'override' && !principal.value) return
  void run(
    async () => {
      if (mode.value === 'override' && !instance.value)
        instance.value = (await runtime.operations.authorization.effective()).instanceId
      const user = target()
      return {
        config: await client.configuration(user),
        usage: user ? await client.usage(user) : undefined,
      }
    },
    (v) => {
      revision.value = v.config.revision
      limits.value = v.config.limits
      currentUsage.value = v.usage
    },
  )
}
function save(replay = false) {
  if (!canWrite.value) return
  if (!replay && (uncertain.value || revision.value === undefined)) return
  const command = replay
    ? pending.value
    : {
        operation: crypto.randomUUID(),
        revision: revision.value!,
        limits: { ...limits.value },
        target: target(),
      }
  if (!command) return
  pending.value = command
  void runWrite(
    () => client.change(command.operation, command.revision, command.limits, command.target),
    (v) => {
      revision.value = v.revision
      limits.value = v.limits
      saved.value = true
      pending.value = undefined
      currentUsage.value = undefined
    },
  ).then((ok) => {
    if (ok && command.target)
      void run(
        () => client.usage(command.target!),
        (v) => {
          currentUsage.value = v
        },
      )
  })
}
watch(
  canRead,
  (allowed) => {
    revision.value = undefined
    currentUsage.value = undefined
    pending.value = undefined
    if (allowed) load()
  },
  { immediate: true },
)
</script>
<template>
  <MdmPage :title="t('registration.quotas')" :busy="busy" :failure="failure">
    <RegistrationChannels />
    <template v-if="canRead">
      <p>{{ t('registration.note') }}</p>
      <p>{{ t('registration.zero') }}</p>
      <fieldset :disabled="busy || uncertain">
        <v-select
          v-model="mode"
          :label="t('registration.quotas')"
          :disabled="busy || uncertain"
          :items="[
            { value: 'defaults', title: t('registration.defaults') },
            { value: 'override', title: t('registration.override') },
          ]"
          @update:model-value="load()"
        />
        <TenantUserSelect
          v-if="mode === 'override'"
          v-model="principal"
          :disabled="busy || uncertain"
          @update:model-value="load()"
        />
      </fieldset>
      <p v-if="mode === 'override' && !principal">{{ t('registration.selectUser') }}</p>
      <v-card v-if="revision !== undefined" variant="outlined" class="console-panel"
        ><v-card-text>
          <h2>{{ t('registration.quotas') }}</h2>
          <v-form @submit.prevent="save()">
            <fieldset :disabled="busy || uncertain || !canWrite">
              <div v-for="channel in channels" :key="channel" class="mb-4">
                <v-text-field
                  :label="t(`registration.${channel}`)"
                  :model-value="limits[channel] ?? ''"
                  type="number"
                  min="0"
                  max="4294967295"
                  step="1"
                  :required="mode === 'defaults'"
                  :disabled="busy || uncertain || !canWrite"
                  @update:model-value="updateLimit(channel, $event)"
                />
                <v-btn
                  v-if="mode === 'override'"
                  type="button"
                  variant="text"
                  :disabled="busy || uncertain || !canWrite"
                  @click="limits[channel] = null"
                  >{{ t('registration.inherit') }}</v-btn
                >
              </div>
              <v-btn type="submit" :disabled="busy || uncertain || !canWrite">{{
                t('registration.save')
              }}</v-btn>
            </fieldset>
          </v-form>
        </v-card-text></v-card
      >
      <v-btn v-if="uncertain && pending" type="button" :disabled="!!busy" @click="save(true)">
        {{ t('registration.replay') }}
      </v-btn>
      <v-btn type="button" :disabled="!!(busy || uncertain)" @click="load()">
        {{ t('devices.reload') }}
      </v-btn>
      <p v-if="saved" role="status">{{ t('registration.saved') }}</p>
      <v-table v-if="currentUsage">
        <thead>
          <tr>
            <th>{{ t('devices.source') }}</th>
            <th>{{ t('registration.limit') }}</th>
            <th>{{ t('registration.active') }}</th>
            <th>{{ t('registration.reserved') }}</th>
            <th>{{ t('registration.overLimit') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in currentUsage.channels" :key="c.channel">
            <th>{{ t(`registration.${c.channel}`) }}</th>
            <td>{{ c.limit }}</td>
            <td>{{ c.active }}</td>
            <td>{{ c.reserved }}</td>
            <td>{{ c.overLimit }}</td>
          </tr>
        </tbody>
      </v-table>
    </template>
  </MdmPage>
</template>
