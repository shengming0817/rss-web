<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import { reference, type DeviceView } from '../clients/device-views'
import type { EndpointDetail } from '../clients/endpoint-model'
import type { Association } from '../clients/associations'
import DeviceFrame from '../components/DeviceFrame.vue'
import ViewFacts from '../components/ViewFacts.vue'
import AssociationPanel from '../components/AssociationPanel.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  route = useRoute(),
  router = useRouter(),
  refValue = computed(() => ({
    kind: String(route.params['kind']),
    id: String(route.params['view']),
  })),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const view = ref<DeviceView>(),
  endpoints = ref<EndpointDetail[]>([])
function clear() {
  view.value = undefined
  endpoints.value = []
}
async function load() {
  clear()
  await run(
    async () => {
      const value = await runtime.devices.views.detail(reference(refValue.value)),
        details = await Promise.all(
          value.endpoints.map((e) => runtime.devices.directory.detail(e.id)),
        )
      return { value, details }
    },
    (v) => {
      view.value = v.value
      endpoints.value = v.details
    },
  )
}
async function changed(a: Association) {
  clear()
  if (a.state === 'revoked')
    await router.push({ name: 'devices', params: { tenant: runtime.tenant } })
  else await load()
}
function denied() {
  clear()
  failure.value = 'denied'
}
function invalidated() {
  clear()
  failure.value = 'cursorInvalidated'
}
watch(
  () => [...deviceBinding(runtime), refValue.value.kind, refValue.value.id],
  () => {
    void load()
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <DeviceFrame :title="t('devices.unifiedView')" :busy="busy" :failure="failure"
    ><button :disabled="busy" @click="load">{{ t('devices.reload') }}</button
    ><template v-if="view"
      ><p v-if="view.association">
        {{ view.association.id }} / {{ view.association.version }} ·
        {{ t(`devices.associationState.${view.association.state}`) }}
      </p>
      <AssociationPanel
        v-if="view.association"
        :association="view.association"
        @changed="changed"
        @denied="denied" /><ViewFacts
        :view="view"
        :endpoints="endpoints"
        @invalidated="invalidated" /></template
  ></DeviceFrame>
</template>
