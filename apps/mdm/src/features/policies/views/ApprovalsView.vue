<script setup lang="ts">
import { UiButton, UiDialog } from '@rss/core/components'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { operation, useOperation } from '../../../services/useOperation'
import PageFrame from '../../../components/PageFrame.vue'
const { t } = useI18n(),
  runtime = useMdm(),
  { run, runWrite, busy, failure, uncertain } = useOperation()
const page = ref<Awaited<ReturnType<typeof runtime.policies.catalog.approvals>>>()
type Item = NonNullable<typeof page.value>['items'][number]
const confirming = ref<Item>()
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
    if (acknowledged) {
      confirming.value = undefined
      await load()
    }
  }
  void pending()
}
onMounted(() => load())
</script>
<template>
  <PageFrame :title="t('policies.approvals')" :busy="busy" :failure="failure"
    ><p>{{ t('policies.independent') }}</p>
    <UiButton :disabled="!!busy" type="submit" @click="load()">{{ t('policies.reload') }}</UiButton>
    <p v-if="page && !page.items.length">{{ t('policies.empty') }}</p>
    <div v-if="page?.items.length" class="ui-table-scroll">
      <table class="ui-table">
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
              ><UiButton :disabled="!!(busy || uncertain)" type="submit" @click="confirming = item">
                {{ t('policies.approve') }}
              </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <UiDialog
      :open="!!confirming"
      :title="t('policies.approve')"
      :description="t('policies.independent')"
      :close-label="t('console.close')"
      :dismissible="!busy && !uncertain"
      @update:open="!$event && (confirming = undefined)"
    >
      <template v-if="confirming"
        ><h3>{{ confirming.label }}</h3>
        <p>{{ t('policies.author') }}: {{ confirming.author }}</p>
        <p>
          {{ confirming.id }} / {{ confirming.run }} · {{ t('policies.revision') }}
          {{ confirming.revision }}
        </p></template
      >
      <p v-if="failure" role="alert">{{ t(`policies.${failure}`) }}</p>
      <template #footer
        ><UiButton
          :disabled="busy || uncertain || !confirming"
          @click="confirming && approve(confirming)"
          >{{ t('policies.approve') }}</UiButton
        ><UiButton v-if="uncertain && pending" :disabled="busy" @click="pending()">{{
          t('policies.replay')
        }}</UiButton></template
      >
    </UiDialog>
    <UiButton
      v-if="page?.nextCursor"
      :disabled="!!busy"
      type="submit"
      @click="load(page.nextCursor)"
    >
      {{ t('policies.next') }}</UiButton
    ><UiButton v-if="uncertain && pending" :disabled="!!busy" type="submit" @click="pending()">
      {{ t('policies.replay') }}
    </UiButton></PageFrame
  >
</template>
