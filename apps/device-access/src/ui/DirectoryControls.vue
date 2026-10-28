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
    :filter="query.draft.filter"
    :sort="query.draft.sort"
    :fields="query.draft.fields"
    :limit="query.draft.limit"
    :columns="query.columns"
    :maximum="query.maximum"
    :labels="labels"
    :hint="hint"
    :disabled="busy"
    :previous="!!query.trail.value.length"
    :next="!!query.next.value"
    @update:filter="query.updateDraft({ filter: $event })"
    @update:sort="query.updateDraft({ sort: $event })"
    @update:fields="query.updateDraft({ fields: $event })"
    @update:limit="query.updateDraft({ limit: $event })"
    @apply="query.apply()"
    @first="query.first()"
    @previous="query.previous()"
    @next="query.following()"
  />
</template>
