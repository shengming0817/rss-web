<script setup lang="ts">
import { UiButton, UiUtcDateTimeInput } from '@rss/core/components'
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import PageFrame from '../../../components/PageFrame.vue'
import RiskAssessmentFacts from '../components/RiskAssessmentFacts.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.risks,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const list = ref<Awaited<ReturnType<typeof client.list>>>(),
  risk = ref<Awaited<ReturnType<typeof client.read>>>(),
  devices = ref<Awaited<ReturnType<typeof client.devices>>>(),
  current = ref<Awaited<ReturnType<typeof client.current>>>(),
  history = ref<Awaited<ReturnType<typeof client.history>>>(),
  device = ref(''),
  requesting = ref(false),
  reason = ref(''),
  from = ref(0),
  until = ref(0),
  accepted = ref<string>()
let pending: (() => Promise<void>) | undefined
const at = (value: number) =>
  value <= 253402300799 ? new Date(value * 1000).toISOString() : String(value)
function listRisks(cursor?: string) {
  void run(
    () => client.list(cursor),
    (v) => (list.value = v),
  )
}
async function openRisk(id: string) {
  if (busy.value || uncertain.value) return
  risk.value = undefined
  devices.value = undefined
  current.value = undefined
  history.value = undefined
  requesting.value = false
  reason.value = ''
  accepted.value = undefined
  if (
    await run(
      () => client.read(id),
      (v) => (risk.value = v),
    )
  ) {
    if (typeof route.query['device'] === 'string') openDevice(route.query['device'])
    else loadDevices()
  }
}
function loadDevices(cursor?: string) {
  if (!risk.value) return
  const id = risk.value.risk.id
  void run(
    () => client.devices(id, cursor),
    (v) => (devices.value = v),
  )
}
function openDevice(id = device.value) {
  if (busy.value || !risk.value || (uncertain.value && current.value?.assessment.device !== id))
    return
  const riskId = risk.value.risk.id
  if (!uncertain.value) {
    current.value = undefined
    requesting.value = false
    reason.value = ''
    accepted.value = undefined
  }
  history.value = undefined
  device.value = id
  void run(
    () => client.current(riskId, id),
    (v) => (current.value = v),
  )
}
function readHistory(cursor?: string) {
  if (!current.value) return
  const a = current.value.assessment
  void run(
    () => client.history(a.risk, a.device, cursor),
    (v) => (history.value = v),
  )
}
function reassess() {
  if (busy.value || uncertain.value || !current.value) return
  const a = current.value.assessment,
    body = operation({}, a.version)
  pending = async () => {
    if (
      await runWrite(
        () => client.reassess(a.risk, a.device, body),
        (v) => {
          current.value = v
          history.value = undefined
          requesting.value = false
        },
      )
    )
      await run(
        () => client.current(a.risk, a.device),
        (v) => (current.value = v),
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
  const a = current.value.assessment,
    body = operation({
      target: {
        kind: 'risk_remediation' as const,
        risk: a.risk,
        assessment: a.id,
        assessmentVersion: a.version,
        device: a.device,
      },
      reason: reason.value,
      validFrom: from.value,
      validUntil: until.value,
    })
  accepted.value = body.operationId
  pending = async () => {
    if (
      await runWrite(
        () => runtime.security.requests.create(body),
        (v) => {
          accepted.value = v.request.id
          requesting.value = false
          reason.value = ''
        },
      )
    )
      return
    if (!uncertain.value) accepted.value = undefined
  }
  void pending()
}
function changed() {
  list.value = undefined
  risk.value = undefined
  devices.value = undefined
  current.value = undefined
  history.value = undefined
  device.value = ''
  requesting.value = false
  reason.value = ''
  accepted.value = undefined
  pending = undefined
  if (typeof route.query['id'] === 'string') void openRisk(route.query['id'])
  else listRisks()
}
watch(() => route.fullPath, changed, { flush: 'sync' })
onMounted(changed)
</script>
<template>
  <PageFrame :title="t('security.risks')" :busy="busy" :failure="failure">
    <p>{{ t('security.riskHint') }}</p>
    <UiButton :disabled="!!busy" type="submit" @click="listRisks()">{{
      t('devices.reload')
    }}</UiButton>
    <p v-if="list && !list.items.length">{{ t('security.emptyRisks') }}</p>
    <ul class="console-object-list">
      <li v-for="item in list?.items" :key="item.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="openRisk(item.id)">
          {{ item.code }} · {{ item.title }}
        </UiButton>
        · {{ t(`security.riskSeverity.${item.severity}`) }} · {{ item.provider }}
      </li>
    </ul>
    <UiButton
      v-if="list?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="listRisks(list.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
    <section v-if="risk" class="console-panel">
      <h2>{{ risk.risk.code }} · {{ risk.risk.title }}</h2>
      <dl>
        <dt>{{ t('security.provider') }}</dt>
        <dd>{{ risk.risk.provider }} / {{ risk.risk.revision }}</dd>
        <dt>{{ t('security.publishedAt') }}</dt>
        <dd>{{ at(risk.risk.publishedAt) }}</dd>
        <dt>{{ t('security.severityLabel') }}</dt>
        <dd>{{ t(`security.riskSeverity.${risk.risk.severity}`) }}</dd>
        <dt>{{ t('security.priority') }}</dt>
        <dd>{{ t(`security.riskPriority.${risk.risk.priority}`) }}</dd>
        <dt>{{ t('security.softwareVersion') }}</dt>
        <dd>
          {{ risk.risk.software.name }} / {{ risk.risk.software.affectedVersion }} →
          {{ risk.risk.software.fixedVersion ?? t('security.state.unknown') }}
        </dd>
      </dl>
      <UiButton :disabled="!!busy" type="submit" @click="loadDevices()">{{
        t('security.affectedDevices')
      }}</UiButton>
      <p v-if="devices">{{ t('security.snapshotAt') }} {{ at(devices.asOf) }}</p>
      <ul>
        <li v-for="item in devices?.items" :key="item.device">
          <UiButton
            :disabled="!!(busy || uncertain)"
            type="submit"
            @click="openDevice(item.device)"
          >
            {{ item.device }}
          </UiButton>
          · {{ t(`security.riskState.${item.state}`) }} ·
          {{ item.software.version ?? t('security.state.unknown') }} · {{ at(item.evaluatedAt) }}
        </li>
      </ul>
      <UiButton
        v-if="devices?.nextCursor"
        :disabled="!!busy"
        type="submit"
        @click="loadDevices(devices.nextCursor)"
      >
        {{ t('devices.next') }}
      </UiButton>
      <section class="console-panel">
        <h2>{{ t('devices.deviceId') }}</h2>
        <form @submit.prevent="openDevice()">
          <label
            >{{ t('policies.device')
            }}<input
              v-model="device"
              class="ui-input"
              :readonly="busy || uncertain"
              required /></label
          ><UiButton :disabled="!!(busy || uncertain)" type="submit">{{
            t('devices.open')
          }}</UiButton>
        </form>
      </section>
    </section>
    <section v-if="current" class="console-panel" data-testid="current-risk">
      <h2>{{ current.assessment.device }}</h2>
      <p>{{ t('security.asOf') }} {{ at(current.asOf) }}</p>
      <RiskAssessmentFacts :assessment="current.assessment" />
      <UiButton
        :disabled="!!busy"
        data-testid="refresh-risk"
        type="submit"
        @click="openDevice(current.assessment.device)"
      >
        {{ t('policies.refresh') }}</UiButton
      ><UiButton
        :disabled="!!(busy || uncertain)"
        data-testid="reassess-risk"
        type="submit"
        @click="reassess"
      >
        {{ t('security.reassess') }}
      </UiButton>
      <UiButton
        v-if="
          current.assessment.state === 'affected' && current.assessment.patch.state === 'available'
        "
        :disabled="!!(busy || uncertain)"
        data-testid="request-remediation"
        type="submit"
        @click="beginRequest"
      >
        {{ t('security.requestRemediation') }}
      </UiButton>
      <nav class="console-inline-actions" :aria-label="t('security.relatedRecords')">
        <RouterLink
          :to="{
            name: 'device-detail',
            params: { tenant: runtime.tenant, device: current.assessment.device },
          }"
          >{{ t('policies.device') }}</RouterLink
        ><RouterLink
          :to="{
            name: 'security-actions',
            params: { tenant: runtime.tenant },
            query: { device: current.assessment.device },
          }"
          >{{ t('security.actions') }}</RouterLink
        ><RouterLink
          :to="{
            name: 'operations-alerts',
            params: { tenant: runtime.tenant },
            query: { device: current.assessment.device },
          }"
          >{{ t('operations.alerts') }}</RouterLink
        >
      </nav>
      <UiButton :disabled="!!busy" type="submit" @click="readHistory()">{{
        t('security.history')
      }}</UiButton>
      <details v-for="item in history?.items" :key="item.id">
        <summary>
          {{ item.id }} · {{ at(item.evaluatedAt) }} · {{ t('security.historical') }}
        </summary>
        <RiskAssessmentFacts :assessment="item" />
      </details>
      <UiButton
        v-if="history?.nextCursor"
        :disabled="!!busy"
        type="submit"
        @click="readHistory(history.nextCursor)"
      >
        {{ t('devices.next') }}
      </UiButton>
    </section>
    <section v-if="requesting" class="console-panel">
      <h2>{{ t('console.review') }}</h2>
      <form data-testid="remediation-form" @submit.prevent="request">
        <fieldset :disabled="busy || uncertain">
          <legend>{{ t('security.requestRemediation') }}</legend>
          <label
            >{{ t('security.justification')
            }}<textarea v-model="reason" class="ui-input" required maxlength="512" /></label
          ><label for="remediation-from">{{ t('security.validFrom') }}</label
          ><UiUtcDateTimeInput
            id="remediation-from"
            required
            :invalid-label="t('policies.invalidDate')"
            :model-value="from"
            :max="until - 1"
            @update:model-value="from = $event ?? Number.NaN"
          /><label for="remediation-until">{{ t('security.validUntil') }}</label
          ><UiUtcDateTimeInput
            id="remediation-until"
            required
            :invalid-label="t('policies.invalidDate')"
            :model-value="until"
            :min="from + 1"
            @update:model-value="until = $event ?? Number.NaN"
          /><UiButton type="submit">
            {{ t('security.submitRequest') }}
          </UiButton>
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
  </PageFrame>
</template>
