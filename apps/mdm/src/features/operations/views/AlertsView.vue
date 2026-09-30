<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import { alertStates, type Alert } from '../clients/model'
import type { AlertFilter } from '../clients/alerts'
import OperationsFrame from '../components/OperationsFrame.vue'
import OperationsReference from '../components/OperationsReference.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.operations.alerts,
  { run, runWrite, busy, failure, uncertain } = useOperation()
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  selected = ref<Alert>(),
  device = ref(''),
  state = ref<Alert['state'] | ''>(''),
  applied = ref<AlertFilter>()
const at = (seconds: number) =>
  seconds <= 253402300799 ? new Date(seconds * 1000).toISOString() : String(seconds)
let pending: (() => Promise<boolean>) | undefined
function load(cursor?: string) {
  if (busy.value) return
  const filter =
    cursor && applied.value
      ? { ...applied.value }
      : {
          ...(device.value ? { device: device.value } : {}),
          ...(state.value ? { state: state.value } : {}),
        }
  if (!cursor) {
    page.value = undefined
    applied.value = undefined
  }
  void run(
    () => client.list({ ...filter, ...(cursor ? { cursor } : {}) }),
    (v) => {
      page.value = v
      applied.value = filter
    },
  )
}
function open(id: string) {
  if (busy.value || (uncertain.value && selected.value?.id !== id)) return
  if (!uncertain.value) selected.value = undefined
  void run(
    () => client.read(id),
    (v) => (selected.value = v),
  )
}
function acknowledge() {
  if (!selected.value || busy.value || uncertain.value) return
  const id = selected.value.id,
    body = operation({}, selected.value.revision)
  pending = async () => {
    const acknowledged = await runWrite(
      () => client.acknowledge(id, body),
      (v) => {
        selected.value = v
        page.value = undefined
      },
    )
    if (acknowledged)
      await run(
        () => client.read(id),
        (v) => (selected.value = v),
      )
    return acknowledged
  }
  void pending()
}
function routeChanged() {
  page.value = undefined
  selected.value = undefined
  pending = undefined
  applied.value = undefined
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  state.value = ''
  if (typeof route.query['id'] === 'string') open(route.query['id'])
  else load()
}
watch(() => route.fullPath, routeChanged, { flush: 'sync' })
onMounted(routeChanged)
</script>
<template>
  <OperationsFrame :title="t('operations.alerts')" :busy="busy" :failure="failure">
    <p>{{ t('operations.alertHint') }}</p>
    <form @submit.prevent="load()">
      <fieldset :disabled="busy">
        <label>{{ t('policies.device') }}<input v-model="device" /></label
        ><label
          >{{ t('operations.alertState')
          }}<select v-model="state">
            <option value="">{{ t('devices.all') }}</option>
            <option v-for="value in alertStates" :key="value" :value="value">
              {{ t(`operations.state.${value}`) }}
            </option>
          </select></label
        ><button>{{ t('devices.reload') }}</button>
      </fieldset>
    </form>
    <p v-if="applied">
      {{ t('operations.applied') }} · {{ applied.device ?? t('devices.all') }} ·
      {{ applied.state ? t(`operations.state.${applied.state}`) : t('devices.all') }}
    </p>
    <p v-if="page && !page.items.length">{{ t('operations.emptyAlerts') }}</p>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">
          {{ t(`operations.code.${item.code}`) }} · {{ item.target.device ?? item.target.id }}
        </button>
        · {{ t(`security.severity.${item.severity}`) }} ·
        {{ t(`operations.state.${item.state}`) }} ·
        {{ item.acknowledgment ? t('operations.acknowledged') : t('operations.unacknowledged') }}
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <section v-if="selected" data-testid="alert-detail">
      <h2>{{ t(`operations.code.${selected.code}`) }} · {{ selected.id }}</h2>
      <button :disabled="busy" data-testid="refresh-alert" @click="open(selected.id)">
        {{ t('policies.refresh') }}
      </button>
      <dl>
        <dt>{{ t('operations.alertState') }}</dt>
        <dd data-testid="alert-state">{{ t(`operations.state.${selected.state}`) }}</dd>
        <dt>{{ t('devices.revision') }}</dt>
        <dd>{{ selected.revision }}</dd>
        <dt>{{ t('security.severityLabel') }}</dt>
        <dd>{{ t(`security.severity.${selected.severity}`) }}</dd>
        <dt>{{ t('operations.object') }}</dt>
        <dd><OperationsReference :target="selected.target" /></dd>
        <dt>{{ t('operations.openedAt') }}</dt>
        <dd>{{ at(selected.openedAt) }}</dd>
        <dt>{{ t('operations.updatedAt') }}</dt>
        <dd>{{ at(selected.updatedAt) }}</dd>
        <dt>{{ t('operations.resolvedAt') }}</dt>
        <dd>{{ selected.resolvedAt === null ? '—' : at(selected.resolvedAt) }}</dd>
        <dt>{{ t('operations.evidence') }}</dt>
        <dd>
          {{ selected.evidence.id }} / {{ selected.evidence.version }} ·
          {{ at(selected.evidence.at) }} ·
          {{ t(`operations.evidenceState.${selected.evidence.state}`) }}
        </dd>
        <dt>{{ t('operations.acknowledgment') }}</dt>
        <dd>
          {{
            selected.acknowledgment
              ? `${selected.acknowledgment.actor} · ${at(selected.acknowledgment.at)}`
              : t('operations.unacknowledged')
          }}
        </dd>
      </dl>
      <button
        v-if="selected.state === 'open' && !selected.acknowledgment"
        :disabled="busy || uncertain"
        data-testid="acknowledge-alert"
        @click="acknowledge"
      >
        {{ t('operations.acknowledge') }}
      </button>
      <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
        {{ t('policies.replay') }}
      </button>
    </section>
  </OperationsFrame>
</template>
