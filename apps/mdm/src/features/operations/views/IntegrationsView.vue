<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { utc } from '../presentation'
import { onMounted, ref, toRaw, watch } from 'vue'
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
import PageFrame from '../../../components/PageFrame.vue'
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
  conflict = ref(false),
  missing = ref(false)
let pending: (() => Promise<boolean>) | undefined
async function load(cursor?: string) {
  await run(
    () => client.list(cursor),
    (v) => (page.value = v),
  )
}
async function open(target: string, replace = true) {
  if (uncertain.value && target !== id.value) return
  if (replace && !uncertain.value) {
    selected.value = undefined
    draft.value = fresh()
    id.value = target
    revision.value = 0
    attempts.value = undefined
    test.value = undefined
    pending = undefined
    missing.value = true
    conflict.value = false
  }
  await run(
    () => client.read(target),
    (v) => {
      missing.value = false
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
  missing.value = false
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
  if (busy.value || uncertain.value || conflict.value || missing.value) return
  try {
    const target = id.value,
      body = operation(
        connectorDefinition({
          ...structuredClone(toRaw(draft.value)),
          credentialRef: draft.value.credentialRef === '' ? null : draft.value.credentialRef,
        }),
        revision.value,
      )
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
function routeTarget() {
  create()
  if (typeof route.query['id'] === 'string') void open(route.query['id'])
}
watch(() => route.fullPath, routeTarget, { flush: 'post' })
onMounted(async () => {
  await load()
  routeTarget()
})
</script>
<template>
  <PageFrame :title="t('operations.integrations')" :busy="busy" :failure="failure">
    <p>{{ t('operations.integrationHint') }}</p>
    <UiButton :disabled="!!busy" type="submit" @click="load()">{{ t('devices.reload') }}</UiButton
    ><UiButton :disabled="!!(busy || uncertain)" type="submit" @click="create()">
      {{ t('operations.newConnector') }}
    </UiButton>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        <UiButton :disabled="!!(busy || uncertain)" type="submit" @click="open(item.id)">
          {{ item.definition.name }} · {{ item.definition.kind }} · {{ item.health }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="load(page.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
    <form @submit.prevent="save()">
      <fieldset :disabled="busy || uncertain || missing">
        <legend>{{ id }} / {{ revision }}</legend>
        <label
          >{{ t('operations.name')
          }}<input
            v-model="draft.name"
            class="ui-input"
            data-testid="connector-name"
            required /></label
        ><label
          >{{ t('operations.connectorKind')
          }}<select v-model="draft.kind" class="ui-input">
            <option v-for="kind in connectorKinds" :key="kind">{{ kind }}</option>
          </select></label
        ><label
          >{{ t('operations.endpoint')
          }}<input
            v-model="draft.endpoint"
            class="ui-input"
            data-testid="connector-endpoint"
            type="url"
            required /></label
        ><label
          >{{ t('operations.credentialRef')
          }}<input v-model="draft.credentialRef" class="ui-input" /></label
        ><label
          ><input v-model="draft.enabled" type="checkbox" />{{ t('operations.enabled') }}</label
        ><UiButton data-testid="save-connector" :disabled="!!conflict" type="submit">{{
          t('devices.save')
        }}</UiButton>
      </fieldset>
    </form>
    <section v-if="selected">
      <h2>{{ selected.definition.name }}</h2>
      <p>{{ t('operations.health') }} {{ selected.health }} · {{ selected.operation }}</p>
      <p>{{ selected.definition.credentialRef ?? '—' }}</p>
      <UiButton :disabled="!!busy" type="submit" @click="open(id, false)">{{
        t('operations.compare')
      }}</UiButton>
      <p v-if="selected.revision !== revision">
        {{ t('operations.remote') }} {{ selected.revision
        }}<UiButton :disabled="!!(busy || uncertain)" type="submit" @click="adopt()">
          {{ t('operations.adoptRevision') }}
        </UiButton>
      </p>
      <UiButton
        :disabled="!!(busy || uncertain || conflict || !selected.definition.enabled)"
        type="submit"
        @click="action('test')"
      >
        {{ t('operations.testConnector') }}</UiButton
      ><UiButton
        :disabled="!!(busy || uncertain || conflict || !selected.definition.enabled)"
        type="submit"
        @click="action('deliver')"
      >
        {{ t('operations.deliver') }}</UiButton
      ><UiButton :disabled="!!busy" type="submit" @click="deliveries()">{{
        t('operations.deliveries')
      }}</UiButton>
    </section>
    <UiButton
      v-if="test"
      data-testid="refresh-attempt"
      :disabled="!!busy"
      type="submit"
      @click="refreshAttempt()"
    >
      {{ t('policies.refresh') }}
    </UiButton>
    <p v-if="test">
      {{ t('operations.attempt') }} {{ test.id }} · {{ test.kind }} / {{ test.state }} ·
      {{ test.reason ?? '—' }}
    </p>
    <ul>
      <li v-for="item in attempts?.items" :key="item.id">
        {{ item.id }} · {{ item.state }} / {{ item.attempt }} · {{ utc(item.at) }} ·
        {{ item.reason ?? '—' }} · {{ item.previous ?? '—'
        }}<UiButton
          v-if="item.state === 'failed'"
          :disabled="!!(busy || uncertain)"
          type="submit"
          @click="action('deliver', item)"
        >
          {{ t('operations.retryDelivery') }}
        </UiButton>
      </li>
    </ul>
    <UiButton
      v-if="attempts?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="deliveries(attempts.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
    <UiButton
      v-if="uncertain && pending"
      data-testid="replay-write"
      :disabled="!!busy"
      type="submit"
      @click="pending()"
    >
      {{ t('policies.replay') }}
    </UiButton>
  </PageFrame>
</template>
