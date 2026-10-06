<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { generateEnrollmentPassword } from '../../devices/clients/enrollment'
import { usePermission } from '../usePermission'
import { useAttachment } from '../useAttachment'
import { platforms, architectures, releaseChannels } from '../clients/packages'
import { configurationFilename } from '../clients/configurations'
import RegistrationFrame from '../../devices/components/RegistrationFrame.vue'
const runtime = useMdm(),
  client = runtime.onboarding.configurations,
  route = useRoute(),
  { t } = useI18n()
const permission = usePermission('agent_enrollment_read', 'agent_enrollment_write')
const { canRead, canWrite } = permission,
  { run, runWrite, busy, uncertain, failure } = useOperation(
    ['service_unavailable', 'issuance_unknown', 'activation_unknown'],
    () => runtime.session.state.value.session?.id,
  )
const delivery = useAttachment(),
  { url, filename } = delivery
const settings = ref<Awaited<ReturnType<typeof client.settings>>>(),
  current = ref<Awaited<ReturnType<typeof client.read>>>()
const lifetime = ref<number | null>(null),
  finite = ref(true),
  amount = ref(1),
  selectedTargets = ref<string[]>([]),
  channels = ref<(typeof releaseChannels)[number][]>(['production'])
const defaultSeconds = ref(86400),
  grantSeconds = ref(300),
  enabledPlatforms = ref<(typeof platforms)[number][]>([]),
  configurationId = ref(''),
  operationId = ref(''),
  pending = ref<'create' | 'revoke' | 'settings'>(),
  basisRead = ref(false),
  pendingRevocation = ref<{ id: string; operationId: string }>(),
  revocationRead = ref(false)
