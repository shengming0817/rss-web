<script setup lang="ts">
import { ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOriginalOperation } from '../../../services/useOriginalOperation'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsFacts } from '../useSettingsAction'
import {
  subscription,
  webhookSettings,
  eventTypes,
  type WebhookIntent,
  type Subscription,
  type Delivery,
} from '../clients/webhookSubscriptions'
const runtime = useMdm(),
  client = runtime.settings.subscriptions,
  { t } = useI18n()
const { canRead, canWrite } = usePermission('webhook_read', 'webhook_write'),
  replayPermission = usePermission('webhook_read', 'webhook_replay')
const { run, submit, pending, locked, busy, failure, resolvedConflict } = useOriginalOperation(
  () => 'webhooks',
)
const rows = ref<Subscription[]>([]),
  more = ref(false),
  selected = ref<Subscription>(),
  id = ref(crypto.randomUUID() as string),
  name = ref(''),
  endpoint = ref(''),
  events = ref<string[]>([]),
  selection = ref<'allDevices' | 'devices' | 'groups'>('devices'),
  ids = ref(''),
  keyReference = ref(''),
  networkReference = ref(''),
  device = ref(''),
  confirmation = ref(false),
  deliveries = ref<Awaited<ReturnType<typeof client.deliveries>>>(),
  currentDelivery = ref<Delivery>(),
  receipt = ref<unknown>(),
  availableEvents = ref<readonly string[]>(eventTypes)
