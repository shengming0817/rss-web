<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
const props = defineProps<{ device: string }>()
const runtime = useMdm(),
  { t } = useI18n(),
  name = ref<string>(),
  unavailable = ref(false)
const binding = () => [...deviceBinding(runtime), props.device]
const op = useOperation([], binding)
watch(
  () => JSON.stringify(binding()),
  () => {
    name.value = undefined
    unavailable.value = false
    const target = props.device
    void op.run(
      () => runtime.devices.views.detail({ kind: 'endpoint', id: target }),
      (value) => {
        const state =
          value.endpoints.find((e) => e.id === target)?.displayName?.state ??
          value.fields['device.name']?.state
        if (state?.kind === 'known' && state.value.kind === 'string') name.value = state.value.value
        else unavailable.value = true
      },
    )
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <header class="console-panel" data-section="device-context">
    <h2>{{ name ?? device }}</h2>
    <p v-if="name">{{ device }}</p>
    <p v-if="op.busy.value" role="status">{{ t('devices.loading') }}</p>
    <p v-else-if="op.failure.value" role="status">{{ t(`devices.${op.failure.value}`) }}</p>
    <p v-else-if="unavailable" role="status">{{ t('policies.entry.notObserved') }}</p>
  </header>
</template>
