<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import {
  VForm,
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VCheckbox,
  VExpansionPanel,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VExpansionPanels,
  VTextField,
} from 'vuetify/components'
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { generateEnrollmentPassword } from '../../devices/clients/enrollment'
import { usePermission } from '../usePermission'
import { useAttachment } from '../useAttachment'
import { platforms, architectures } from '../clients/packages'
import { configurationFilename, type configuration } from '../clients/configurations'
import RegistrationStatus from '../../../components/RegistrationStatus.vue'
import MdmPage from '../../../ui/MdmPage.vue'
const directoryQuery = useDirectoryQuery(
  [
    'configurationId',
    'state',
    'createdAt',
    'expiresAt',
    'createdBy',
    'targets',
    'quantity',
    'reserved',
    'consumed',
    'remaining',
  ],
  1000,
)

const runtime = useMdm(),
  client = runtime.onboarding.configurations,
  route = useRoute(),
  { t } = useI18n()
const permission = usePermission('agent_enrollment_read', 'agent_enrollment_write')
const { canRead, canWrite } = permission,
  { run, runWrite, busy, uncertain, failure } = useOperation(
    ['service_unavailable', 'issuance_unknown', 'activation_unknown'],
    () => [
      runtime.session.state.value.tenant ?? undefined,
      runtime.session.state.value.identity?.principalId,
      runtime.session.state.value.session?.id,
    ],
  )
const directoryOperation = useOperation([], () => [
  runtime.session.state.value.tenant ?? undefined,
  runtime.session.state.value.identity?.principalId,
  runtime.session.state.value.session?.id,
])
const directory = ref<Awaited<ReturnType<typeof client.list>>>()
function loadDirectory(cursor?: string) {
  if (!canRead.value) return
  directory.value = undefined
  void directoryOperation.run(
    () => directoryQuery.read(cursor, (query) => client.list(query), {}),
    (page) => {
      directory.value = page
    },
  )
}
function selectConfiguration(id: string) {
  if (busy.value || uncertain.value || pending.value) return
  delivery.clear()
  delivered.value = undefined
  current.value = undefined
  configurationId.value = id
  read()
}
const delivery = useAttachment(),
  { url, filename } = delivery
const settings = ref<Awaited<ReturnType<typeof client.settings>>>(),
  current = ref<Awaited<ReturnType<typeof client.read>>>(),
  delivered = ref<ReturnType<typeof configuration>>()
