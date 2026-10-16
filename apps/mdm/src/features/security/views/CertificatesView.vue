<script setup lang="ts">
import { UiButton, UiDialog, UiUtcDateTimeInput } from '@rss/core/components'
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import PageFrame from '../../../components/PageFrame.vue'
import CertificateFacts from '../components/CertificateFacts.vue'
const confirmSubmission = ref(false)
const confirmingAction = ref<'issue'>()
function confirmAction() {
  const action = confirmingAction.value
  confirmingAction.value = undefined
  if (action === 'issue') issue()
}
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
function submitConfirmed() {
  confirmSubmission.value = false
  void request()
}
</script>
<template>
  <PageFrame :title="t('security.certificates')" :busy="busy" :failure="failure">
    <p>{{ t('security.certificateHint') }}</p>
    <section class="console-panel">
      <h2>{{ t('console.activeFilters') }}</h2>
      <form @submit.prevent="load()">
        <label
          >{{ t('policies.device')
          }}<input v-model="device" class="ui-input" :readonly="busy || uncertain"
        /></label>
        <UiButton :disabled="!!(busy || uncertain)" type="submit">{{
          t('devices.reload')
        }}</UiButton>
      </form>
    </section>
    <p v-if="list && !list.items.length">{{ t('security.emptyCertificates') }}</p>
    <ul class="console-object-list">
      <li v-for="c in list?.items" :key="c.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="open(c.id)">
          {{ c.device }} · {{ c.profile.name }}
        </UiButton>
        · {{ t(`security.certificateStates.${c.validity}`) }}
      </li>
    </ul>
    <UiButton
      v-if="list?.nextCursor"
      :disabled="!!(busy || uncertain)"
      type="submit"
      @click="load(list.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
    <section v-if="current" class="console-panel" data-testid="certificate-detail">
      <h2>{{ current.certificate.device }}</h2>
      <CertificateFacts :certificate="current.certificate" />
      <UiButton
        :disabled="!!busy"
        data-testid="refresh-certificate"
        type="submit"
        @click="open(current.certificate.id)"
      >
        {{ t('policies.refresh') }}
      </UiButton>
      <UiButton
        :disabled="
          !!(
            busy ||
            uncertain ||
            !current.certificate.source ||
            ['requested', 'unknown'].includes(current.certificate.issuance?.state ?? '')
          )
        "
        data-testid="issue-certificate"
        type="submit"
        @click="confirmingAction = 'issue'"
      >
        {{
          t(
            current.certificate.installed
              ? 'security.renewCertificate'
              : 'security.issueCertificate',
          )
        }}
      </UiButton>
      <UiButton
        v-if="
          current.certificate.issuance?.credential &&
          current.certificate.issuance.credential.fingerprint !==
            current.certificate.installed?.credential.fingerprint
        "
        :disabled="!!(busy || uncertain || !current.certificate.source)"
        data-testid="deploy-certificate"
        type="submit"
        @click="beginRequest"
      >
        {{ t('security.deployCertificate') }}
      </UiButton>
      <nav class="console-inline-actions" :aria-label="t('security.relatedRecords')">
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
    <section v-if="requesting" class="console-panel">
      <h2>{{ t('console.review') }}</h2>
      <form data-testid="certificate-request" @submit.prevent="confirmSubmission = true">
        <fieldset :disabled="busy || uncertain">
          <legend>{{ t('security.deployCertificate') }}</legend>
          <label
            >{{ t('security.justification')
            }}<textarea v-model="reason" class="ui-input" required maxlength="512" />
          </label>
          <label for="certificate-from">{{ t('security.validFrom') }}</label
          ><UiUtcDateTimeInput
            id="certificate-from"
            required
            :invalid-label="t('policies.invalidDate')"
            :model-value="from"
            :max="until - 1"
            @update:model-value="from = $event ?? Number.NaN"
          />
          <label for="certificate-until">{{ t('security.validUntil') }}</label
          ><UiUtcDateTimeInput
            id="certificate-until"
            required
            :invalid-label="t('policies.invalidDate')"
            :model-value="until"
            :min="from + 1"
            @update:model-value="until = $event ?? Number.NaN"
          />
          <UiButton type="submit">{{ t('security.submitRequest') }}</UiButton>
        </fieldset>
      </form>
    </section>
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
    <UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="pending()">
      {{ t('policies.replay') }}
    </UiButton>
    <UiDialog
      :open="!!confirmingAction"
      :title="t('console.review')"
      :description="t('console.scopeBound')"
      :close-label="t('console.close')"
      kind="alertdialog"
      @update:open="!$event && (confirmingAction = undefined)"
      ><p>{{ current?.certificate.device }} · {{ current?.certificate.profile.name }}</p>
      <p>{{ confirmingAction ? t(`console.confirmActions.${confirmingAction}`) : '' }}</p>
      <template #footer
        ><UiButton :disabled="busy || uncertain" @click="confirmAction">{{
          t('identity.confirm')
        }}</UiButton></template
      ></UiDialog
    ><UiDialog
      :open="confirmSubmission"
      :title="t('console.review')"
      :description="t('console.scopeBound')"
      :close-label="t('console.close')"
      kind="alertdialog"
      @update:open="confirmSubmission = $event"
      ><p>{{ current?.certificate.device }} · {{ current?.certificate.profile.name }}</p>
      <template #footer
        ><UiButton :disabled="busy || uncertain" @click="submitConfirmed">{{
          t('identity.confirm')
        }}</UiButton></template
      ></UiDialog
    ></PageFrame
  >
</template>
