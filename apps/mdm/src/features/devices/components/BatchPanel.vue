<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { lifecycleActions, type Batch, type LifecycleAction } from '../clients/directory'
import { operation, useOperation } from '../../../services/useOperation'
const props = defineProps<{ devices: string[] }>()
const { t } = useI18n(),
  { devices: clients } = useMdm(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const action = ref<LifecycleAction>('onboard'),
  batch = ref<Batch>(),
  confirmed = ref(false)
let pending: (() => Promise<Batch>) | undefined
function preview() {
  if (busy.value || uncertain.value) return
  confirmed.value = false
  batch.value = undefined
  const body = operation({ action: action.value, devices: [...props.devices] })
  pending = () => clients.directory.preview(body)
  void runWrite(pending, (v) => {
    batch.value = v
  })
}
function execute() {
  if (busy.value || uncertain.value) return
  if (!batch.value || !confirmed.value) return
  const id = batch.value.id,
    body = operation({ confirmed: true as const }, batch.value.revision)
  pending = () => clients.directory.execute(id, body)
  void runWrite(pending, (v) => {
    batch.value = v
    confirmed.value = false
  })
}
function cancel() {
  if (busy.value || uncertain.value) return
  if (!batch.value) return
  const id = batch.value.id,
    body = operation({}, batch.value.revision)
  pending = () => clients.directory.cancel(id, body)
  void runWrite(pending, (v) => {
    batch.value = v
  })
}
</script>
<template>
  <section :aria-busy="busy" class="identity-card">
    <h2>{{ t('devices.batch') }}</h2>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <label
      >{{ t('devices.actions') }}
      <select v-model="action" :disabled="busy">
        <option v-for="id in lifecycleActions" :key="id" :value="id">
          {{ t(`devices.action.${id}`) }}
        </option>
      </select></label
    >
    <button :disabled="busy || uncertain || !devices.length" @click="preview">
      {{ t('devices.preview') }} ({{ devices.length }})
    </button>
    <template v-if="batch">
      <p>
        {{ t(`devices.action.${batch.action}`) }} · {{ batch.id }} ·
        {{ t(`devices.${batch.phase}`) }}
      </p>
      <table>
        <thead>
          <tr>
            <th>{{ t('devices.deviceId') }}</th>
            <th>{{ t('devices.registration') }}</th>
            <th>{{ t('devices.blocked') }}</th>
            <th>{{ t('devices.dispatch') }}</th>
            <th>{{ t('devices.receipt') }}</th>
            <th>{{ t('devices.effect') }}</th>
            <th>{{ t('devices.compliance') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="target in batch.targets" :key="target.device">
            <td>{{ target.device }}</td>
            <td>
              {{ target.registration ?? '—' }} / {{ target.generation ?? '—' }} ·
              {{ t('devices.revision') }} {{ target.deviceRevision ?? '—' }}
            </td>
            <td>{{ target.blocked ? t(`devices.${target.blocked}`) : '—' }}</td>
            <td>{{ t(`devices.${target.dispatch}`) }}</td>
            <td>{{ t(`devices.${target.receipt}`) }}</td>
            <td>
              {{ t(`devices.${target.effect === 'observed' ? 'observedEffect' : target.effect}`) }}
            </td>
            <td>{{ t(`devices.${target.compliance}`) }}</td>
          </tr>
        </tbody>
      </table>
      <template v-if="batch.phase === 'preview'"
        ><label><input v-model="confirmed" type="checkbox" />{{ t('devices.confirmAction') }}</label
        ><button :disabled="busy || uncertain || !confirmed" @click="execute">
          {{ t('devices.execute') }}</button
        ><button :disabled="busy || uncertain" @click="cancel">
          {{ t('devices.cancel') }}
        </button></template
      >
      <button
        :disabled="busy"
        @click="
          run(
            () => clients.directory.batch(batch!.id),
            (v) => (batch = v),
          )
        "
      >
        {{ t('devices.reload') }}
      </button>
      <p v-for="target in batch.targets.filter((v) => v.execution)" :key="target.device">
        {{ t('devices.execution') }}: {{ target.execution }} · {{ t('devices.futureExecution') }}
      </p>
    </template>
    <button
      v-if="uncertain && pending"
      :disabled="busy"
      @click="runWrite(pending!, (v) => (batch = v))"
    >
      {{ t('devices.replay') }}
    </button>
  </section>
</template>
