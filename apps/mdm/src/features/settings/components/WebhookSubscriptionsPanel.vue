<script setup lang="ts">
import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import { VBtn, VCard, VCheckbox, VForm, VSelect, VTextField, VTextarea } from 'vuetify/components'
import { ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
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
  nextCursor = ref<string | null>(null),
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
  nextCursor.value = null
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
    async () => ({ rows: await client.list({ cursor: after }), types: await client.types() }),
    (v) => {
      rows.value = v.rows.items
      nextCursor.value = v.rows.nextCursor
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
    () => client.deliveries({ cursor: after }),
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
  <VCard
    class="console-panel"
    data-panel="webhooks"
    :aria-busy="busy"
    tag="section"
    variant="outlined"
    ><h2>{{ t('gap.webhooks') }}</h2>
    <p>{{ t('gap.webhookHint') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <VBtn :disabled="busy || !canRead" @click="load()">{{ t('gap.load') }}</VBtn
    ><VBtn :disabled="locked || !canWrite" @click="fresh">{{ t('gap.create') }}</VBtn>
    <ul>
      <li v-for="s in rows" :key="s.id">
        <VBtn
          :disabled="locked"
          @click="
            () => {
              id = s.id
              read()
            }
          "
          >{{ s.settings.presentation.name }} · {{ s.revision }} · {{ s.enabled }}</VBtn
        >
      </li>
    </ul>
    <VBtn v-if="nextCursor" :disabled="busy" @click="load(nextCursor!)">{{ t('gap.next') }}</VBtn
    ><VForm :novalidate="false" @submit.prevent="save"
      ><fieldset :disabled="locked || !canWrite || !!selected?.deleted">
        <VTextField
          v-model="id"
          :readonly="!!selected"
          required
          :label="t('gap.subscriptions')"
          :disabled="locked || !canWrite || !!selected?.deleted"
        /><VBtn
          type="button"
          :disabled="locked || !canWrite || !!selected?.deleted"
          @click="read"
          >{{ t('gap.load') }}</VBtn
        ><VTextField
          v-model="name"
          maxlength="128"
          required
          :label="t('gap.name')"
          :disabled="locked || !canWrite || !!selected?.deleted"
        /><VTextField
          v-model="endpoint"
          type="url"
          required
          :label="t('gap.endpoint')"
          :disabled="locked || !canWrite || !!selected?.deleted"
        />
        <fieldset>
          <legend>{{ t('gap.events') }}</legend>
          <VCheckbox
            v-for="event in availableEvents"
            :key="event"
            v-model="events"
            :value="event"
            :label="event"
            :disabled="locked || !canWrite || !!selected?.deleted"
          />
        </fieldset>
        <VSelect
          v-model="selection"
          :label="t('gap.selection')"
          :disabled="locked || !canWrite || !!selected?.deleted"
          :items="[
            { title: t('gap.allDevices'), value: 'allDevices', props: { disabled: false } },
            { title: t('gap.devices'), value: 'devices', props: { disabled: false } },
            { title: t('gap.groups'), value: 'groups', props: { disabled: false } },
          ]"
        /><VTextarea
          v-if="selection !== 'allDevices'"
          v-model="ids"
          required
          :label="t('gap.ids')"
          :disabled="locked || !canWrite || !!selected?.deleted"
        /><VTextField
          v-model="keyReference"
          required
          :label="t('gap.keyReference')"
          :disabled="locked || !canWrite || !!selected?.deleted"
        /><VTextField
          v-model="networkReference"
          required
          :label="t('gap.networkReference')"
          :disabled="locked || !canWrite || !!selected?.deleted"
        /><VCheckbox
          v-model="confirmation"
          :label="t('gap.confirmation')"
          :disabled="locked || !canWrite || !!selected?.deleted"
        /><VBtn
          type="submit"
          :disabled="locked || !canWrite || !!selected?.deleted || !confirmation"
          >{{ t('gap.save') }}</VBtn
        ><template v-if="selected"
          ><VBtn
            type="button"
            :disabled="locked || !canWrite || !!selected?.deleted || !confirmation"
            @click="transition('enabled')"
            >{{ t(selected.enabled ? 'gap.disable' : 'gap.enabled') }}</VBtn
          ><VBtn
            type="button"
            :disabled="locked || !canWrite || !!selected?.deleted || !confirmation"
            @click="transition('delete')"
            >{{ t('gap.deleted') }}</VBtn
          ><VTextField
            v-model="device"
            :label="t('policies.device')"
            :disabled="locked || !canWrite || !!selected?.deleted"
          /><VBtn
            type="button"
            :disabled="
              locked ||
              !canWrite ||
              !!selected?.deleted ||
              !confirmation ||
              !device ||
              !selected.enabled
            "
            @click="execute({ kind: 'test', id: selected.id, deviceId: device })"
            >{{ t('gap.test') }}</VBtn
          ></template
        >
      </fieldset></VForm
    >
    <h3>{{ t('gap.deliveries') }}</h3>
    <VBtn :disabled="busy || !canRead" @click="loadDeliveries()">{{ t('gap.load') }}</VBtn>
    <ul>
      <li v-for="d in deliveries?.items" :key="d.id">
        <VBtn :disabled="busy" @click="readDelivery(d.id)"
          >{{ d.id }} · {{ d.status }} · {{ d.transportObservation ?? '—' }}</VBtn
        >
      </li>
    </ul>
    <VBtn
      v-if="deliveries?.nextCursor"
      :disabled="busy"
      @click="loadDeliveries(deliveries.nextCursor)"
      >{{ t('gap.next') }}</VBtn
    >
    <article v-if="currentDelivery">
      <h4>{{ currentDelivery.id }} · {{ currentDelivery.status }}</h4>
      <p>
        {{ currentDelivery.eventId }} · {{ currentDelivery.subscriptionId }} /
        {{ currentDelivery.targetVersion }} · {{ currentDelivery.attempts }} ·
        {{ currentDelivery.failureStage }} / {{ currentDelivery.failureReason }}
      </p>
      <VCheckbox v-model="confirmation" :label="t('gap.confirmation')" /><VBtn
        :disabled="
          locked ||
          !confirmation ||
          !replayPermission.canWrite.value ||
          currentDelivery.status !== 'dead_letter'
        "
        @click="recover('replay')"
        >{{ t('gap.replay') }}</VBtn
      ><VBtn
        :disabled="
          locked ||
          !confirmation ||
          !replayPermission.canWrite.value ||
          currentDelivery.status !== 'dead_letter' ||
          !currentDelivery.redriveWindowOpen
        "
        @click="recover('redrive')"
        >{{ t('gap.redrive') }}</VBtn
      >
    </article>
    <template v-if="pending"
      ><p role="alert">
        {{ t(pending.state === 'conflict' ? 'gap.compare' : 'gap.unknown') }} {{ pending.id }}
      </p>
      <VCheckbox v-model="confirmation" :label="t('gap.confirmation')" /><VBtn
        v-if="pending.state === 'unknown'"
        :disabled="busy || !confirmation"
        @click="restore"
        >{{ t('gap.replayOriginal') }}</VBtn
      ><VBtn v-if="pending.state === 'conflict'" :disabled="busy" @click="compare">{{
        t('gap.compare')
      }}</VBtn></template
    >
    <MdmDisclosure v-if="receipt">
      <template #title>{{ t('gap.result') }}</template>
      <pre>{{ JSON.stringify(receipt, null, 2) }}</pre>
    </MdmDisclosure></VCard
  >
</template>
