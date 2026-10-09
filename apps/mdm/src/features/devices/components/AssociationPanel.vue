<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import { currentMember, type EndpointDetail, type Member } from '../clients/endpoint-model'
import { verificationText, type Association } from '../clients/associations'
import type { DeviceView } from '../clients/device-views'
import { associationRecovery, type PendingAssociation } from '../associationRecovery'
import type { Grant } from '../../operations/clients/authorization'
const props = defineProps<{ endpoint?: EndpointDetail; association?: Association }>()
const emit = defineEmits<{ changed: [association: Association]; denied: [] }>()
const { t } = useI18n(),
  runtime = useMdm(),
  { run, runWrite, busy, failure } = useOperation([], () => [
    ...deviceBinding(runtime),
    props.endpoint?.id,
    props.association?.id,
  ])
const grants = ref<Grant[]>([]),
  authorityLoaded = ref(false),
  page = ref<Awaited<ReturnType<typeof runtime.devices.associations.candidates>>>(),
  selected = ref(''),
  channel = ref<Member['channel']>('mdm'),
  origin = ref<Member>(),
  candidateView = ref<DeviceView>(),
  candidateDetail = ref<EndpointDetail>(),
  prepared = ref<{ association: Association; members: Member[] }>(),
  evidence = ref(''),
  reason = ref(''),
  verified = ref(false),
  replayConfirmed = ref(false),
  stale = ref(false)
