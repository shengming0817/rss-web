<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import PolicyFrame from '../components/PolicyFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const page = ref<Awaited<ReturnType<typeof runtime.policies.catalog.approvals>>>()
type Item = NonNullable<typeof page.value>['items'][number]
let pending: (() => Promise<void>) | undefined
async function load(cursor?: string) {
  await run(
    () => runtime.policies.catalog.approvals(cursor),
    (v) => (page.value = v),
  )
}
function approve(item: Item) {
  if (busy.value || uncertain.value) return
  const id = item.id,
    task = item.run,
    body = operation({}, item.revision)
  pending = async () => {
    const acknowledged = await runWrite(() =>
      runtime.policies.workflows.changeRun(id, task, 'approve', body),
    )
    if (acknowledged) await load()
  }
  void pending()
}
onMounted(() => load())
</script>
<template>
  <PolicyFrame :title="t('policies.approvals')" :busy="busy" :failure="failure"
    ><p>{{ t('policies.independent') }}</p>
    <button :disabled="busy" @click="load()">{{ t('policies.reload') }}</button>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <table v-if="page?.items.length">
      <thead>
        <tr>
          <th>{{ t('policies.name') }}</th>
          <th>{{ t('policies.author') }}</th>
          <th>{{ t('policies.revision') }}</th>
          <th>{{ t('policies.detail') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in page.items" :key="`${item.kind}:${item.id}:${item.run}`">
          <td>{{ item.label }} · {{ item.kind }}</td>
          <td>{{ item.author }}</td>
          <td>{{ item.revision }}</td>
          <td>
            <RouterLink
              :to="{
                name: 'policy-workflows',
                params: { tenant: runtime.tenant },
                query: { id: item.id, run: item.run ?? undefined },
              }"
              >{{ t('policies.detail') }}</RouterLink
            ><button :disabled="busy || uncertain" @click="approve(item)">
              {{ t('policies.approve') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <button v-if="page?.nextCursor" :disabled="busy" @click="load(page.nextCursor)">
      {{ t('policies.next') }}</button
    ><button v-if="uncertain && pending" :disabled="busy" @click="pending()">
      {{ t('policies.replay') }}
    </button></PolicyFrame
  >
</template>
