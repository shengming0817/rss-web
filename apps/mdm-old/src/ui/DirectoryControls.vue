<script setup lang="ts">
import { QueryControls } from '@rss/core'
import { useI18n } from 'vue-i18n'
import type { DirectoryNavigation } from '../services/useDirectoryQuery'
const props = defineProps<{ query: DirectoryNavigation; busy?: boolean; hint?: string }>()
const emit = defineEmits<{ load: [cursor?: string] }>()
function navigate(after?: string) {
  props.query.navigate()
  emit('load', after)
}
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
    :filter="query.draft.filter"
    :sort="query.draft.sort"
    :fields="query.draft.fields"
    :limit="query.draft.limit"
    :columns="query.columns"
    :maximum="query.maximum"
    :disabled="busy"
    :previous="!!query.trail.value.length"
    :next="!!query.next.value"
    :labels="labels()"
    :hint="hint"
    @update:filter="query.updateDraft({ filter: $event })"
    @update:sort="query.updateDraft({ sort: $event })"
    @update:fields="query.updateDraft({ fields: $event })"
    @update:limit="query.updateDraft({ limit: $event })"
    @apply="emit('load')"
    @first="navigate()"
    @previous="navigate(query.previous.value)"
    @next="navigate(query.next.value ?? undefined)"
  />
</template>
