<script setup lang="ts">
import { QueryControls } from '@rss/core'
import { useI18n } from 'vue-i18n'
import { accountCodecs, type AccountField } from '../services/account-query'
const props = defineProps<{
  query: { filter: string; sort: string; fields: AccountField[]; limit: number; source: string }
  busy?: boolean
  departments?: boolean
  previous?: boolean
  next?: boolean
}>()
const emit = defineEmits<{ apply: []; first: []; previous: []; next: [] }>()
const { locale } = useI18n()
const zh = () => locale.value.startsWith('zh')
const labels = () =>
  zh()
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
  <label
    >{{ zh() ? '资料来源（local 或指定 IdP UUID）' : 'Profile source (local or IdP UUID)'
    }}<input v-model="props.query.source" :disabled="busy"
  /></label>
  <QueryControls
    v-model:filter="props.query.filter"
    v-model:sort="props.query.sort"
    v-model:fields="props.query.fields"
    v-model:limit="props.query.limit"
    :columns="
      Object.keys(accountCodecs).filter((field) => departments || !field.startsWith('department'))
    "
    :maximum="100"
    :disabled="busy"
    :previous="previous"
    :next="next"
    :labels="labels()"
    :hint="
      (zh()
        ? '筛选：主体 ID、login、enabled、memberActive、hasLocalPassword、displayName、email、profileStatus；姓名/邮箱来自同一指定来源。运算符：== != =lt= =le= =gt= =ge= =in= =out= =icontains= =isnull= =isnotnull=；布尔字段支持 == != =in= =out=。'
        : 'Fields: principalId, login, enabled, memberActive, hasLocalPassword, displayName, email, profileStatus. Name/email use one selected source. Operators: == != =lt= =le= =gt= =ge= =in= =out= =icontains= =isnull= =isnotnull=; booleans: == != =in= =out=.') +
      (departments
        ? zh()
          ? ' 部门：department / departmentSubtree == 部门 ID；必须指定 IdP。'
          : ' Departments: department / departmentSubtree == department ID; select an IdP.'
        : '')
    "
    @update:fields="props.query.fields = $event as AccountField[]"
    @apply="emit('apply')"
    @first="emit('first')"
    @previous="emit('previous')"
    @next="emit('next')"
  />
</template>