const recovery = shallowRef(
  associationRecovery(
    runtime,
    props.association ? `association:${props.association.id}` : `endpoint:${props.endpoint?.id}`,
  ),
)
const pending = computed(() => {
  return recovery.value.pending.value
})
const uncertain = computed(() => pending.value?.state === 'unknown')
const locked = computed(() => !!pending.value)
function can(id: string) {
  return grants.value.some(
    (g) =>
      g.operation === 'device_association_write' &&
      (g.scope.kind === 'all_devices' || (g.scope.kind === 'device' && g.scope.id === id)),
  )
}
const manageable = computed(
  () =>
    authorityLoaded.value &&
    (props.association
      ? props.association.members.every((m) => can(m.device))
      : !!props.endpoint && can(props.endpoint.id)),
)
const currentAssociation = computed(() => prepared.value?.association ?? props.association)
const confirmationMembers = computed(() =>
  props.association
    ? (prepared.value?.members ?? [])
    : [origin.value, target.value].filter((m): m is Member => !!m),
)
const target = computed(() => page.value?.items.find((m) => m.device === selected.value))
const targetCurrent = computed(
  () =>
    !!target.value &&
    !!candidateDetail.value?.channels.some(
      (c) =>
        c.channel === target.value?.channel &&
        c.registrationId === target.value?.registrationId &&
        c.generation === target.value?.generation &&
        c.status === 'active',
    ),
)
const canSubmit = computed(
  () =>
    manageable.value &&
    !busy.value &&
    !locked.value &&
    !stale.value &&
    verified.value &&
    verificationText(evidence.value) &&
    (props.association
      ? !!prepared.value && confirmationMembers.value.length === 2
      : !!origin.value && !!target.value && can(target.value.device) && targetCurrent.value),
)
function clear() {
  grants.value = []
  authorityLoaded.value = false
  page.value = undefined
  selected.value = ''
  origin.value = undefined
  candidateView.value = undefined
  candidateDetail.value = undefined
  prepared.value = undefined
  evidence.value = ''
  reason.value = ''
  verified.value = false
  replayConfirmed.value = false
  stale.value = false
}
async function refreshAuthority() {
  await run(
    () => runtime.operations.authorization.effective(),
    (value) => {
      const s = runtime.session.state.value
      if (value.tenantId === runtime.tenant && value.principalId === s.identity?.principalId) {
        grants.value = value.grants
        authorityLoaded.value = true
      } else throw new Error('Wrong authorization identity')
    },
  )
}
watch(
  () => [...deviceBinding(runtime), props.endpoint?.id, props.association?.id],
  () => {
    clear()
    recovery.value = associationRecovery(
      runtime,
      props.association ? `association:${props.association.id}` : `endpoint:${props.endpoint?.id}`,
    )
    channel.value = props.endpoint?.channels.find((c) => c.status === 'active')?.channel ?? 'mdm'
    void refreshAuthority()
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => props.association?.version,
  () => {
    prepared.value = undefined
    verified.value = false
  },
)
watch(channel, () => {
  page.value = undefined
  selected.value = ''
  origin.value = undefined
  candidateView.value = undefined
  candidateDetail.value = undefined
  verified.value = false
})
async function candidates(after?: string) {
  if (!props.endpoint || !manageable.value || locked.value) return
  selected.value = ''
  candidateView.value = undefined
  candidateDetail.value = undefined
  verified.value = false
  prepared.value = undefined
  page.value = undefined
  origin.value = undefined
  await run(
    async () => ({
      endpoint: await runtime.devices.directory.detail(props.endpoint!.id),
      page: await runtime.devices.associations.candidates(props.endpoint!.id, channel.value, after),
    }),
    (v) => {
      origin.value = currentMember(v.endpoint, channel.value)
      page.value = v.page
      stale.value = false
    },
  )
  handleFailure()
}
async function select() {
  candidateView.value = undefined
  candidateDetail.value = undefined
  verified.value = false
  const id = selected.value
  if (!id) return
  await run(
    async () => ({
      view: await runtime.devices.views.detail({ kind: 'endpoint', id }),
      detail: await runtime.devices.directory.detail(id),
    }),
    (v) => {
      candidateView.value = v.view
      candidateDetail.value = v.detail
    },
  )
  handleFailure()
}
async function prepare() {
  if (!props.association || !manageable.value || locked.value) return
  prepared.value = undefined
  verified.value = false
  await run(
    async () => {
      const a = await runtime.devices.associations.get(props.association!.id),
        details = await Promise.all(
          a.members.map((m) => runtime.devices.directory.detail(m.device)),
        )
      return {
        association: a,
        members: a.members.map((m, i) => currentMember(details[i]!, m.channel)),
      }
    },
    (v) => {
      prepared.value = {
        association: v.association,
        members: v.members.filter((m): m is Member => !!m),
      }
      stale.value = false
    },
  )
  handleFailure()
}
function handleFailure() {
  if (failure.value === 'denied' || failure.value === 'notFound') {
    grants.value = []
    authorityLoaded.value = false
    page.value = undefined
    selected.value = ''
    candidateView.value = undefined
    candidateDetail.value = undefined
    prepared.value = undefined
    origin.value = undefined
    emit('denied')
  } else if (failure.value === 'conflict') {
    stale.value = true
    verified.value = false
  }
}
async function execute(value: PendingAssociation) {
  const acknowledged = await runWrite(
    () =>
      recovery.value.dispatch(value, () =>
        value.kind === 'confirm'
          ? runtime.devices.associations.confirm(value.body)
          : runtime.devices.associations.revoke(value.id, value.body),
      ),
    (a) => {
      verified.value = false
      replayConfirmed.value = false
      emit('changed', a)
    },
  )
  if (!acknowledged) handleFailure()
}
function confirm() {
  if (!canSubmit.value) return
  const members = confirmationMembers.value,
    mdm = members.find((m) => m.channel === 'mdm')!,
    agent = members.find((m) => m.channel === 'agent')!
  void execute({
    kind: 'confirm',
    body: {
      operationId: crypto.randomUUID(),
      associationId: currentAssociation.value?.id ?? null,
      expectedVersion: currentAssociation.value?.version ?? 0,
      mdm: { ...mdm },
      agent: { ...agent },
      evidence: evidence.value,
    },
  })
}
function revoke() {
  if (
    !currentAssociation.value ||
    !manageable.value ||
    busy.value ||
    locked.value ||
    stale.value ||
    !verified.value ||
    !verificationText(reason.value)
  )
    return
  void execute({
    kind: 'revoke',
    id: currentAssociation.value.id,
    body: {
      operationId: crypto.randomUUID(),
      expectedVersion: currentAssociation.value.version,
      reason: reason.value,
    },
  })
}
function replay() {
  if (
    !pending.value ||
    !uncertain.value ||
    !replayConfirmed.value ||
    !manageable.value ||
    busy.value
  )
    return
  void execute(structuredClone(pending.value.request))
}
</script>
<template>
  <section
    v-if="!authorityLoaded && (busy || failure)"
    :aria-busy="busy"
    class="identity-card"
    data-testid="association-authority"
  >
    <p>{{ t('devices.associationManagement') }}</p>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <button :disabled="busy" @click="refreshAuthority">{{ t('devices.retryAuthority') }}</button>
  </section>
  <section
    v-if="manageable"
    :aria-busy="busy"
    class="identity-card"
    data-testid="association-panel"
  >
    <h2>{{ t('devices.associationManagement') }}</h2>
    <p>{{ t('devices.associationNote') }}</p>
    <p v-if="failure" role="alert">
      {{ t(failure === 'unknownWrite' ? 'devices.associationUnknown' : `devices.${failure}`) }}
    </p>
    <p v-if="stale" role="status">{{ t('devices.associationStale') }}</p>
    <p v-if="uncertain && !failure" role="alert">{{ t('devices.associationUnknown') }}</p>
    <template v-if="uncertain && pending"
      ><p>{{ t('devices.operationId') }}: {{ pending.request.body.operationId }}</p>
      <label
        ><input v-model="replayConfirmed" type="checkbox" :disabled="busy" />{{
          t('devices.confirmReplay')
        }}</label
      ><button :disabled="busy || !replayConfirmed" @click="replay">
        {{ t('devices.replayAssociation') }}
      </button></template
    >
    <fieldset :disabled="busy || locked">
      <template v-if="association"
        ><p v-if="currentAssociation" data-testid="association-basis">
          {{ t('devices.submissionBasis') }}: {{ currentAssociation.id }} /
          {{ currentAssociation.version }} ·
          {{ t(`devices.associationState.${currentAssociation.state}`) }} ·
          {{ currentAssociation.evidence }}
        </p>
        <button @click="prepare">{{ t('devices.prepareVerification') }}</button>
        <p v-if="!prepared || confirmationMembers.length !== 2">
          {{ t('devices.currentRegistrationRequired') }}
        </p></template
      >
      <template v-else-if="endpoint"
        ><label
          >{{ t('devices.originChannel')
          }}<select v-model="channel">
            <option
              v-for="c in endpoint.channels.filter((c) => c.status === 'active')"
              :key="c.channel"
              :value="c.channel"
            >
              {{ c.channel }}
            </option>
          </select></label
        ><button @click="candidates()">{{ t('devices.findCandidate') }}</button>
        <p v-if="page">{{ t('devices.candidateNote') }}</p>
        <p v-if="page && !page.items.length">{{ t('devices.emptyCandidates') }}</p>
        <fieldset v-if="page?.items.length">
          <legend>{{ t('devices.chooseCandidate') }}</legend>
          <label v-for="m in page.items" :key="m.device"
            ><input
              v-model="selected"
              type="radio"
              :value="m.device"
              name="association-candidate"
              @change="select"
            />{{ m.channel }} · {{ m.device }} · {{ m.registrationId }} / {{ m.generation }}</label
          >
        </fieldset>
        <button v-if="page?.nextCursor" @click="candidates(page.nextCursor)">
          {{ t('devices.next') }}
        </button>
        <section v-if="candidateView">
          <h3>{{ t('devices.candidateFacts') }}</h3>
          <p>
            {{
              candidateDetail
                ? t(`devices.endpointState.${candidateDetail.status}`)
                : t('devices.unknown')
            }}
          </p>
          <dl>
            <template v-for="field in candidateView.fields" :key="field.field"
              ><dt>{{ field.field }}</dt>
              <dd>
                {{ t(`devices.state.${field.state.kind}`)
                }}<template v-if="field.state.kind === 'known'">
                  · {{ JSON.stringify(field.state.value.value) }}</template
                >
                <details>
                  <summary>{{ t('devices.evidence') }}</summary>
                  <pre
                    v-for="s in field.sources"
                    :key="`${s.endpoint}:${s.fact.evidence.source}:${s.fact.evidence.dataset}`"
                    >{{ JSON.stringify(s, null, 2) }}</pre
                  >
                </details>
              </dd></template
            >
          </dl>
          <p v-if="!targetCurrent" role="status">{{ t('devices.associationStale') }}</p>
        </section>
      </template>
      <section v-if="confirmationMembers.length" data-testid="confirmation-coordinates">
        <h3>{{ t('devices.confirmationCoordinates') }}</h3>
        <ul>
          <li v-for="m in confirmationMembers" :key="m.device">
            {{ m.channel }} · {{ m.device }} · {{ m.registrationId }} / {{ m.generation }}
          </li>
        </ul>
      </section>
      <label
        >{{ t('devices.verificationEvidence')
        }}<textarea v-model="evidence" maxlength="2048" /></label
      ><label
        ><input v-model="verified" type="checkbox" />{{ t('devices.confirmSameInstance') }}</label
      ><button :disabled="!canSubmit" @click="confirm">
        {{ t(association ? 'devices.reverifyAssociation' : 'devices.confirmAssociation') }}
      </button>
      <template v-if="association"
        ><label>{{ t('devices.revokeReason') }}<textarea v-model="reason" maxlength="2048" /></label
        ><button :disabled="!verified || !verificationText(reason) || stale" @click="revoke">
          {{ t('devices.revokeAssociation') }}
        </button></template
      >
    </fieldset>
  </section>
</template>
