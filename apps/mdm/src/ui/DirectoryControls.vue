<script setup lang="ts">
import { QueryControls } from '@rss/core'
import { useI18n } from 'vue-i18n'
import type { DirectoryNavigation } from '../services/useDirectoryQuery'
const props = defineProps<{ query: DirectoryNavigation; busy?: boolean; hint?: string }>()
const emit = defineEmits<{ load: [cursor?: string] }>()
const { locale } = useI18n()
const labels = () =>
  locale.value.startsWith('zh')
    ? {
        filter: '筛选表达式',
        sort: '排序（逗号分隔，- 降序）',
        fields: '返回字段',
        limit: '每页数量',
        apply: '应用查询',
        first: '首页 / 重新查询',
        previous: '上一页',
        next: '下一页',
      }
    : {
        filter: 'Filter expression',
        sort: 'Sort (comma separated, - descending)',
        fields: 'Returned fields',
        limit: 'Page size',
        apply: 'Apply query',
        first: 'First / requery',
        previous: 'Previous',
        next: 'Next',
      }
</script>
<template>
  <QueryControls
    v-model:filter="props.query.draft.filter"
    v-model:sort="props.query.draft.sort"
    v-model:fields="props.query.draft.fields"
    v-model:limit="props.query.draft.limit"
    :columns="query.columns"
    :maximum="query.maximum"
    :disabled="busy"
    :previous="!!query.trail.value.length"
    :next="!!query.next.value"
    :labels="labels()"
    :hint="hint"
    @apply="emit('load')"
    @first="
      query.navigate()
      emit('load')
    "
    @previous="
      query.navigate()
      emit('load', query.previous.value)
    "
    @next="
      query.navigate()
      emit('load', query.next.value ?? undefined)
    "
  />
</template>
