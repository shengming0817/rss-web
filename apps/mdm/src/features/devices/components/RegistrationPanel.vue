<script setup lang="ts">
import { VBtn } from 'vuetify/components'
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiDialog } from '@rss/core/components'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { EndpointDetail } from '../clients/endpoint-model'
const props = defineProps<{ endpoint: EndpointDetail }>()
const emit = defineEmits<{ changed: [] }>()
const runtime = useMdm(),
  { t } = useI18n(),
  { run, runWrite, busy, uncertain, failure } = useOperation(
    [],
    () => deviceBinding(runtime),
    () => props.endpoint.id,
  )
const page = ref<Awaited<ReturnType<typeof runtime.devices.enrollment.registrations>>>(),
  target = ref<string>(),
  original = ref<{ id: string; registration: string }>(),
  compared = ref(false)
watch(
  () => JSON.stringify([...deviceBinding(runtime), props.endpoint.id]),
  () => {
    target.value = undefined
    original.value = undefined
    compared.value = false
    page.value = undefined
  },
  { flush: 'sync' },
)
async function load(next?: string) {
  page.value = undefined
  await run(
    () => runtime.devices.enrollment.registrations(props.endpoint.id, { cursor: next }),
    (v) => {
      page.value = v
      if (original.value) compared.value = true
    },
  )
}
async function revoke(replay = false) {
  if (!target.value || busy.value || (uncertain.value && (!replay || !compared.value))) return
  const id = target.value,
    operation = replay ? original.value!.id : crypto.randomUUID()
  original.value = { id: operation, registration: id }
  compared.value = false
  if (await runWrite(() => runtime.devices.enrollment.revoke(props.endpoint.id, id, operation))) {
    target.value = undefined
    original.value = undefined
    emit('changed')
  }
}
onMounted(() => void load())
</script>
<template>
  <details class="console-panel">
    <summary>{{ t('devices.credentials') }}</summary>
    <p>{{ t('devices.revokeNote') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <ul>
      <li v-for="r in page?.items" :key="r.registrationId">
        {{ r.source }} · {{ r.status }} · {{ r.generation
        }}<v-btn
          :disabled="busy || uncertain || r.status !== 'active'"
          @click="target = r.registrationId"
          >{{ t('devices.revoke') }}</v-btn
        >
      </li>
    </ul>
    <v-btn :disabled="busy" @click="load()">{{ t('devices.reload') }}</v-btn
    ><v-btn v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">{{
      t('devices.next')
    }}</v-btn>
    <UiDialog
      :open="!!target"
      :title="t('devices.revoke')"
      :close-label="t('console.cancel')"
      :dismissible="!busy && !uncertain"
      kind="alertdialog"
      @update:open="!$event && (target = undefined)"
      ><p>{{ t('devices.revokeNote') }}</p>
      <code>{{ target }}</code>
      <p v-if="uncertain">{{ t('devices.unknownWrite') }}</p>
      <v-btn v-if="uncertain" :disabled="busy" @click="load()">{{ t('devices.compare') }}</v-btn
      ><v-btn v-if="uncertain && compared" :disabled="busy" @click="revoke(true)">{{
        t('devices.replay')
      }}</v-btn
      ><template #footer
        ><v-btn :disabled="busy || uncertain" variant="flat" color="error" @click="revoke()">{{
          t('devices.confirmAction')
        }}</v-btn></template
      ></UiDialog
    >
  </details>
</template>
