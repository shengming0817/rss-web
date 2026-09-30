<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import SecurityFrame from '../components/SecurityFrame.vue'
import CertificateFacts from '../components/CertificateFacts.vue'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.certificates,
  { run, runWrite, busy, failure, uncertain } = useOperation(),
  list = ref<Awaited<ReturnType<typeof client.list>>>(),
  current = ref<Awaited<ReturnType<typeof client.read>>>(),
  device = ref(''),
  appliedDevice = ref<string>(),
  requesting = ref(false),
  reason = ref(''),
  from = ref(0),
  until = ref(0),
  accepted = ref<string>()
let pending: (() => Promise<void>) | undefined
function load(cursor?: string) {
  if (busy.value || uncertain.value) return
  current.value = undefined
  requesting.value = false
  reason.value = ''
  accepted.value = undefined
  const filter = cursor ? appliedDevice.value : device.value || undefined
  if (!cursor) {
    list.value = undefined
    appliedDevice.value = undefined
  }
  void run(
    () => client.list(filter, cursor),
    (v) => {
      list.value = v
      appliedDevice.value = filter
    },
  )
}
function open(id: string) {
  if (busy.value || (uncertain.value && current.value?.certificate.id !== id)) return
  if (!uncertain.value) {
    current.value = undefined
    requesting.value = false
    reason.value = ''
    accepted.value = undefined
  }
  void run(
    () => client.read(id),
    (v) => {
      current.value = v
    },
  )
}
function issue() {
  if (!current.value || busy.value || uncertain.value) return
  const id = current.value.certificate.id,
    body = operation({}, current.value.certificate.revision)
  pending = async () => {
    if (
      await runWrite(
        () => client.issue(id, body),
        (v) => {
          current.value = v
          requesting.value = false
        },
      )
    )
      await run(
        () => client.read(id),
        (v) => {
          current.value = v
        },
      )
  }
  void pending()
}
function beginRequest() {
  if (!current.value || busy.value || uncertain.value) return
  requesting.value = true
  reason.value = ''
  from.value = current.value.asOf
  until.value = from.value + 3600
}
function request() {
  if (!current.value || busy.value || uncertain.value) return
  const c = current.value.certificate,
    issued = c.issuance?.credential
  if (!issued) return
  const body = operation({
    target: {
      kind: 'certificate_deploy' as const,
      device: c.device,
      certificate: c.id,
      certificateRevision: c.revision,
      fingerprint: issued.fingerprint,
    },
    reason: reason.value,
    validFrom: from.value,
    validUntil: until.value,
  })
  accepted.value = body.operationId
  pending = async () => {
    const ok = await runWrite(
      () => runtime.security.requests.create(body),
      (v) => {
        accepted.value = v.request.id
        requesting.value = false
        reason.value = ''
      },
    )
    if (!ok && !uncertain.value) accepted.value = undefined
  }
  void pending()
}
function changed() {
  appliedDevice.value = undefined
  list.value = undefined
  current.value = undefined
  requesting.value = false
  reason.value = ''
  accepted.value = undefined
  pending = undefined
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  if (typeof route.query['id'] === 'string') open(route.query['id'])
  else load()
}
watch(() => route.fullPath, changed, { flush: 'sync' })
onMounted(changed)
</script>
<template>
  <SecurityFrame :title="t('security.certificates')" :busy="busy" :failure="failure">
    <p>{{ t('security.certificateHint') }}</p>
    <form @submit.prevent="load()">
      <label
        >{{ t('policies.device') }}<input v-model="device" :readonly="busy || uncertain"
      /></label>
      <button :disabled="busy || uncertain">{{ t('devices.reload') }}</button>
    </form>
    <p v-if="list && !list.items.length">{{ t('security.emptyCertificates') }}</p>
    <ul>
      <li v-for="c in list?.items" :key="c.id">
        <button :disabled="busy || uncertain" @click="open(c.id)">
          {{ c.device }} · {{ c.profile.name }}
        </button>
        · {{ t(`security.certificateStates.${c.validity}`) }}
      </li>
    </ul>
    <button v-if="list?.nextCursor" :disabled="busy || uncertain" @click="load(list.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <section v-if="current" data-testid="certificate-detail">
      <h2>{{ current.certificate.device }}</h2>
      <CertificateFacts :certificate="current.certificate" />
      <button
        :disabled="busy"
        data-testid="refresh-certificate"
        @click="open(current.certificate.id)"
      >
        {{ t('policies.refresh') }}
      </button>
      <button
        :disabled="
          busy ||
          uncertain ||
          !current.certificate.source ||
          ['requested', 'unknown'].includes(current.certificate.issuance?.state ?? '')
        "
        data-testid="issue-certificate"
        @click="issue"
      >
        {{
          t(
            current.certificate.installed
              ? 'security.renewCertificate'
              : 'security.issueCertificate',
          )
        }}
      </button>
      <button
        v-if="
          current.certificate.issuance?.credential &&
          current.certificate.issuance.credential.fingerprint !==
            current.certificate.installed?.credential.fingerprint
        "
        :disabled="busy || uncertain || !current.certificate.source"
        data-testid="deploy-certificate"
        @click="beginRequest"
      >
        {{ t('security.deployCertificate') }}
      </button>
      <nav class="device-actions" :aria-label="t('security.relatedRecords')">
        <RouterLink
          :to="{
            name: 'device-detail',
            params: { tenant: runtime.tenant, device: current.certificate.device },
          }"
          >{{ t('policies.device') }}</RouterLink
        >
        <RouterLink
          v-for="name in ['security-actions', 'operations-alerts', 'operations-audit']"
          :key="name"
          :to="{
            name,
            params: { tenant: runtime.tenant },
            query: { device: current.certificate.device },
          }"
          >{{ t(name.replace('-', '.')) }}</RouterLink
        >
      </nav>
    </section>
    <form v-if="requesting" data-testid="certificate-request" @submit.prevent="request">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('security.deployCertificate') }}</legend>
        <label
          >{{ t('security.justification') }}<textarea v-model="reason" required maxlength="512" />
        </label>
        <label for="certificate-from">{{ t('security.validFrom') }}</label
        ><UtcTimeInput id="certificate-from" v-model="from" :max="until - 1" />
        <label for="certificate-until">{{ t('security.validUntil') }}</label
        ><UtcTimeInput id="certificate-until" v-model="until" :min="from + 1" />
        <button>{{ t('security.submitRequest') }}</button>
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
  </SecurityFrame>
</template>