function refresh() {
  if (!canRead.value) return
  void run(
    () => client.settings(),
    (v) => {
      settings.value = v
      defaultSeconds.value = v.values.configurationDefaultSeconds
      grantSeconds.value = v.values.grantSeconds
      enabledPlatforms.value = [...v.values.platforms]
      selectedTargets.value = selectedTargets.value.filter((value) =>
        v.values.platforms.some((platform) => value.startsWith(platform + '/')),
      )
      if (!selectedTargets.value.length && v.values.platforms.length)
        selectedTargets.value = [v.values.platforms[0] + '/x86_64']
      if (pending.value === 'settings') basisRead.value = true
    },
  )
}
async function create() {
  if (
    !canWrite.value ||
    busy.value ||
    uncertain.value ||
    !settings.value ||
    !selectedTargets.value.length ||
    !channels.value.length ||
    selectedTargets.value.some(
      (value) =>
        !settings.value!.values.platforms.some((platform) => value.startsWith(platform + '/')),
    )
  )
    return
  const op = crypto.randomUUID()
  operationId.value = op
  pending.value = 'create'
  current.value = undefined
  delivery.clear()
  const stamp = delivery.stamp()
  let file: Awaited<ReturnType<typeof client.create>> | undefined
  try {
    await runWrite(
      async () => {
        file = await client.create({
          operationId: op,
          secret: generateEnrollmentPassword(),
          lifetimeSeconds: typeof lifetime.value === 'number' ? lifetime.value : null,
          quantity: finite.value ? { kind: 'finite', count: amount.value } : { kind: 'unlimited' },
          targets: selectedTargets.value.map((value) => {
            const [platform, architecture] = value.split('/')
            return {
              platform: platform as (typeof platforms)[number],
              architecture: architecture as (typeof architectures)[number],
            }
          }),
          channels: [...channels.value],
        })
        return file
      },
      (result) => {
        configurationId.value = result.configuration.configurationId
        delivery.deliver(result.file, settings.value!.configurationFilename, stamp)
        pending.value = undefined
      },
    )
  } finally {
    if (file) new Uint8Array(file.file.bytes).fill(0)
  }
}
function read() {
  const id = pendingRevocation.value?.id ?? configurationId.value
  if (!canRead.value || !id || (uncertain.value && pending.value === 'create')) return
  void run(
    () => client.read(id),
    (v) => {
      current.value = v
      if (pending.value === 'revoke') revocationRead.value = true
    },
  )
}
function recover() {
  if (!canRead.value) return
  if (pending.value === 'settings') {
    refresh()
    return
  }
  if (pending.value === 'revoke') {
    read()
    return
  }
  if (!operationId.value) return
  void run(
    () => client.operation(operationId.value),
    (v) => {
      current.value = v ?? undefined
      if (v) configurationId.value = v.configuration.configurationId
    },
  )
}
function revoke() {
  if (
    !canWrite.value ||
    busy.value ||
    (uncertain.value &&
      pending.value !== 'create' &&
      !(pending.value === 'revoke' && pendingRevocation.value && revocationRead.value)) ||
    !current.value ||
    current.value.state !== 'available' ||
    (pendingRevocation.value &&
      current.value.configuration.configurationId !== pendingRevocation.value.id)
  )
    return
  const command = pendingRevocation.value ?? {
    id: current.value.configuration.configurationId,
    operationId: crypto.randomUUID(),
  }
  pendingRevocation.value = command
  operationId.value = command.operationId
  pending.value = 'revoke'
  revocationRead.value = false
  delivery.clear()
  void runWrite(
    () => client.revoke(command.id, command.operationId),
    () => {
      pending.value = undefined
      pendingRevocation.value = undefined
      uncertain.value = false
    },
  ).then((ok) => {
    if (ok) read()
    else if (!uncertain.value && pendingRevocation.value?.operationId === command.operationId) {
      pending.value = undefined
      pendingRevocation.value = undefined
      revocationRead.value = false
    }
  })
}
function confirmRecovery() {
  if (
    (pending.value === 'settings' && basisRead.value) ||
    (current.value && current.value.state !== 'available')
  ) {
    pending.value = undefined
    pendingRevocation.value = undefined
    revocationRead.value = false
    uncertain.value = false
    basisRead.value = false
  }
}
function saveSettings() {
  if (!canWrite.value || !settings.value || uncertain.value) return
  pending.value = 'settings'
  basisRead.value = false
  delivery.clear()
  void runWrite(
    () =>
      client.saveSettings(crypto.randomUUID(), settings.value!.revision, {
        grantSeconds: grantSeconds.value,
        configurationDefaultSeconds: defaultSeconds.value,
        platforms: [...enabledPlatforms.value],
      }),
    () => {
      pending.value = undefined
    },
  ).then((ok) => {
    if (ok) refresh()
  })
}
watch(
  canRead,
  (allowed) => {
    delivery.clear()
    current.value = undefined
    settings.value = undefined
    if (allowed) refresh()
  },
  { immediate: true },
)
watch(canWrite, () => {
  delivery.clear()
})
watch(
  [
    () => route.fullPath,
    () => runtime.session.state.value.session?.id,
    () => runtime.session.state.value.identity?.principalId,
  ],
  () => {
    delivery.clear()
    current.value = undefined
    settings.value = undefined
    operationId.value = ''
    configurationId.value = ''
    pending.value = undefined
    pendingRevocation.value = undefined
    revocationRead.value = false
    uncertain.value = false
  },
  { flush: 'sync' },
)
</script>
<template>
  <RegistrationFrame :title="t('onboarding.configurations')" :busy="busy" :failure="failure">
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <p>{{ t('onboarding.configurationNote') }}</p>
      <button type="button" :disabled="busy" @click="permission.refresh">
        {{ t('onboarding.refreshAccess') }}
      </button>
      <form v-if="canWrite && settings" @submit.prevent="create">
        <fieldset :disabled="busy || uncertain">
          <label
            >{{ t('onboarding.lifetime')
            }}<input
              v-model.number="lifetime"
              type="number"
              min="1"
              :max="settings.configurationMaxSeconds"
          /></label>
          <p>
            {{ t('onboarding.defaultLifetime') }}:
            {{ settings.values.configurationDefaultSeconds }} /
            {{ settings.configurationMaxSeconds }}
          </p>
          <label><input v-model="finite" type="checkbox" />{{ t('onboarding.finite') }}</label>
          <label v-if="finite"
            >{{ t('onboarding.quantity')
            }}<input v-model.number="amount" type="number" required min="1" max="4294967295"
          /></label>
          <p v-else>{{ t('onboarding.unlimited') }}</p>
          <fieldset>
            <legend>{{ t('onboarding.targets') }}</legend>
            <template v-for="p in platforms" :key="p"
              ><label v-for="a in architectures" :key="a"
                ><input
                  v-model="selectedTargets"
                  type="checkbox"
                  :value="`${p}/${a}`"
                  :disabled="!settings.values.platforms.includes(p)"
                />{{ p }} / {{ a }}</label
              ></template
            >
          </fieldset>
          <fieldset>
            <legend>{{ t('onboarding.channel') }}</legend>
            <label v-for="c in releaseChannels" :key="c"
              ><input v-model="channels" type="checkbox" :value="c" />{{ c }}</label
            >
          </fieldset>
          <button :disabled="!selectedTargets.length || !channels.length">
            {{ t('onboarding.createFile') }}
          </button>
        </fieldset>
      </form>
      <a v-if="url" :href="url" :download="filename"
        >{{ t('onboarding.saveFile') }} · {{ configurationFilename }}</a
      >
      <p>{{ t('onboarding.sameDirectory') }}</p>
      <p v-if="operationId">{{ t('devices.operation') }}: {{ operationId }}</p>
      <p v-if="uncertain">{{ t('onboarding.unknownConfiguration') }}</p>
      <button v-if="pending" type="button" :disabled="busy" @click="recover">
        {{ t('onboarding.readOutcome') }}
      </button>
      <form @submit.prevent="read">
        <label
          >{{ t('onboarding.configurationId')
          }}<input v-model="configurationId" required :disabled="busy || uncertain" /></label
        ><button :disabled="busy">{{ t('devices.reload') }}</button>
      </form>
      <dl v-if="current">
        <dt>{{ t('devices.status') }}</dt>
        <dd>{{ current.state }}</dd>
        <dt>{{ t('onboarding.reserved') }}</dt>
        <dd>{{ current.reserved }}</dd>
        <dt>{{ t('onboarding.consumed') }}</dt>
        <dd>{{ current.consumed }}</dd>
        <dt>{{ t('onboarding.remaining') }}</dt>
        <dd>{{ current.remaining ?? t('onboarding.unlimited') }}</dd>
        <dt>{{ t('devices.expires') }}</dt>
        <dd>{{ current.configuration.expiresAt }}</dd>
      </dl>
      <button
        v-if="canWrite && current?.state === 'available'"
        type="button"
        :disabled="busy || (!!pendingRevocation && !revocationRead)"
        @click="revoke"
      >
        {{ t(pendingRevocation ? 'onboarding.retryRevoke' : 'onboarding.revokeConfiguration') }}
      </button>
      <button
        v-if="uncertain && (basisRead || (current && current.state !== 'available'))"
        type="button"
        :disabled="busy"
        @click="confirmRecovery"
      >
        {{ t('onboarding.confirmRecovery') }}
      </button>
      <form v-if="canWrite && settings" @submit.prevent="saveSettings">
        <fieldset :disabled="busy || uncertain">
          <legend>{{ t('onboarding.defaults') }}</legend>
          <label
            >{{ t('onboarding.defaultLifetime')
            }}<input
              v-model.number="defaultSeconds"
              type="number"
              min="1"
              :max="settings.configurationMaxSeconds"
              required /></label
          ><label
            >{{ t('onboarding.grantLifetime')
            }}<input
              v-model.number="grantSeconds"
              type="number"
              min="1"
              :max="settings.grantMaxSeconds"
              required /></label
          ><label v-for="p in platforms" :key="p"
            ><input v-model="enabledPlatforms" type="checkbox" :value="p" />{{ p }}</label
          ><button>{{ t('registration.save') }}</button
          ><button type="button" @click="refresh">{{ t('devices.reload') }}</button>
        </fieldset>
      </form>
    </template>
  </RegistrationFrame>
</template>
