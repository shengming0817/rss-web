<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  { run, busy, failure } = useOperation()
const workflows = ref<Awaited<ReturnType<typeof runtime.policies.catalog.approvals>>>()
async function loadWorkflows(cursor?: string) {
  await run(
    () => runtime.policies.catalog.approvals(cursor),
    (v) => (workflows.value = v),
  )
}
onMounted(() => loadWorkflows())
</script>
<template>
  <PageFrame :title="t('operations.approvals')" :busy="busy" :failure="failure">
    <p>{{ t('operations.approvalHint') }}</p>
    <h2>{{ t('operations.workflowRequests') }}</h2>
    <UiButton :disabled="!!busy" type="submit" @click="loadWorkflows()">{{
      t('devices.reload')
    }}</UiButton>
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
    <UiButton
      v-if="workflows?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="loadWorkflows(workflows.nextCursor)"
    >
      {{ t('devices.next') }}
    </UiButton>
  </PageFrame>
</template>
