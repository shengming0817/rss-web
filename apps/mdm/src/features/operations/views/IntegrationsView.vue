<script setup lang="ts">
import { utc } from '../presentation'
import { onMounted, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import {
  connectorDefinition,
  connectorKinds,
  type Connector,
  type Delivery,
} from '../clients/admin-model'
import OperationsFrame from '../components/OperationsFrame.vue'
const { t } = useI18n(),
  client = useMdm().operations.admin.connectors,
  route = useRoute(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const fresh = (): Connector['definition'] => ({
  name: '',
  kind: 'webhook',
  endpoint: '',
  credentialRef: null,
  enabled: true,
})
const page = ref<Awaited<ReturnType<typeof client.list>>>(),
  selected = ref<Connector>(),
  draft = ref(fresh()),
  id = ref<string>(crypto.randomUUID()),
  revision = ref(0),
  attempts = ref<Awaited<ReturnType<typeof client.deliveries>>>(),
  test = ref<Delivery>(),
  conflict = ref(false)
let pending: (() => Promise<boolean>) | undefined
async function load(cursor?: string) {
  await run(
    () => client.list(cursor),
    (v) => (page.value = v),
  )
}
async function open(target: string, replace = true) {
  if (uncertain.value && target !== id.value) return
  await run(
    () => client.read(target),
    (v) => {
      selected.value = v
      if (replace && !uncertain.value) {
        draft.value = structuredClone(v.definition)
        id.value = v.id
        revision.value = v.revision
        conflict.value = false
        attempts.value = undefined
        test.value = undefined
      }
    },
  )
}
function create() {
  if (busy.value || uncertain.value) return
  selected.value = undefined
  draft.value = fresh()
  id.value = crypto.randomUUID()
  revision.value = 0
  conflict.value = false
  attempts.value = undefined
  test.value = undefined
  pending = undefined
}
function save() {
  if (busy.value || uncertain.value || conflict.value) return
  try {
    const target = id.value,
      body = operation(connectorDefinition(structuredClone(toRaw(draft.value))), revision.value)
    pending = async () => {
      const saved = await runWrite(
        () => client.save(target, body),
        (v) => {
          selected.value = v
          id.value = v.id
          revision.value = v.revision
        },
      )
      if (saved) await load()
      else if (failure.value === 'conflict') conflict.value = true
      return saved
    }
    void pending()
  } catch {
    failure.value = 'invalidRequest'
  }
}
function action(kind: 'test' | 'deliver', previous?: Delivery) {
  if (!selected.value || busy.value || uncertain.value || conflict.value) return
  const target = id.value,
    body = operation({}, previous?.revision ?? selected.value.revision)
  pending = async () => {
    const accepted = await runWrite(
      () => (previous ? client.retry(target, previous.id, body) : client[kind](target, body)),
      (v) => {
        test.value = v
        attempts.value = undefined
      },
    )
    if (accepted) await refreshAttempt()
    else if (failure.value === 'conflict') conflict.value = true
    return accepted
  }
  void pending()
}
async function deliveries(cursor?: string) {
  await run(
    () => client.deliveries(id.value, cursor),
    (v) => (attempts.value = v),
  )
}
async function refreshAttempt() {
  if (!test.value) return
  const target = id.value,
    attempt = test.value.id
  await run(
    () => client.attempt(target, attempt),
    (v) => (test.value = v),
  )
}
function adopt() {
  if (!selected.value) return
  revision.value = selected.value.revision
  conflict.value = false
}
onMounted(async () => {
  await load()
  if (typeof route.query['id'] === 'string') await open(route.query['id'])
})
</script>
<template>
  <OperationsFrame :title="t('operations.integrations')" :busy="busy" :failure="failure">
    <p>{{ t('operations.integrationHint') }}</p>
    <button :disabled="busy" @click="load()">{{ t('devices.reload') }}</button
    ><button :disabled="busy || uncertain" @click="create()">
      {{ t('operations.newConnector') }}
    </button>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <button :disabled="busy || uncertain" @click="open(item.id)">
          {{ item.definition.name }} · {{ item.definition.kind }} · {{ item.health }}
        </button>
      </li>
    </ul>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <form @submit.prevent="save()">
      <fieldset :disabled="busy || uncertain">
        <legend>{{ id }} / {{ revision }}</legend>
        <label
          >{{ t('operations.name')
          }}<input v-model="draft.name" data-testid="connector-name" required /></label
        ><label
          >{{ t('operations.connectorKind')
          }}<select v-model="draft.kind">
            <option v-for="kind in connectorKinds" :key="kind">{{ kind }}</option>
          </select></label
        ><label
          >{{ t('operations.endpoint')
          }}<input
            v-model="draft.endpoint"
            data-testid="connector-endpoint"
            type="url"
            required /></label
        ><label>{{ t('operations.credentialRef') }}<input v-model="draft.credentialRef" /></label
        ><label
          ><input v-model="draft.enabled" type="checkbox" />{{ t('operations.enabled') }}</label
        ><button data-testid="save-connector" :disabled="conflict">{{ t('devices.save') }}</button>
      </fieldset>
    </form>
    <section v-if="selected">
      <h2>{{ selected.definition.name }}</h2>
      <p>{{ t('operations.health') }} {{ selected.health }} · {{ selected.operation }}</p>
      <p>{{ selected.definition.credentialRef ?? '—' }}</p>
      <button :disabled="busy" @click="open(id, false)">{{ t('operations.compare') }}</button>
      <p v-if="selected.revision !== revision">
        {{ t('operations.remote') }} {{ selected.revision
        }}<button :disabled="busy || uncertain" @click="adopt()">
          {{ t('operations.adoptRevision') }}
        </button>
      </p>
      <button
        :disabled="busy || uncertain || conflict || !selected.definition.enabled"
        @click="action('test')"
      >
        {{ t('operations.testConnector') }}</button
      ><button
        :disabled="busy || uncertain || conflict || !selected.definition.enabled"
        @click="action('deliver')"
      >
        {{ t('operations.deliver') }}</button
      ><button :disabled="busy" @click="deliveries()">{{ t('operations.deliveries') }}</button>
    </section>
    <button v-if="test" data-testid="refresh-attempt" :disabled="busy" @click="refreshAttempt()">
      {{ t('policies.refresh') }}
    </button>
    <p v-if="test">
      {{ t('operations.attempt') }} {{ test.id }} · {{ test.kind }} / {{ test.state }} ·
      {{ test.reason ?? '—' }}
    </p>
    <ul>
      <li v-for="item in attempts?.items" :key="item.id">
        {{ item.id }} · {{ item.state }} / {{ item.attempt }} · {{ utc(item.at) }} ·
        {{ item.reason ?? '—' }} · {{ item.previous ?? '—'
        }}<button
          v-if="item.state === 'failed'"
          :disabled="busy || uncertain"
          @click="action('deliver', item)"
        >
          {{ t('operations.retryDelivery') }}
        </button>
      </li>
    </ul>
    <button v-if="attempts?.nextCursor" :disabled="busy" @click="deliveries(attempts.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <button
      v-if="uncertain && pending"
      data-testid="replay-write"
      :disabled="busy"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </button>
  </OperationsFrame>
</template>
