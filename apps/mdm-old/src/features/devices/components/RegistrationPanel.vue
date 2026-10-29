<script setup lang="ts">
import DirectoryControls from '../../../ui/DirectoryControls.vue'
import { QueryRows as DirectoryResults } from '@rss/core'
import { useDirectoryQuery } from '../../../services/useDirectoryQuery'

import MdmDisclosure from '../../../ui/MdmDisclosure.vue'
import { VBtn, VDialog, VCard, VCardText, VCardActions, VSpacer } from 'vuetify/components'
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDialogFocus } from '../../../ui/dialog-focus'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { EndpointDetail } from '../clients/endpoint-model'
const props = defineProps<{ endpoint: EndpointDetail }>()

const emit = defineEmits<{ changed: [] }>()

const registrationQuery = useDirectoryQuery(
  [
    'registrationId',
    'source',
    'generation',
    'status',
    'userContextId',
    'enrollmentId',
    'agentGrantId',
  ],
  1000,
)

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
const restoreFocus = useDialogFocus(computed(() => !!target.value))
function dismiss() {
  if (!busy.value && !uncertain.value) target.value = undefined
}
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
    () =>
      registrationQuery.read(next, (query) =>
        runtime.devices.enrollment.registrations(props.endpoint.id, query),
      ),
    (v) => {
      page.value = v
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
registrationQuery.onClear(() => {
  page.value = undefined
})
registrationQuery.bind(() => props.endpoint.id)
async function compareRegistration() {
  const registration = original.value?.registration
  if (!registration) return
  await run(
    () =>
      runtime.devices.enrollment.registrations(props.endpoint.id, {
        filter: `registrationId==${registration}`,
        limit: 1,
      }),
    (page) => {
      compared.value = page.items.some((row) => row.registrationId === registration)
    },
  )
}
</script>
<template>
  <DirectoryControls
    :query="registrationQuery"
    :busy="busy"
    hint="registrationId / source / generation / status"
    @load="load"
  />
  <DirectoryResults
    v-if="!registrationQuery.complete.value"
    :disabled="busy || uncertain"
    :required="['registrationId']"
    :items="page?.items ?? []"
    @open="
      (row) => {
        target = String(row.registrationId)
      }
    "
  />

  <MdmDisclosure class="console-panel">
    <template #title>{{ t('devices.credentials') }}</template>
    <p>{{ t('devices.revokeNote') }}</p>
    <p v-if="failure" role="alert">{{ t('devices.' + failure) }}</p>
    <ul>
      <li v-for="r in registrationQuery.complete.value ? page?.items : []" :key="r.registrationId">
        {{ r.source }} · {{ r.status }} · {{ r.generation
        }}<v-btn
          :disabled="busy || uncertain || r.status !== 'active'"
          @click="target = r.registrationId"
          >{{ t('devices.revoke') }}</v-btn
        >
      </li>
    </ul>
    <v-btn :disabled="busy" @click="load()">{{ t('devices.reload') }}</v-btn>
    <v-dialog
      :model-value="!!target"
      :data-state="target ? 'open' : 'closed'"
      :aria-label="t('devices.revoke')"
      role="alertdialog"
      persistent
      @keydown.esc="dismiss"
      @update:model-value="!$event && dismiss()"
      @after-leave="restoreFocus"
      ><v-card :title="t('devices.revoke')"
        ><v-card-text
          ><p>{{ t('devices.revokeNote') }}</p>
          <code>{{ target }}</code>
          <p v-if="uncertain">{{ t('devices.unknownWrite') }}</p>
          <VBtn v-if="uncertain && original" :disabled="busy" @click="compareRegistration">{{
            t('devices.compare')
          }}</VBtn>
          <v-btn v-if="uncertain && compared" :disabled="busy" @click="revoke(true)">{{
            t('devices.replay')
          }}</v-btn></v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn
            variant="text"
            :aria-label="t('console.cancel')"
            :disabled="busy || uncertain"
            @click="dismiss"
            >{{ t('console.cancel') }}</v-btn
          ><v-btn :disabled="busy || uncertain" variant="flat" color="error" @click="revoke()">{{
            t('devices.confirmAction')
          }}</v-btn></v-card-actions
        ></v-card
      ></v-dialog
    >
  </MdmDisclosure>
</template>
