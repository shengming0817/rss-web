<script setup lang="ts">
import type { Assignment } from '../model'
defineProps<{ assignment: Assignment }>()
</script>
<template>
  <dl class="detail-list">
    <div>
      <dt>资产使用人</dt>
      <dd>{{ assignment.assignee?.label ?? '未分配' }}</dd>
    </div>
    <div>
      <dt>资产所有人</dt>
      <dd>{{ assignment.owner?.label ?? '未分配' }}</dd>
    </div>
  </dl>
</template>
