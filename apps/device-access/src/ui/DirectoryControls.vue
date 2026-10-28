<script setup lang="ts">
import { QueryControls } from '@rss/core'
import type { DirectoryNavigation } from '../services/directory'
defineProps<{ query: DirectoryNavigation; busy?: boolean | undefined; hint?: string | undefined }>()
const labels = {
  filter: '筛选表达式',
  sort: '排序（逗号分隔，- 降序）',
  fields: '返回字段',
  limit: '每页数量',
  apply: '应用查询',
  first: '首页 / 重新查询',
  previous: '上一页',
  next: '下一页',
}
</script>
<template>
  <QueryControls
    v-model:filter="query.draft.filter"
    v-model:sort="query.draft.sort"
    v-model:fields="query.draft.fields"
    v-model:limit="query.draft.limit"
    :columns="query.columns"
    :maximum="query.maximum"
    :labels="labels"
    :hint="hint"
    :disabled="busy"
    :previous="!!query.trail.value.length"
    :next="!!query.next.value"
    @apply="query.apply()"
    @first="query.first()"
    @previous="query.previous()"
    @next="query.following()"
  />
</template>