const lifetime = ref<number | null>(null),
  finite = ref(true),
  amount = ref(1),
  selectedTargets = ref<string[]>([])
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
    !runtime.registrationChannels.allowed('agent') ||
    busy.value ||
    uncertain.value ||
    !settings.value ||
    !selectedTargets.value.length ||
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
  delivered.value = undefined
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
        })
        return file
      },
      (result) => {
        if (!canWrite.value || stamp !== delivery.stamp()) return
        delivered.value = result.configuration
        configurationId.value = result.configuration.configurationId
        delivery.deliver(result.file, settings.value!.configurationFilename, stamp)
        pending.value = undefined
      },
    )
    if (failure.value === 'enrollmentPaused') void runtime.registrationChannels.refresh()
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
    current.value.configuration.configurationId !== configurationId.value ||
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
    directory.value = undefined
    if (allowed) {
      refresh()
      loadDirectory()
    }
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
    () => runtime.session.state.value.tenant,
    () => runtime.session.state.value.identity?.principalId,
  ],
  () => {
    delivery.clear()
    current.value = undefined
    settings.value = undefined
    directory.value = undefined
    operationId.value = ''
    configurationId.value = ''
    pending.value = undefined
    pendingRevocation.value = undefined
    revocationRead.value = false
    uncertain.value = false
  },
  { flush: 'sync' },
)
directoryQuery.onClear(() => {
  directory.value = undefined
})
directoryQuery.restrict(canRead)
</script>
<template>
  <MdmPage :title="t('onboarding.configurations')" :busy="busy" :failure="failure">
    <DirectoryControls
      :query="directoryQuery"
      :busy="directoryOperation.busy.value"
      hint="筛选：configurationId / state / createdAt / expiresAt / createdBy / platform / architecture；排序不包含 platform / architecture。"
      @load="loadDirectory"
    />
    <DirectoryResults
      :disabled="busy || uncertain"
      :required="['configurationId']"
      v-if="!directoryQuery.complete.value"
      :items="directory?.items ?? []"
      @open="
        (row) => {
          selectConfiguration(String(row.configurationId))
        }
      "
    />

    <RegistrationStatus channel="agent" />
    <p v-if="!canRead">{{ t('devices.denied') }}</p>
    <template v-else>
      <p>{{ t('onboarding.configurationNote') }}</p>
      <v-btn type="button" :disabled="!!busy" @click="permission.refresh">
        {{ t('onboarding.refreshAccess') }}
      </v-btn>
      <v-card variant="outlined" class="console-panel" :aria-busy="directoryOperation.busy.value"
        ><v-card-text>
          <h2>{{ t('onboarding.configurations') }}</h2>
          <v-btn :disabled="directoryOperation.busy.value" @click="loadDirectory()">{{
            t('devices.reload')
          }}</v-btn>
          <v-alert
            v-if="directoryOperation.failure.value"
            type="error"
            variant="tonal"
            role="alert"
          >
            {{ t('devices.' + directoryOperation.failure.value) }}
          </v-alert>
          <p v-if="directory && !directory.items.length">{{ t('devices.empty') }}</p>
          <p
            v-for="item in directoryQuery.complete.value ? directory?.items : []"
            :key="item.configurationId"
          >
            <v-btn
              :disabled="busy || uncertain || !!pending"
              @click="selectConfiguration(item.configurationId)"
              >{{ item.configurationId }}</v-btn
            >
            {{ item.state }} · {{ item.createdBy }} ·
            {{
              item.targets.map((target) => target.platform + '/' + target.architecture).join(', ')
            }}
            · {{ t('onboarding.remaining') }}: {{ item.remaining ?? t('onboarding.unlimited') }}
          </p>
        </v-card-text></v-card
      >
      <v-expansion-panels
        v-if="canWrite && settings"
        multiple
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{ t('onboarding.createFile') }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <v-form :novalidate="false" data-configuration-create @submit.prevent="create">
              <fieldset :disabled="busy || uncertain">
                <v-text-field
                  v-model.number="lifetime"
                  type="number"
                  min="1"
                  :max="settings.configurationMaxSeconds"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.lifetime')"
                />
                <p>
                  {{ t('onboarding.defaultLifetime') }}:
                  {{ settings.values.configurationDefaultSeconds }} /
                  {{ settings.configurationMaxSeconds }}
                </p>
                <v-checkbox
                  v-model="finite"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.finite')"
                />
                <v-text-field
                  v-if="finite"
                  v-model.number="amount"
                  type="number"
                  required
                  min="1"
                  max="4294967295"
                  :disabled="busy || uncertain"
                  :label="t('onboarding.quantity')"
                />
                <p v-else>{{ t('onboarding.unlimited') }}</p>
                <fieldset>
                  <legend>{{ t('onboarding.targets') }}</legend>
                  <template v-for="p in platforms" :key="p"
                    ><v-checkbox
                      v-for="a in architectures"
                      :key="a"
                      v-model="selectedTargets"
                      :value="`${p}/${a}`"
                      :disabled="busy || uncertain || !settings.values.platforms.includes(p)"
                      :label="p + '/' + a"
                  /></template>
                </fieldset>
                <v-btn
                  type="submit"
                  :disabled="
                    busy ||
                    uncertain ||
                    !!(!selectedTargets.length || !runtime.registrationChannels.allowed('agent'))
                  "
                >
                  {{ t('onboarding.createFile') }}
                </v-btn>
              </fieldset>
            </v-form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
      <v-btn v-if="url" variant="outlined" :href="url" :download="filename"
        >{{ t('onboarding.saveFile') }} · {{ configurationFilename }}</v-btn
      >
      <p v-if="delivered && url">
        {{ t('settings.connections.service') }}
        {{ delivered.connections.configuration.serviceId }} · {{ t('settings.connections.target') }}
        {{ delivered.connections.configuration.revision }}
      </p>
      <p>{{ t('onboarding.sameDirectory') }}</p>
      <p v-if="operationId">{{ t('devices.operation') }}: {{ operationId }}</p>
      <p v-if="uncertain">{{ t('onboarding.unknownConfiguration') }}</p>
      <v-btn v-if="pending" type="button" :disabled="!!busy" @click="recover">
        {{ t('onboarding.readOutcome') }}
      </v-btn>
      <v-card variant="outlined" class="console-panel"
        ><v-card-text>
          <h2>{{ t('onboarding.configurationId') }}</h2>
          <v-form :novalidate="false" @submit.prevent="read">
            <v-text-field
              v-model="configurationId"
              required
              :disabled="busy || uncertain"
              :label="t('onboarding.configurationId')"
            /><v-btn :disabled="!!busy" type="submit">{{ t('devices.reload') }}</v-btn>
          </v-form>
        </v-card-text></v-card
      >
      <dl v-if="current">
        <dt>{{ t('settings.connections.service') }}</dt>
        <dd>{{ current.configuration.connections.configuration.serviceId }}</dd>
        <dt>{{ t('settings.connections.target') }}</dt>
        <dd>{{ current.configuration.connections.configuration.revision }}</dd>
        <dt>{{ t('settings.connections.origins') }}</dt>
        <dd>{{ current.configuration.connections.configuration.origins.join(', ') }}</dd>
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
      <v-btn
        v-if="canWrite && current?.state === 'available'"
        type="button"
        :disabled="!!(busy || (!!pendingRevocation && !revocationRead))"
        @click="revoke"
      >
        {{ t(pendingRevocation ? 'onboarding.retryRevoke' : 'onboarding.revokeConfiguration') }}
      </v-btn>
      <v-btn
        v-if="uncertain && (basisRead || (current && current.state !== 'available'))"
        type="button"
        :disabled="!!busy"
        @click="confirmRecovery"
      >
        {{ t('onboarding.confirmRecovery') }}
      </v-btn>
      <v-expansion-panels
        v-if="canWrite && settings"
        multiple
        class="console-panel console-task"
        :model-value="uncertain ? [0] : undefined"
        ><v-expansion-panel eager
          ><v-expansion-panel-title>{{ t('onboarding.defaults') }}</v-expansion-panel-title
          ><v-expansion-panel-text>
            <v-form :novalidate="false" @submit.prevent="saveSettings">
              <fieldset :disabled="busy || uncertain">
                <legend>{{ t('onboarding.defaults') }}</legend>
                <v-text-field
                  v-model.number="defaultSeconds"
                  type="number"
                  min="1"
                  :max="settings.configurationMaxSeconds"
                  required
                  :disabled="busy || uncertain"
                  :label="t('onboarding.defaultLifetime')"
                /><v-text-field
                  v-model.number="grantSeconds"
                  type="number"
                  min="1"
                  :max="settings.grantMaxSeconds"
                  required
                  :disabled="busy || uncertain"
                  :label="t('onboarding.grantLifetime')"
                /><v-checkbox
                  v-for="p in platforms"
                  :key="p"
                  v-model="enabledPlatforms"
                  :value="p"
                  :disabled="busy || uncertain"
                  :label="p"
                /><v-btn type="submit" :disabled="busy || uncertain">{{
                  t('registration.save')
                }}</v-btn
                ><v-btn type="button" :disabled="busy || uncertain" @click="refresh">{{
                  t('devices.reload')
                }}</v-btn>
              </fieldset>
            </v-form>
          </v-expansion-panel-text></v-expansion-panel
        ></v-expansion-panels
      >
    </template>
  </MdmPage>
</template>
