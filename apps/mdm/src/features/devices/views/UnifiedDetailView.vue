<script setup lang="ts">
import { UiButton, UiTabs, UiBadge } from '@rss/core/components'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../useDeviceBinding'
import type { DeviceView } from '../clients/device-views'
import { objectRef } from '../clients/objects'
import type { EndpointDetail } from '../clients/endpoint-model'
import type { Association } from '../clients/associations'
import PageFrame from '../../../components/PageFrame.vue'
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
const activeTab = ref('inventory')
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
      const value = await runtime.devices.views.detail(objectRef(refValue.value)),
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
function invalidated(reason: 'cursorInvalidated' | 'denied' | 'notFound') {
  clear()
  failure.value = reason
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
  <PageFrame :title="t('devices.unifiedView')" :busy="busy" :failure="failure"
    ><template #actions
      ><UiButton :disabled="busy" @click="load">{{ t('devices.reload') }}</UiButton></template
    ><template v-if="view"
      ><div class="console-object-summary">
        <span class="console-object-mark" aria-hidden="true">◇</span>
        <div>
          <h2>{{ view.reference.id }}</h2>
          <p>{{ t('devices.unifiedView') }}</p>
        </div>
        <UiBadge v-if="view.association">{{
          t(`devices.associationState.${view.association.state}`)
        }}</UiBadge>
      </div>
      <UiTabs
        v-model="activeTab"
        keep-mounted
        :label="t('devices.unifiedView')"
        :items="[
          { value: 'inventory', label: t('devices.inventory') },
          { value: 'association', label: t('devices.associationManagement') },
        ]"
      >
        <template #inventory
          ><ViewFacts :view="view" :endpoints="endpoints" @invalidated="invalidated"
        /></template>
        <template #association
          ><AssociationPanel
            v-if="view.association"
            :association="view.association"
            @changed="changed"
            @denied="denied"
        /></template>
      </UiTabs> </template
  ></PageFrame>
</template>
