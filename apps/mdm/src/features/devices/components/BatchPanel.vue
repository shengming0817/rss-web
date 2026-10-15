<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { lifecycleActions, type Batch, type LifecycleAction } from '../clients/candidate-operations'
import { operation, useOperation } from '../../../services/useOperation'
const props = defineProps<{ devices: string[] }>()
const emit = defineEmits<{ lock: [value: boolean] }>()
const { t } = useI18n(),
  { devices: clients, tenant } = useMdm(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const action = ref<LifecycleAction>('onboard'),
  batch = ref<Batch>(),
  confirmed = ref(false)
watch([busy, uncertain], () => emit('lock', busy.value || uncertain.value), {
  immediate: true,
  flush: 'sync',
})
watch(action, () => {
  if (!busy.value && !uncertain.value) {
    batch.value = undefined
    confirmed.value = false
    pending = undefined
  }
})
let pending: (() => Promise<Batch>) | undefined
function preview() {
  if (busy.value || uncertain.value) return
  confirmed.value = false
  batch.value = undefined
  const body = operation({ action: action.value, devices: [...props.devices] })
  pending = () => clients.candidate.preview(body)
  void runWrite(pending, (v) => {
    batch.value = v
  })
}
function execute() {
  if (busy.value || uncertain.value) return
  if (!batch.value || !confirmed.value) return
  const id = batch.value.id,
    body = operation({ confirmed: true as const }, batch.value.revision)
  pending = () => clients.candidate.execute(id, body)
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
  pending = () => clients.candidate.cancel(id, body)
  void runWrite(pending, (v) => {
    batch.value = v
  })
}
</script>
<template>
  <section :aria-busy="busy" class="console-panel">
    <h2>{{ t('devices.batch') }}</h2>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <label
      >{{ t('devices.actions') }}
      <select v-model="action" class="ui-input" :disabled="busy || uncertain">
        <option v-for="id in lifecycleActions" :key="id" :value="id">
          {{ t(`devices.action.${id}`) }}
        </option>
      </select></label
    >
    <UiButton :disabled="!!(busy || uncertain || !devices.length)" type="submit" @click="preview">
      {{ t('devices.preview') }} ({{ devices.length }})
    </UiButton>
    <template v-if="batch">
      <p>
        {{ t(`devices.action.${batch.action}`) }} · {{ batch.id }} ·
        {{ t(`devices.${batch.phase}`) }}
      </p>
      <div class="ui-table-scroll">
        <table class="ui-table">
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
                {{
                  t(`devices.${target.effect === 'observed' ? 'observedEffect' : target.effect}`)
                }}
              </td>
              <td>{{ t(`devices.${target.compliance}`) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <template v-if="batch.phase === 'preview'"
        ><label><input v-model="confirmed" type="checkbox" />{{ t('devices.confirmAction') }}</label
        ><UiButton :disabled="!!(busy || uncertain || !confirmed)" type="submit" @click="execute">
          {{ t('devices.execute') }}</UiButton
        ><UiButton :disabled="!!(busy || uncertain)" type="submit" @click="cancel">
          {{ t('devices.cancel') }}
        </UiButton></template
      >
      <UiButton
        :disabled="!!busy"
        type="submit"
        @click="
          run(
            () => clients.candidate.batch(batch!.id),
            (v) => (batch = v),
          )
        "
      >
        {{ t('devices.reload') }}
      </UiButton>
      <p v-for="target in batch.targets.filter((v) => v.execution)" :key="target.device">
        <RouterLink
          :to="{ name: 'policy-execution', params: { tenant, execution: target.execution } }"
          >{{ t('devices.execution') }}: {{ target.execution }}</RouterLink
        >
      </p>
    </template>
    <UiButton
      v-if="uncertain && pending"
      :disabled="!!busy"
      type="submit"
      @click="runWrite(pending!, (v) => (batch = v))"
    >
      {{ t('devices.replay') }}
    </UiButton>
  </section>
</template>
