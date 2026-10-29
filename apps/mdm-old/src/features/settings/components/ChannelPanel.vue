<script setup lang="ts">
import { VBtn, VCard } from 'vuetify/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import ChannelFacts from './ChannelFacts.vue'
import { auditTime } from '../../operations/format'
const runtime = useMdm(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const snapshot = ref<Awaited<ReturnType<typeof runtime.settings.runtime.read>>>()
const readAt = ref<number>()
function load() {
  if (busy.value) return
  snapshot.value = undefined
  readAt.value = undefined
  void run(
    () => runtime.settings.runtime.read(),
    (value) => {
      snapshot.value = value
      readAt.value = Math.floor(Date.now() / 1000)
    },
  )
}
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    snapshot.value = undefined
    readAt.value = undefined
  },
  { flush: 'sync' },
)
</script>
<template>
  <VCard class="console-panel" tag="section" variant="outlined"
    ><p>{{ t('operations.diagnosticUi.materialHint') }}</p>
    <VBtn :disabled="busy" @click="load">{{ t('operations.diagnosticUi.readChannels') }}</VBtn>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <p v-if="readAt">{{ t('operations.diagnosticUi.readAt') }} {{ auditTime(readAt) }}</p>
    <ChannelFacts v-if="snapshot" :channels="snapshot.channels" />
    <p v-else>{{ t('operations.diagnosticUi.notObserved') }}</p></VCard
  >
</template>
