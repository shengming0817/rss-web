<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useSettingsFacts, useSettingsAction } from '../useSettingsAction'
import type { installationObservation } from '../clients/trust'
const props = defineProps<{ kind: 'task' | 'pki' }>()
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useSettingsAction(() => props.kind + '-observation')
const device = ref(''),
  observation = ref<ReturnType<typeof installationObservation>>(),
  read = ref(false)
async function load() {
  observation.value = undefined
  read.value = false
  await run(
    () => runtime.settings[props.kind].observation(device.value),
    (v) => {
      observation.value = v
      read.value = true
    },
  )
}
useSettingsFacts(() => {
  observation.value = undefined
  read.value = false
})
</script>
<template>
  <section class="console-panel">
    <h2>{{ t('settings.deviceEffect') }}</h2>
    <form class="settings-form" @submit.prevent="load">
      <label>{{ t('settings.device') }}<input v-model="device" required maxlength="256" /></label
      ><UiButton type="submit" :disabled="busy">{{ t('settings.readObservation') }}</UiButton>
    </form>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <dl v-if="observation" class="settings-facts">
      <dt>{{ t('settings.state') }}</dt>
      <dd>{{ t('settings.status.' + observation.observation.state) }}</dd>
      <dt>{{ t('settings.operationId') }}</dt>
      <dd>
        <code>{{ observation.observation.operation }}</code>
      </dd>
      <dt>{{ t('settings.requestedVersion') }}</dt>
      <dd>{{ observation.observation.target_revision ?? '—' }}</dd>
      <dt>{{ t('settings.runtimeVersion') }}</dt>
      <dd>{{ observation.observation.actual_revision ?? '—' }}</dd>
      <dt>{{ t('settings.observedAt') }}</dt>
      <dd>{{ new Date(observation.observation.observed_at * 1000).toISOString() }}</dd>
      <dt>{{ t('settings.receivedAt') }}</dt>
      <dd>{{ new Date(observation.received_at * 1000).toISOString() }}</dd>
      <dt>{{ t('settings.blocked') }}</dt>
      <dd>{{ observation.observation.reason ?? '—' }}</dd>
    </dl>
    <p v-else-if="read">{{ t('settings.notObserved') }}</p>
  </section>
</template>
