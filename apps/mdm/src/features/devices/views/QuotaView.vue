<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { Limits } from '../clients/registration'
import { registrationChannels as channels } from '../../../services/registrationChannels'
import type { User } from '../../operations/clients/authorization'
import RegistrationChannels from '../../../components/RegistrationChannels.vue'
import { usePermission } from '../../enrollment/usePermission'
import PageFrame from '../../../components/PageFrame.vue'
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
function updateLimit(channel: (typeof channels)[number], event: Event) {
  const value = (event.target as HTMLInputElement).value
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
  <PageFrame :title="t('registration.quotas')" :busy="busy" :failure="failure">
    <RegistrationChannels />
    <template v-if="canRead">
      <p>{{ t('registration.note') }}</p>
      <p>{{ t('registration.zero') }}</p>
      <fieldset :disabled="busy || uncertain">
        <label
          >{{ t('registration.quotas')
          }}<select v-model="mode" class="ui-input" @change="load()">
            <option value="defaults">{{ t('registration.defaults') }}</option>
            <option value="override">{{ t('registration.override') }}</option>
          </select></label
        >
        <TenantUserSelect
          v-if="mode === 'override'"
          v-model="principal"
          :disabled="busy || uncertain"
          @update:model-value="load()"
        />
      </fieldset>
      <p v-if="mode === 'override' && !principal">{{ t('registration.selectUser') }}</p>
      <section v-if="revision !== undefined" class="console-panel">
        <h2>{{ t('registration.quotas') }}</h2>
        <form @submit.prevent="save()">
          <fieldset :disabled="busy || uncertain || !canWrite">
            <label v-for="channel in channels" :key="channel"
              >{{ t(`registration.${channel}`) }}
              <input
                class="ui-input"
                :value="limits[channel] ?? ''"
                type="number"
                min="0"
                max="4294967295"
                step="1"
                :required="mode === 'defaults'"
                @input="updateLimit(channel, $event)"
              />
              <UiButton v-if="mode === 'override'" type="button" @click="limits[channel] = null">
                {{ t('registration.inherit') }}
              </UiButton>
            </label>
            <UiButton type="submit">{{ t('registration.save') }}</UiButton>
          </fieldset>
        </form>
      </section>
      <UiButton v-if="uncertain && pending" type="button" :disabled="!!busy" @click="save(true)">
        {{ t('registration.replay') }}
      </UiButton>
      <UiButton type="button" :disabled="!!(busy || uncertain)" @click="load()">
        {{ t('devices.reload') }}
      </UiButton>
      <p v-if="saved" role="status">{{ t('registration.saved') }}</p>
      <div v-if="currentUsage" class="ui-table-scroll">
        <table class="ui-table">
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
        </table>
      </div>
    </template>
  </PageFrame>
</template>
