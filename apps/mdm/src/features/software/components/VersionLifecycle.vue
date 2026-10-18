<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation, type Operation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { VersionChange } from '../clients/lifecycle'
const props = defineProps<{ resource: string; version: string }>(),
  { t } = useI18n(),
  runtime = useMdm(),
  client = runtime.software.lifecycle,
  { run, runWrite, busy, failure, uncertain } = useOperation([], () => [
    ...deviceBinding(runtime),
    props.resource,
    props.version,
  ])
const current = ref<Awaited<ReturnType<typeof client.version>>>()
let pending: Operation<VersionChange> | undefined
function load() {
  void run(
    () => client.version(props.resource, props.version),
    (v) => {
      current.value = v
      if (pending && v.lifecycle?.operation === pending.operationId) {
        uncertain.value = false
        pending = undefined
      }
    },
  )
}
function change(action: VersionChange['action']) {
  if (busy.value || uncertain.value || !current.value) return
  pending = operation({ action }, current.value.lifecycle?.revision ?? 0)
  const p = pending
  void runWrite(
    () => client.changeVersion(props.resource, props.version, p),
    (v) => {
      if (current.value) current.value.lifecycle = v.lifecycle
      pending = undefined
    },
  )
}
watch(
  () => [...deviceBinding(runtime), props.resource, props.version],
  () => {
    current.value = undefined
    pending = undefined
    load()
  },
  { immediate: true },
)
</script>
<template>
  <section :aria-busy="busy">
    <h3>{{ t('software.versionLifecycle') }} · {{ version }}</h3>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <template v-if="current"
      ><p>
        {{
          t(current.lifecycle ? `software.lifecycle_${current.lifecycle.state}` : 'software.draft')
        }}
      </p>
      <p v-if="current.lifecycle">{{ current.lifecycle.operation }}</p>
      <UiButton
        :disabled="busy || uncertain || current.lifecycle?.state === 'enabled'"
        @click="change('enable')"
        >{{ t('software.enable') }}</UiButton
      ><UiButton
        :disabled="busy || uncertain || current.lifecycle?.state !== 'enabled'"
        @click="change('withdraw')"
        >{{ t('software.withdraw') }}</UiButton
      ></template
    ><UiButton :disabled="busy" @click="load">{{ t('software.reconcile') }}</UiButton>
  </section>
</template>
