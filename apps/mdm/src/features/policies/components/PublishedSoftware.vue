<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  VBtn,
  VDataTable,
  VExpansionPanel,
  VExpansionPanels,
  VExpansionPanelText,
  VAlert,
} from 'vuetify/components'
import { useMdm } from '../../../context'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { useOperation } from '../../../services/useOperation'
import { allOf, comparison } from '../../../services/directory-query'
const runtime = useMdm(),
  { t } = useI18n()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const page = ref<Awaited<ReturnType<typeof runtime.software.publication.list>>>()
function load(cursor?: string) {
  page.value = undefined
  void run(
    () =>
      runtime.software.publication.list({
        cursor,
        filter: allOf(
          comparison('outcome', '==', 'published'),
          comparison('withdrawn', '==', false),
        ),
      }),
    (result) => {
      page.value = result
    },
  )
}
watch(
  () => JSON.stringify(deviceBinding(runtime)),
  () => {
    page.value = undefined
  },
  { flush: 'sync' },
)
</script>
<template>
  <VExpansionPanels class="mb-4"
    ><VExpansionPanel :title="t('policies.publishedSoftware')"
      ><VExpansionPanelText>
        <p>{{ t('policies.publicationHint') }}</p>
        <VBtn :disabled="busy" @click="load()">{{ t('policies.reload') }}</VBtn>
        <VAlert v-if="failure" type="error" variant="tonal">{{ t(`devices.${failure}`) }}</VAlert>
        <VDataTable
          v-if="page"
          :items="page.items"
          :headers="[
            { key: 'resource', title: t('policies.resources') },
            { key: 'version', title: t('policies.version') },
            { key: 'target', title: t('policies.targets') },
            { key: 'outcome', title: t('policies.status') },
          ]"
          :items-per-page="-1"
          hide-default-footer
          :no-data-text="t('policies.empty')"
        >
          <template #[`item.resource`]="{ item }"
            ><VBtn
              variant="text"
              :to="{
                name: 'policy-resources',
                params: { tenant: runtime.tenant },
                query: { resource: item.resource },
              }"
              >{{ item.resource }}</VBtn
            ></template
          >
          <template #[`item.outcome`]> {{ t('policies.softwarePublished') }} </template>
        </VDataTable>
        <VBtn v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">{{
          t('policies.next')
        }}</VBtn>
      </VExpansionPanelText></VExpansionPanel
    ></VExpansionPanels
  >
</template>
