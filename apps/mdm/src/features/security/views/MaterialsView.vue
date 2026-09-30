<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { hasEscrow, materialKinds, type MaterialKind } from '../clients/materials-model'
import { requestTarget } from '../clients/requests-model'
import { useMaterialDisclosure } from '../useMaterialDisclosure'
import SecurityFrame from '../components/SecurityFrame.vue'
import MaterialFacts from '../components/MaterialFacts.vue'
import RequestFacts from '../components/RequestFacts.vue'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.materials,
  op = useOperation(),
  disclosure = useMaterialDisclosure(),
  busy = computed(() => op.busy.value || disclosure.busy.value),
  { uncertain, failure } = op,
  { secret, expiresAt, failure: disclosureFailure } = disclosure
const device = ref(''),
  kind = ref<MaterialKind>('bitlocker'),
  current = ref<Awaited<ReturnType<typeof client.read>>>(),
  grant = ref<Awaited<ReturnType<typeof runtime.security.requests.read>>>(),
  grantId = ref(''),
  action = ref<'reveal' | 'rotate' | 'reescrow'>('reveal'),
  volume = ref(''),
  reason = ref(''),
  from = ref(0),
  until = ref(0),
  requesting = ref(false),
  accepted = ref<string>()
const attempted = reactive(new Set<string>())
let pending: (() => Promise<void>) | undefined
const principal = computed(() => {
  const session = runtime.session.state.value
  return session.status === 'authenticated' && session.tenant === runtime.tenant
    ? session.identity?.principalId
    : undefined
})
const selectableVolumes = computed(() => {
  const m = current.value?.material
  return m?.kind === 'bitlocker'
    ? (m.details?.volumes ?? []).filter((v) => action.value !== 'reveal' || hasEscrow(m, v.id))
    : []
})
const canReveal = computed(
  () =>
    !!principal.value &&
    grant.value?.request.requester === principal.value &&
    grant.value.request.state === 'approved' &&
    grant.value.request.target.kind === 'material_access' &&
    !attempted.has(grant.value.request.id) &&
    current.value?.material.actions.includes('reveal'),
)
function resetSelection() {
  disclosure.clear()
  current.value = undefined
  grant.value = undefined
  grantId.value = ''
  reason.value = ''
  requesting.value = false
  accepted.value = undefined
}
async function load() {
  if (busy.value || !device.value) return
  disclosure.clear()
  grant.value = undefined
  const selectedDevice = device.value,
    selectedKind = kind.value
  if (!uncertain.value) {
    current.value = undefined
    requesting.value = false
    reason.value = ''
    accepted.value = undefined
  }
  await op.run(
    () => client.read(selectedDevice, selectedKind),
    (v) => {
      current.value = v
      volume.value =
        v.material.kind === 'bitlocker' ? (v.material.details?.volumes[0]?.id ?? '') : ''
    },
  )
}
function begin(selected: 'reveal' | 'rotate' | 'reescrow') {
  if (!current.value || busy.value || uncertain.value) return
  disclosure.clear()
  action.value = selected
  volume.value = selectableVolumes.value[0]?.id ?? ''
  from.value = current.value.asOf
  until.value = from.value + (selected === 'reveal' ? 300 : 3600)
  reason.value = ''
  requesting.value = true
}
function submit() {
  if (!current.value || busy.value || uncertain.value) return
  if (
    current.value.material.kind === 'bitlocker' &&
    !selectableVolumes.value.some((v) => v.id === volume.value)
  )
    return
  disclosure.clear()
  const m = current.value.material,
    target = requestTarget({
      kind: action.value === 'reveal' ? 'material_access' : 'material_operation',
      device: m.device,
      material: m.kind,
      materialRevision: m.revision,
      volume: m.kind === 'bitlocker' ? volume.value : null,
      action: action.value,
    }),
    body = operation({
      target,
      reason: reason.value,
      validFrom: from.value,
      validUntil: until.value,
    })
  accepted.value = body.operationId
  pending = async () => {
    if (
      await op.runWrite(
        () => runtime.security.requests.create(body),
        (v) => {
          accepted.value = v.request.id
          grantId.value = v.request.id
          reason.value = ''
          requesting.value = false
        },
      )
    )
      return
    if (!uncertain.value) accepted.value = undefined
  }
  void pending()
}
function readGrant() {
  if (!current.value || busy.value) return
  disclosure.clear()
  grant.value = undefined
  const id = grantId.value,
    m = current.value.material
  void op.run(
    async () => {
      const v = await runtime.security.requests.read(id),
        target = v.request.target
      if (
        target.kind !== 'material_access' ||
        target.device !== m.device ||
        target.material !== m.kind ||
        target.materialRevision !== m.revision
      )
        throw new Error('Wrong disclosure authorization')
      return v
    },
    (v) => (grant.value = v),
  )
}
async function reveal() {
  const request = grant.value?.request
  if (
    !canReveal.value ||
    !request ||
    request.target.kind !== 'material_access' ||
    busy.value ||
    uncertain.value
  )
    return
  attempted.add(request.id)
  await disclosure.reveal({ ...request.target }, { id: request.id, revision: request.revision })
  if (grant.value?.request.id === request.id)
    await op.run(
      () => runtime.security.requests.read(request.id),
      (v) => (grant.value = v),
    )
}
async function changed() {
  resetSelection()
  pending = undefined
  attempted.clear()
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  kind.value = materialKinds.includes(route.query['kind'] as MaterialKind)
    ? (route.query['kind'] as MaterialKind)
    : 'bitlocker'
  if (device.value) await load()
  if (current.value && typeof route.query['request'] === 'string') {
    grantId.value = route.query['request']
    readGrant()
  }
}
watch([device, kind], resetSelection, { flush: 'sync' })
watch(
  grantId,
  () => {
    disclosure.clear()
    grant.value = undefined
  },
  { flush: 'sync' },
)
watch(
  () => route.fullPath,
  () => void changed(),
  { flush: 'sync' },
)
onMounted(() => void changed())
</script>
<template>
  <SecurityFrame :title="t('security.materials')" :busy="busy" :failure="failure">
    <p>{{ t('security.materialHint') }}</p>
    <form @submit.prevent="load">
      <fieldset :disabled="busy || uncertain">
        <label>{{ t('policies.device') }}<input v-model="device" required /></label
        ><label
          >{{ t('security.materialKind')
          }}<select v-model="kind">
            <option v-for="item in materialKinds" :key="item" :value="item">
              {{ t(`security.materialKinds.${item}`) }}
            </option>
          </select></label
        ><button>{{ t('devices.open') }}</button>
      </fieldset>
    </form>
    <section v-if="current">
      <h2>
        {{ current.material.device }} · {{ t(`security.materialKinds.${current.material.kind}`) }}
      </h2>
      <MaterialFacts :material="current.material" /><button :disabled="busy" @click="load">
        {{ t('policies.refresh') }}
      </button>
      <button
        v-for="value in current.material.actions"
        :key="value"
        :disabled="busy || uncertain"
        @click="begin(value)"
      >
        {{ t(`security.materialAction.${value}`) }}
      </button>
      <RouterLink
        :to="{
          name: 'security-actions',
          params: { tenant: runtime.tenant },
          query: { device: current.material.device },
        }"
        >{{ t('security.actions') }}</RouterLink
      >
      <RouterLink
        :to="{
          name: 'operations-audit',
          params: { tenant: runtime.tenant },
          query: { device: current.material.device },
        }"
        >{{ t('operations.audit') }}</RouterLink
      >
    </section>
    <form v-if="requesting && current" data-testid="material-request" @submit.prevent="submit">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t(`security.materialAction.${action}`) }}</legend>
        <label v-if="current.material.kind === 'bitlocker'"
          >{{ t('security.volume')
          }}<select v-model="volume" required>
            <option v-for="v in selectableVolumes" :key="v.id" :value="v.id">
              {{ v.id }}
            </option>
          </select></label
        ><label
          >{{ t('security.justification')
          }}<textarea v-model="reason" required maxlength="512" /></label
        ><label for="material-from">{{ t('security.validFrom') }}</label
        ><UtcTimeInput id="material-from" v-model="from" :max="until - 1" /><label
          for="material-until"
          >{{ t('security.validUntil') }}</label
        ><UtcTimeInput
          id="material-until"
          v-model="until"
          :min="from + 1"
          :max="from + (action === 'reveal' ? 900 : 30 * 86400)"
        /><button>{{ t('security.submitRequest') }}</button>
      </fieldset>
    </form>
    <p v-if="accepted">
      {{ t('security.requestId') }}
      <RouterLink
        :to="{
          name: 'security-requests',
          params: { tenant: runtime.tenant },
          query: { id: accepted },
        }"
        >{{ accepted }}</RouterLink
      >
    </p>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button>
    <section v-if="current && current.material.kind !== 'bootstrap_token'">
      <h2>{{ t('security.disclosure') }}</h2>
      <p>{{ t('security.disclosureHint') }}</p>
      <form @submit.prevent="readGrant">
        <label
          >{{ t('security.requestId')
          }}<input v-model="grantId" :readonly="busy || uncertain" required /></label
        ><button :disabled="busy || uncertain">{{ t('devices.open') }}</button>
      </form>
      <RequestFacts v-if="grant" :request="grant.request" :as-of="grant.asOf" /><button
        :disabled="busy || uncertain || !canReveal"
        data-testid="reveal-material"
        @click="reveal"
      >
        {{ t('security.revealOnce') }}</button
      ><button :disabled="!secret && !disclosure.busy.value" @click="disclosure.clear">
        {{ t('security.clearSecret') }}
      </button>
      <p v-if="disclosureFailure" role="alert">{{ t(`security.${disclosureFailure}`) }}</p>
      <div v-if="secret" role="status">
        <p>
          {{ t('security.shortDisplay') }} {{ expiresAt ? new Date(expiresAt).toISOString() : '' }}
        </p>
        <p data-testid="disclosed-secret" class="security-secret">{{ secret }}</p>
      </div>
    </section>
  </SecurityFrame>
</template>
