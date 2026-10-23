<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import { auditTime } from '../../operations/format'
const props = defineProps<{ device: string }>(),
  runtime = useMdm(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), props.device])
const observation = ref<Awaited<ReturnType<typeof runtime.settings.connections.observation>>>()
async function load() {
  observation.value = undefined
  await run(
    () => runtime.settings.connections.observation(props.device),
    (value) => {
      observation.value = value
    },
  )
}
watch(
  () => JSON.stringify([props.device, ...deviceBinding(runtime)]),
  () => {
    void load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <section class="console-panel" :aria-busy="busy">
    <h2>{{ t('settings.connections.title') }}</h2>
    <p>{{ t('settings.connections.factsHint') }}</p>
    <UiButton :disabled="busy" @click="load">{{ t('settings.reload') }}</UiButton>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <dl v-if="observation" class="settings-facts">
      <dt>{{ t('settings.connections.target') }}</dt>
      <dd>{{ observation.targetRevision ?? '—' }}</dd>
      <dt>{{ t('settings.connections.installed') }}</dt>
      <dd>{{ observation.acknowledgement?.revision ?? '—' }}</dd>
      <dt>{{ t('settings.origin') }}</dt>
      <dd>{{ observation.acknowledgement?.origin ?? '—' }}</dd>
      <dt>{{ t('settings.receivedAt') }}</dt>
      <dd>{{ observation.receivedAt === null ? '—' : auditTime(observation.receivedAt) }}</dd>
      <dt>{{ t('settings.connections.registration') }}</dt>
      <dd>{{ observation.registration }} / {{ observation.generation }}</dd>
      <template v-if="observation.failure"
        ><dt>{{ t('settings.connections.failure') }}</dt>
        <dd>
          {{ t('settings.connections.reasons.' + observation.failure.report.reason) }} ·
          {{ t('settings.revision') }} {{ observation.failure.report.revision }} ·
          {{ observation.failure.origin }} · {{ auditTime(observation.failure.receivedAt) }}
        </dd></template
      >
    </dl>
    <p v-else>{{ t('settings.notObserved') }}</p>
  </section>
</template>
