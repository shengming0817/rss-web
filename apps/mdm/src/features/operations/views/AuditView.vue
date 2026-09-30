<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { auditActions, type AuditEntry } from '../clients/model'
import type { AuditFilter } from '../clients/audit'
import OperationsFrame from '../components/OperationsFrame.vue'
import OperationsReference from '../components/OperationsReference.vue'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.operations.audit,
  { run, busy, failure } = useOperation()
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  selected = ref<AuditEntry>(),
  actor = ref(''),
  object = ref(''),
  operationId = ref(''),
  outcome = ref<AuditEntry['outcome'] | ''>(''),
  stream = ref<AuditEntry['stream'] | ''>(''),
  device = ref(''),
  action = ref<AuditEntry['action'] | ''>(''),
  bounded = ref(false),
  from = ref(Math.floor(Date.now() / 1000) - 86400),
  until = ref(Math.floor(Date.now() / 1000)),
  applied = ref<AuditFilter>()
const at = (seconds: number) =>
  seconds <= 253402300799 ? new Date(seconds * 1000).toISOString() : String(seconds)
function load(cursor?: string) {
  if (busy.value) return
  const filter =
    cursor && applied.value
      ? { ...applied.value }
      : {
          ...(actor.value ? { actor: actor.value } : {}),
          ...(object.value ? { object: object.value } : {}),
          ...(operationId.value ? { operation: operationId.value } : {}),
          ...(outcome.value ? { outcome: outcome.value } : {}),
          ...(stream.value ? { stream: stream.value } : {}),
          ...(device.value ? { device: device.value } : {}),
          ...(action.value ? { action: action.value } : {}),
          ...(bounded.value ? { from: from.value, until: until.value } : {}),
        }
  selected.value = undefined
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
  if (busy.value) return
  selected.value = undefined
  void run(
    () => client.read(id),
    (v) => (selected.value = v),
  )
}
function routeChanged() {
  page.value = undefined
  selected.value = undefined
  applied.value = undefined
  device.value = typeof route.query['device'] === 'string' ? route.query['device'] : ''
  actor.value = ''
  object.value = ''
  operationId.value = ''
  outcome.value = ''
  stream.value = ''
  action.value = ''
  bounded.value = false
  if (typeof route.query['id'] === 'string') open(route.query['id'])
  else load()
}
watch(() => route.fullPath, routeChanged, { flush: 'sync' })
onMounted(routeChanged)
</script>
<template>
  <OperationsFrame :title="t('operations.audit')" :busy="busy" :failure="failure">
    <p>{{ t('operations.auditHint') }} · {{ t('operations.auditScope') }}</p>
    <form data-testid="audit-filter" @submit.prevent="load()">
      <fieldset :disabled="busy">
        <label>{{ t('operations.actor') }}<input v-model="actor" /></label
        ><label>{{ t('operations.object') }}<input v-model="object" /></label
        ><label>{{ t('operations.operation') }}<input v-model="operationId" /></label
        ><label
          >{{ t('operations.outcome')
          }}<select v-model="outcome">
            <option value="">{{ t('devices.all') }}</option>
            <option
              v-for="value in ['accepted', 'denied', 'failed', 'unknown', 'observed']"
              :key="value"
            >
              {{ value }}
            </option>
          </select></label
        ><label
          >{{ t('operations.stream')
          }}<select v-model="stream">
            <option value="">{{ t('devices.all') }}</option>
            <option>mdm_business</option>
            <option>identity_security</option>
          </select></label
        >
        <label>{{ t('policies.device') }}<input v-model="device" /></label>
        <label
          >{{ t('operations.action')
          }}<select v-model="action">
            <option value="">{{ t('devices.all') }}</option>
            <option v-for="item in auditActions" :key="item" :value="item">
              {{ t(`operations.actionName.${item}`) }}
            </option>
          </select></label
        >
        <label><input v-model="bounded" type="checkbox" />{{ t('security.filterTime') }}</label>
        <template v-if="bounded"
          ><label for="audit-from">{{ t('security.from') }}</label
          ><UtcTimeInput id="audit-from" v-model="from" :max="until" /><label for="audit-until">{{
            t('security.until')
          }}</label
          ><UtcTimeInput id="audit-until" v-model="until" :min="from"
        /></template>
        <button>{{ t('devices.reload') }}</button>
      </fieldset>
    </form>
    <p v-if="applied">
      {{ t('operations.applied') }} · {{ applied.device ?? t('devices.all') }} ·
      {{ applied.action ? t(`operations.actionName.${applied.action}`) : t('devices.all') }} ·
      {{
        applied.from === undefined
          ? t('security.allTime')
          : `${at(applied.from)} — ${at(applied.until!)}`
      }}
    </p>
    <p v-if="page && !page.items.length">{{ t('operations.emptyAudit') }}</p>
    <table v-if="page?.items.length">
      <thead>
        <tr>
          <th>{{ t('operations.at') }}</th>
          <th>{{ t('operations.actor') }}</th>
          <th>{{ t('operations.action') }}</th>
          <th>{{ t('operations.object') }}</th>
          <th>{{ t('operations.outcome') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in page.items" :key="entry.id">
          <td>
            <button :disabled="busy" @click="open(entry.id)">{{ at(entry.at) }}</button>
          </td>
          <td>{{ entry.actor ?? t('operations.system') }}</td>
          <td>{{ t(`operations.actionName.${entry.action}`) }}</td>
          <td>
            <OperationsReference v-if="entry.target" :target="entry.target" /><span v-else>{{
              t('operations.unknownObject')
            }}</span>
          </td>
          <td>{{ t(`operations.outcomes.${entry.outcome}`) }}</td>
        </tr>
      </tbody>
    </table>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <section v-if="selected" data-testid="audit-detail">
      <h2>{{ t('operations.auditDetail') }} · {{ selected.id }}</h2>
      <p>
        {{ selected.stream }} / {{ selected.stage }} / HTTP {{ selected.status ?? '—' }} ·
        {{ t('operations.auditScope') }}
      </p>
      <dl>
        <dt>{{ t('operations.at') }}</dt>
        <dd>{{ at(selected.at) }}</dd>
        <dt>{{ t('operations.actor') }}</dt>
        <dd>{{ selected.actor ?? t('operations.system') }}</dd>
        <dt>{{ t('operations.action') }}</dt>
        <dd>{{ t(`operations.actionName.${selected.action}`) }}</dd>
        <dt>{{ t('operations.object') }}</dt>
        <dd>
          <OperationsReference v-if="selected.target" :target="selected.target" /><span v-else>{{
            t('operations.unknownObject')
          }}</span>
        </dd>
        <dt>{{ t('operations.operation') }}</dt>
        <dd>{{ selected.operation ?? '—' }}</dd>
        <dt>{{ t('operations.outcome') }}</dt>
        <dd>{{ t(`operations.outcomes.${selected.outcome}`) }}</dd>
      </dl>
    </section>
  </OperationsFrame>
</template>
