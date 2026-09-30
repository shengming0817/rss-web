<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import OperationsFrame from '../components/OperationsFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation()
const software = ref<Awaited<ReturnType<typeof runtime.software.selfService.requests>>>(),
  workflows = ref<Awaited<ReturnType<typeof runtime.policies.catalog.approvals>>>()
async function loadSoftware(cursor?: string) {
  await run(
    () => runtime.software.selfService.requests('pending', cursor),
    (v) => (software.value = v),
  )
}
async function loadWorkflows(cursor?: string) {
  await run(
    () => runtime.policies.catalog.approvals(cursor),
    (v) => (workflows.value = v),
  )
}
onMounted(async () => {
  await loadSoftware()
  await loadWorkflows()
})
</script>
<template>
  <OperationsFrame :title="t('operations.approvals')" :busy="busy" :failure="failure">
    <p>{{ t('operations.approvalHint') }}</p>
    <h2>{{ t('operations.softwareRequests') }}</h2>
    <button :disabled="busy" @click="loadSoftware()">{{ t('devices.reload') }}</button>
    <ul>
      <li v-for="item in software?.items" :key="item.id">
        <RouterLink
          :to="{
            name: 'software-self-service',
            params: { tenant: runtime.tenant },
            query: { request: item.id },
          }"
          >{{ item.item.title }} · {{ item.requester }} · {{ item.device }} /
          {{ item.phase }}</RouterLink
        >
      </li>
    </ul>
    <p v-if="software && !software.items.length">{{ t('operations.empty') }}</p>
    <button v-if="software?.nextCursor" :disabled="busy" @click="loadSoftware(software.nextCursor)">
      {{ t('devices.next') }}
    </button>
    <h2>{{ t('operations.workflowRequests') }}</h2>
    <button :disabled="busy" @click="loadWorkflows()">{{ t('devices.reload') }}</button>
    <ul>
      <li v-for="item in workflows?.items" :key="item.id">
        <RouterLink
          :to="{
            name: 'policy-workflows',
            params: { tenant: runtime.tenant },
            query: { id: item.id, run: item.run ?? undefined },
          }"
          >{{ item.label }} · {{ item.author }} / {{ item.revision }}</RouterLink
        >
      </li>
    </ul>
    <p v-if="workflows && !workflows.items.length">{{ t('operations.empty') }}</p>
    <button
      v-if="workflows?.nextCursor"
      :disabled="busy"
      @click="loadWorkflows(workflows.nextCursor)"
    >
      {{ t('devices.next') }}
    </button>
  </OperationsFrame>
</template>
