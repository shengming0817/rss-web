<script setup lang="ts">
import { onMounted, ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import type { BaselineDefinition } from '../clients/governance-model'
import type { SecurityRequestTarget } from '../clients/requests-model'
import SecurityFrame from '../components/SecurityFrame.vue'
import UtcTimeInput from '../../policies/components/UtcTimeInput.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  client = runtime.security.governance,
  { run, runWrite, busy, failure, uncertain } = useOperation()
type Read = Awaited<ReturnType<typeof client.read>>
const list = ref<Awaited<ReturnType<typeof client.list>>>(),
  current = ref<Read>(),
  latest = ref<Read>(),
  page = ref<Awaited<ReturnType<typeof client.devices>>>(),
  rules = ref<Awaited<ReturnType<typeof runtime.security.compliance.list>>>(),
  scopes = ref<Awaited<ReturnType<typeof runtime.policies.catalog.list>>>(),
  id = ref(''),
  name = ref(''),
  enabled = ref(true),
  scope = ref(''),
  pins = ref<BaselineDefinition['rules']>([]),
  ruleId = ref(''),
  ruleVersion = ref(1),
  grace = ref(false),
  graceUntil = ref(Math.floor(Date.now() / 1000) + 86400),
  editable = ref(true),
  asOf = ref(Math.floor(Date.now() / 1000)),
  target = ref<Extract<SecurityRequestTarget, { kind: 'compliance_exception' }>>(),
  reason = ref(''),
  validFrom = ref(0),
  validUntil = ref(0),
  requested = ref<string>()
let pending: (() => Promise<void>) | undefined
const at = (seconds: number) =>
  seconds <= 253402300799 ? new Date(seconds * 1000).toISOString() : String(seconds)
function clearRequest() {
  target.value = undefined
  reason.value = ''
  requested.value = undefined
}
function create() {
  if (busy.value || uncertain.value) return
  id.value = crypto.randomUUID()
  current.value = undefined
  latest.value = undefined
  page.value = undefined
  name.value = ''
  enabled.value = true
  scope.value = ''
  pins.value = []
  grace.value = false
  editable.value = true
  graceUntil.value = asOf.value + 86400
  pending = undefined
  clearRequest()
}
function apply(v: Read) {
  current.value = v
  asOf.value = v.asOf
  editable.value = true
  id.value = v.baseline.id
  const d = v.baseline.definition
  name.value = d.name
  enabled.value = d.enabled
  scope.value = d.scope
  pins.value = d.rules.map((pin) => ({ ...pin }))
  grace.value = d.graceUntil !== null
  graceUntil.value = d.graceUntil ?? v.asOf + 86400
  latest.value = undefined
  page.value = undefined
  clearRequest()
}
function open(value = id.value) {
  if (busy.value || uncertain.value) return
  create()
  editable.value = false
  id.value = value
  void run(() => client.read(value), apply)
}
function load(cursor?: string) {
  void run(
    () => client.list(cursor),
    (v) => {
      list.value = v
      asOf.value = v.asOf
    },
  )
}
function save() {
  if (busy.value || uncertain.value || !editable.value || !pins.value.length) return
  const baseline = current.value?.baseline.id ?? id.value,
    body = operation(
      {
        name: name.value,
        enabled: enabled.value,
        scope: scope.value,
        rules: structuredClone(toRaw(pins.value)),
        graceUntil: grace.value ? graceUntil.value : null,
      },
      current.value?.baseline.revision ?? 0,
    )
  pending = async () => {
    if (
      await runWrite(
        () => client.put(baseline, body),
        (v) => {
          apply(v)
          list.value = undefined
        },
      )
    )
      await run(() => client.read(baseline), apply)
  }
  void pending()
}
function compare() {
  if (!current.value || busy.value) return
  const baseline = current.value.baseline.id
  void run(
    () => client.read(baseline),
    (v) => (latest.value = v),
  )
}
function readDevices(cursor?: string) {
  if (!current.value || busy.value) return
  const b = current.value.baseline
  if (!cursor) {
    page.value = undefined
    if (!uncertain.value) clearRequest()
  }
  void run(
    () => client.devices(b.id, b.revision, cursor),
    (v) => {
      page.value = v
      asOf.value = v.asOf
    },
  )
}
function rulePage(after?: string) {
  void run(
    () => runtime.security.compliance.list(after),
    (v) => (rules.value = v),
  )
}
function scopePage(cursor?: string) {
  void run(
    () => runtime.policies.catalog.list('scopes', cursor),
    (v) => (scopes.value = v),
  )
}
function addPin() {
  if (busy.value || uncertain.value || !editable.value) return
  const selected = ruleId.value,
    revision = ruleVersion.value
  void run(
    () => runtime.security.compliance.version(selected, revision),
    (v) =>
      (pins.value = [
        ...pins.value.filter((p) => p.id !== v.id),
        { id: v.id, revision: v.revision },
      ]),
  )
}
function selectRule(id: string, revision: number) {
  ruleId.value = id
  ruleVersion.value = revision
}
function requestException(device: string, rule: string, version: number) {
  if (!current.value || busy.value || uncertain.value) return
  const b = current.value.baseline
  target.value = {
    kind: 'compliance_exception',
    baseline: b.id,
    baselineRevision: b.revision,
    rule,
    ruleVersion: version,
    device,
  }
  reason.value = ''
  requested.value = undefined
  validFrom.value = asOf.value
  validUntil.value = asOf.value + 3600
}
function submitRequest() {
  if (!target.value || busy.value || uncertain.value) return
  const body = operation({
    target: structuredClone(toRaw(target.value)),
    reason: reason.value,
    validFrom: validFrom.value,
    validUntil: validUntil.value,
  })
  requested.value = body.operationId
  pending = async () => {
    const done = await runWrite(
      () => runtime.security.requests.create(body),
      (v) => {
        requested.value = v.request.id
        reason.value = ''
        target.value = undefined
      },
    )
    if (!done && !uncertain.value) requested.value = undefined
  }
  void pending()
}
function routeChanged() {
  create()
  if (typeof route.query['id'] === 'string') open(route.query['id'])
  else load()
}
watch(() => route.fullPath, routeChanged, { flush: 'sync' })
onMounted(routeChanged)
</script>
<template>
  <SecurityFrame :title="t('security.baselines')" :busy="busy" :failure="failure">
    <p>{{ t('security.baselineHint') }}</p>
    <button :disabled="busy || uncertain" data-testid="new-baseline" @click="create">
      {{ t('devices.create') }}</button
    ><button :disabled="busy" @click="load()">{{ t('devices.reload') }}</button>
    <ul>
      <li v-for="item in list?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">
          {{ item.definition.name }}
        </button>
        · {{ item.revision }} ·
        {{ t(item.definition.enabled ? 'security.enabled' : 'security.disabled') }}
      </li>
    </ul>
    <p v-if="list && !list.items.length">{{ t('security.emptyBaselines') }}</p>
    <button v-if="list?.nextCursor" :disabled="busy" @click="load(list.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <form @submit.prevent="open()">
      <label
        >{{ t('security.baselineId')
        }}<input v-model="id" required :readonly="busy || uncertain || !!current" /></label
      ><button :disabled="busy || uncertain">{{ t('devices.open') }}</button>
    </form>
    <p v-if="current">
      {{ t('devices.revision') }} {{ current.baseline.revision }} ·
      {{ t('security.scopeRevision') }} {{ current.baseline.scopeRevision }}
    </p>
    <form data-testid="baseline-form" @submit.prevent="save">
      <fieldset :disabled="busy || uncertain || !editable">
        <label
          >{{ t('devices.name')
          }}<input v-model="name" data-testid="baseline-name" maxlength="128" required /></label
        ><label><input v-model="enabled" type="checkbox" />{{ t('security.enabled') }}</label>
        <label>{{ t('policies.scope') }}<input v-model="scope" required /></label
        ><button type="button" @click="scopePage()">{{ t('security.chooseScope') }}</button>
        <ul>
          <li v-for="item in scopes?.items" :key="item.id">
            <button type="button" @click="scope = item.id">
              {{ item.label }} / {{ item.revision }}
            </button>
          </li>
        </ul>
        <button v-if="scopes?.nextCursor" type="button" @click="scopePage(scopes.nextCursor)">
          {{ t('devices.next') }}
        </button>
        <RouterLink :to="{ name: 'policy-scopes', params: { tenant: runtime.tenant } }">{{
          t('policies.scopes')
        }}</RouterLink>
        <fieldset>
          <legend>{{ t('security.pinnedRules') }}</legend>
          <button type="button" @click="rulePage()">{{ t('security.chooseRule') }}</button>
          <ul>
            <li v-for="item in rules?.items" :key="item.id">
              <button type="button" @click="selectRule(item.id, item.revision)">
                {{ item.definition.name }} / {{ item.revision }}
              </button>
            </li>
          </ul>
          <button v-if="rules?.nextCursor" type="button" @click="rulePage(rules.nextCursor)">
            {{ t('devices.next') }}
          </button>
          <label>{{ t('security.ruleId') }}<input v-model="ruleId" /></label
          ><label
            >{{ t('devices.revision')
            }}<input v-model.number="ruleVersion" type="number" min="1" /></label
          ><button type="button" :disabled="!ruleId" @click="addPin">{{ t('devices.add') }}</button>
          <ul>
            <li v-for="pin in pins" :key="pin.id">
              {{ pin.id }} / {{ pin.revision
              }}<button type="button" @click="pins = pins.filter((p) => p.id !== pin.id)">
                {{ t('devices.remove') }}
              </button>
            </li>
          </ul>
        </fieldset>
        <label><input v-model="grace" type="checkbox" />{{ t('security.grace') }}</label
        ><template v-if="grace"
          ><label for="baseline-grace">{{ t('security.graceUntil') }}</label
          ><UtcTimeInput id="baseline-grace" v-model="graceUntil" :max="asOf + 30 * 86400"
        /></template>
        <button :disabled="!pins.length">{{ t('devices.save') }}</button>
      </fieldset>
    </form>
    <button v-if="current" :disabled="busy" @click="compare">
      {{ t('security.compareLatest') }}
    </button>
    <section v-if="latest" data-testid="baseline-comparison">
      <h2>{{ t('security.serverVersion') }}</h2>
      <p>
        {{ latest.baseline.definition.name }} / {{ latest.baseline.revision }} ·
        {{ latest.baseline.definition.scope }} ·
        {{
          latest.baseline.definition.graceUntil === null
            ? '—'
            : at(latest.baseline.definition.graceUntil)
        }}
      </p>
      <ul>
        <li v-for="pin in latest.baseline.definition.rules" :key="pin.id">
          {{ pin.id }} / {{ pin.revision }}
        </li>
      </ul>
      <button :disabled="busy || uncertain" @click="apply(latest)">
        {{ t('security.adoptLatest') }}
      </button>
    </section>
    <button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button>
    <section v-if="current">
      <h2>{{ t('security.governance') }}</h2>
      <button :disabled="busy" @click="readDevices()">{{ t('security.readDevices') }}</button>
      <p v-if="page">{{ t('security.snapshotAt') }} {{ at(page.asOf) }}</p>
      <p v-if="page && !page.items.length">{{ t('security.emptyTargets') }}</p>
      <article v-for="row in page?.items" :key="row.device" class="identity-card">
        <h3>
          {{ row.device }} · {{ t('security.nativeConclusion') }}
          {{ t(`security.state.${row.native.status}`) }}
        </h3>
        <RouterLink
          :to="{
            name: 'security-compliance',
            params: { tenant: runtime.tenant },
            query: { device: row.device },
          }"
          >{{ t('security.evidence') }}</RouterLink
        >
        <table>
          <thead>
            <tr>
              <th>{{ t('security.ruleRevision') }}</th>
              <th>{{ t('security.nativeConclusion') }}</th>
              <th>{{ t('security.driftLabel') }}</th>
              <th>{{ t('security.governance') }}</th>
              <th>{{ t('security.requests') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rule in row.rules" :key="rule.ruleId">
              <td>{{ rule.ruleId }} / {{ rule.ruleVersion }}</td>
              <td>{{ t(`security.state.${rule.nativeStatus}`) }}</td>
              <td>{{ t(`security.drift.${rule.drift}`) }}</td>
              <td>{{ t(`security.governanceState.${rule.governance}`) }}</td>
              <td>
                <RouterLink
                  v-if="rule.request"
                  :to="{
                    name: 'security-requests',
                    params: { tenant: runtime.tenant },
                    query: { id: rule.request },
                  }"
                  >{{ rule.request }}</RouterLink
                >
                <button
                  v-if="rule.drift === 'none' && rule.nativeStatus === 'non_compliant'"
                  :disabled="busy || uncertain"
                  @click="requestException(row.device, rule.ruleId, rule.ruleVersion)"
                >
                  {{ t('security.requestException') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </article>
      <button v-if="page?.nextCursor" :disabled="busy" @click="readDevices(page.nextCursor)">
        {{ t('devices.next') }}
      </button>
    </section>
    <form v-if="target" data-testid="exception-form" @submit.prevent="submitRequest">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ t('security.requestException') }}</legend>
        <p>{{ target.device }} · {{ target.rule }} / {{ target.ruleVersion }}</p>
        <label
          >{{ t('security.justification') }}<textarea v-model="reason" required maxlength="512" />
        </label>
        <label for="exception-from">{{ t('security.validFrom') }}</label
        ><UtcTimeInput id="exception-from" v-model="validFrom" :max="validUntil - 1" />
        <label for="exception-until">{{ t('security.validUntil') }}</label
        ><UtcTimeInput
          id="exception-until"
          v-model="validUntil"
          :min="validFrom + 1"
          :max="asOf + 30 * 86400"
        />
        <button>{{ t('security.submitRequest') }}</button>
      </fieldset>
    </form>
    <p v-if="requested">
      {{ t('security.requestId') }}
      <RouterLink
        :to="{
          name: 'security-requests',
          params: { tenant: runtime.tenant },
          query: { id: requested },
        }"
        >{{ requested }}</RouterLink
      >
    </p>
  </SecurityFrame>
</template>
