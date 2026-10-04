<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { User } from '../../operations/clients/authorization'
import RegistrationFrame from '../components/RegistrationFrame.vue'
import TenantUserSelect from '../components/TenantUserSelect.vue'
const { t } = useI18n(),
  route = useRoute(),
  runtime = useMdm(),
  client = runtime.devices.registration
const { run, runWrite, busy, uncertain, failure } = useOperation()
const device = ref(''),
  principal = ref(''),
  instance = ref(''),
  revision = ref<number>(),
  saved = ref(false)
type Command = { device: string; operation: string; revision: number; user: User | null }
const pending = ref<Command>()
function load() {
  revision.value = undefined
  saved.value = false
  const id = device.value
  void run(
    async () => ({ state: await client.responsibility(id), me: await client.me() }),
    (v) => {
      if (device.value !== id) return
      revision.value = v.state.revision
      principal.value = v.state.user?.principalId ?? ''
      instance.value = v.me.instanceId
    },
  )
}
function save(replay = false) {
  if (!replay && (uncertain.value || revision.value === undefined)) return
  const command = replay
    ? pending.value
    : {
        device: device.value,
        operation: crypto.randomUUID(),
        revision: revision.value!,
        user: principal.value
          ? { tenantId: runtime.tenant, instanceId: instance.value, principalId: principal.value }
          : null,
      }
  if (!command) return
  pending.value = command
  void runWrite(
    () => client.assign(command.device, command.operation, command.revision, command.user),
    (v) => {
      revision.value = v.revision
      principal.value = v.user?.principalId ?? ''
      saved.value = true
      pending.value = undefined
    },
  )
}
watch(
  () => route.fullPath,
  () => {
    device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
    revision.value = undefined
    pending.value = undefined
    principal.value = ''
    saved.value = false
    if (device.value) load()
  },
  { immediate: true },
)
</script>
<template>
  <RegistrationFrame :title="t('registration.user')" :busy="busy" :failure="failure">
    <p>{{ t('registration.responsibilityNote') }}</p>
    <form @submit.prevent="load()">
      <fieldset :disabled="busy || uncertain">
        <label
          >{{ t('devices.deviceId')
          }}<input v-model="device" required maxlength="256" @input="revision = undefined" /></label
        ><button>{{ t('devices.reload') }}</button>
      </fieldset>
    </form>
    <form v-if="revision !== undefined" @submit.prevent="save()">
      <fieldset :disabled="busy || uncertain">
        <TenantUserSelect v-model="principal" :disabled="busy || uncertain" /><button>
          {{ t('registration.save') }}
        </button>
      </fieldset>
    </form>
    <button v-if="uncertain && pending" type="button" :disabled="busy" @click="save(true)">
      {{ t('registration.replay') }}
    </button>
    <p v-if="saved" role="status">{{ t('registration.saved') }}</p>
  </RegistrationFrame>
</template>