function clear() {
  rows.value = []
  selected.value = undefined
  deliveries.value = undefined
  currentDelivery.value = undefined
  receipt.value = undefined
  more.value = false
}
useSettingsFacts(clear)
function apply(s: Subscription) {
  selected.value = s
  id.value = s.id
  name.value = String(s.settings.presentation['name'])
  endpoint.value = s.settings.endpoint
  events.value = [...s.settings.eventTypes]
  selection.value = s.settings.selection.kind
  ids.value = s.settings.selection.ids?.join('\n') ?? ''
  keyReference.value = s.settings.keyReference
  networkReference.value = s.settings.networkReference
}
async function load(after?: string) {
  await run(
    async () => ({ rows: await client.list(after), types: await client.types() }),
    (v) => {
      rows.value = v.rows
      more.value = v.rows.length === 32
      availableEvents.value = v.types
    },
  )
  if (failure.value) clear()
}
async function read() {
  selected.value = undefined
  await run(() => client.read(id.value), apply)
  if (failure.value) clear()
}
function fresh() {
  if (locked.value) return
  selected.value = undefined
  id.value = crypto.randomUUID()
  name.value = ''
  endpoint.value = ''
  events.value = []
  ids.value = ''
  selection.value = 'devices'
  keyReference.value = ''
  networkReference.value = ''
  receipt.value = undefined
}
async function execute(input: WebhookIntent, replay = false) {
  if (!confirmation.value) return
  confirmation.value = false
  await submit(
    input,
    (operationId, original) => client.write(operationId, original),
    (v) => {
      receipt.value = v
      if (input.kind === 'subscription') apply(subscription(v))
    },
    replay,
  )
}
function save() {
  try {
    const settings = webhookSettings({
      presentation: { ...toRaw(selected.value?.settings.presentation ?? {}), name: name.value },
      endpoint: endpoint.value,
      eventTypes: [...events.value],
      selection:
        selection.value === 'allDevices'
          ? { kind: selection.value }
          : {
              kind: selection.value,
              ids: ids.value
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean),
            },
      keyReference: keyReference.value,
      networkReference: networkReference.value,
    })
    void execute({
      kind: 'subscription',
      id: id.value,
      revision: selected.value?.revision ?? 0,
      change: { kind: 'put', value: settings },
    })
  } catch {
    failure.value = 'invalidRequest'
  }
}
function transition(kind: 'enabled' | 'delete') {
  if (selected.value)
    void execute({
      kind: 'subscription',
      id: selected.value.id,
      revision: selected.value.revision,
      change: kind === 'delete' ? { kind } : { kind, value: !selected.value.enabled },
    })
}
async function loadDeliveries(after?: string) {
  deliveries.value = undefined
  await run(
    () => client.deliveries(after),
    (v) => {
      deliveries.value = v
    },
  )
  if (failure.value) clear()
}
async function readDelivery(id: string) {
  currentDelivery.value = undefined
  const ok = await run(
    () => client.delivery(id),
    (v) => {
      currentDelivery.value = v
    },
  )
  if (failure.value) clear()
  return ok
}
function recover(kind: 'replay' | 'redrive') {
  const d = currentDelivery.value
  if (d) void execute({ kind, id: d.id, expectedVersion: d.recoveryVersion })
}
async function compare() {
  const original = pending.value?.input as WebhookIntent | undefined
  if (!original || pending.value?.state !== 'conflict') return
  let ok
  if (original.kind === 'subscription' || original.kind === 'test') {
    if (original.kind === 'test') device.value = original.deviceId
    selected.value = undefined
    ok = await run(() => client.read(original.id), apply)
  } else ok = await readDelivery(original.id)
  if (ok) resolvedConflict()
}
function restore() {
  if (pending.value?.state === 'unknown') void execute(pending.value.input as WebhookIntent, true)
}
</script>
<template>
  <section class="console-panel" data-panel="webhooks" :aria-busy="busy">
    <h2>{{ t('gap.webhooks') }}</h2>
    <p>{{ t('gap.webhookHint') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <UiButton :disabled="busy || !canRead" @click="load()">{{ t('gap.load') }}</UiButton
    ><UiButton :disabled="locked || !canWrite" @click="fresh">{{ t('gap.create') }}</UiButton>
    <ul>
      <li v-for="s in rows" :key="s.id">
        <UiButton
          :disabled="locked"
          @click="
            () => {
              id = s.id
              read()
            }
          "
          >{{ s.settings.presentation.name }} · {{ s.revision }} · {{ s.enabled }}</UiButton
        >
      </li>
    </ul>
    <UiButton v-if="more" :disabled="busy" @click="load(rows.at(-1)?.id)">{{
      t('gap.next')
    }}</UiButton>
    <form @submit.prevent="save">
      <fieldset :disabled="locked || !canWrite || selected?.deleted">
        <label
          >{{ t('gap.subscriptions') }}<input v-model="id" :readonly="!!selected" required /></label
        ><UiButton type="button" @click="read">{{ t('gap.load') }}</UiButton>
        <label>{{ t('gap.name') }}<input v-model="name" maxlength="128" required /></label
        ><label>{{ t('gap.endpoint') }}<input v-model="endpoint" type="url" required /></label>
        <fieldset>
          <legend>{{ t('gap.events') }}</legend>
          <label v-for="event in availableEvents" :key="event"
            ><input v-model="events" :value="event" type="checkbox" />{{ event }}</label
          >
        </fieldset>
        <label
          >{{ t('gap.selection')
          }}<select v-model="selection">
            <option value="allDevices">{{ t('gap.allDevices') }}</option>
            <option value="devices">{{ t('gap.devices') }}</option>
            <option value="groups">{{ t('gap.groups') }}</option>
          </select></label
        >
        <label v-if="selection !== 'allDevices'"
          >{{ t('gap.ids') }}<textarea v-model="ids" required />
        </label>
        <label>{{ t('gap.keyReference') }}<input v-model="keyReference" required /></label
        ><label>{{ t('gap.networkReference') }}<input v-model="networkReference" required /></label>
        <label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label
        ><UiButton type="submit" :disabled="!confirmation">{{ t('gap.save') }}</UiButton>
        <template v-if="selected"
          ><UiButton type="button" :disabled="!confirmation" @click="transition('enabled')">{{
            t(selected.enabled ? 'gap.disable' : 'gap.enabled')
          }}</UiButton
          ><UiButton type="button" :disabled="!confirmation" @click="transition('delete')">{{
            t('gap.deleted')
          }}</UiButton>
          <label>{{ t('policies.device') }}<input v-model="device" /></label
          ><UiButton
            type="button"
            :disabled="!confirmation || !device || !selected.enabled"
            @click="execute({ kind: 'test', id: selected.id, deviceId: device })"
            >{{ t('gap.test') }}</UiButton
          ></template
        >
      </fieldset>
    </form>
    <h3>{{ t('gap.deliveries') }}</h3>
    <UiButton :disabled="busy || !canRead" @click="loadDeliveries()">{{ t('gap.load') }}</UiButton>
    <ul>
      <li v-for="d in deliveries?.items" :key="d.id">
        <UiButton :disabled="busy" @click="readDelivery(d.id)"
          >{{ d.id }} · {{ d.status }} · {{ d.transportObservation ?? '—' }}</UiButton
        >
      </li>
    </ul>
    <UiButton
      v-if="deliveries?.nextCursor"
      :disabled="busy"
      @click="loadDeliveries(deliveries.nextCursor)"
      >{{ t('gap.next') }}</UiButton
    >
    <article v-if="currentDelivery">
      <h4>{{ currentDelivery.id }} · {{ currentDelivery.status }}</h4>
      <p>
        {{ currentDelivery.eventId }} · {{ currentDelivery.subscriptionId }} /
        {{ currentDelivery.targetVersion }} · {{ currentDelivery.attempts }} ·
        {{ currentDelivery.failureStage }} / {{ currentDelivery.failureReason }}
      </p>
      <label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label
      ><UiButton
        :disabled="
          locked ||
          !confirmation ||
          !replayPermission.canWrite.value ||
          currentDelivery.status !== 'dead_letter'
        "
        @click="recover('replay')"
        >{{ t('gap.replay') }}</UiButton
      ><UiButton
        :disabled="
          locked ||
          !confirmation ||
          !replayPermission.canWrite.value ||
          currentDelivery.status !== 'dead_letter' ||
          !currentDelivery.redriveWindowOpen
        "
        @click="recover('redrive')"
        >{{ t('gap.redrive') }}</UiButton
      >
    </article>
    <template v-if="pending"
      ><p role="alert">
        {{ t(pending.state === 'conflict' ? 'gap.compare' : 'gap.unknown') }} {{ pending.id }}
      </p>
      <label><input v-model="confirmation" type="checkbox" />{{ t('gap.confirmation') }}</label
      ><UiButton
        v-if="pending.state === 'unknown'"
        :disabled="busy || !confirmation"
        @click="restore"
        >{{ t('gap.replayOriginal') }}</UiButton
      ><UiButton v-if="pending.state === 'conflict'" :disabled="busy" @click="compare">{{
        t('gap.compare')
      }}</UiButton></template
    >
    <details v-if="receipt">
      <summary>{{ t('gap.result') }}</summary>
      <pre>{{ JSON.stringify(receipt, null, 2) }}</pre>
    </details>
  </section>
</template>
