<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { UiButton } from '@rss/core/components'
import PageFrame from '../../../../src/components/PageFrame.vue'
import { useOperation } from '../../../../src/services/useOperation'
import { useDemo } from '../../../context'
const { t } = useI18n(),
  route = useRoute(),
  runtime = useDemo()
const { run, busy, failure } = useOperation()
const page = ref<Awaited<ReturnType<typeof runtime.operations.admin.delegations>>>()
function load(cursor?: string) {
  return run(
    () => runtime.operations.admin.delegations(cursor),
    (value) => {
      page.value = value
    },
  )
}
watch(
  () => route.fullPath,
  () => {
    void load()
  },
  { immediate: true },
)
</script>
<template>
  <PageFrame :title="t('operations.delegations')" :busy="busy" :failure="failure">
    <p>{{ t('operations.delegationHint') }}</p>
    <UiButton :disabled="busy" @click="load()">{{ t('devices.reload') }}</UiButton>
    <ul>
      <li v-for="item in page?.items" :key="item.id">
        {{ item.principal }} · {{ item.department }} / {{ item.matching }} · {{ item.state }}
      </li>
    </ul>
    <UiButton v-if="page?.nextCursor" :disabled="busy" @click="load(page!.nextCursor!)">{{
      t('devices.next')
    }}</UiButton>
  </PageFrame>
</template>
