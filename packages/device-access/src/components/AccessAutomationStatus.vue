<script setup lang="ts">
import type { OriginalOperation } from '../model'
defineProps<{ operation: OriginalOperation }>()
</script>
<template>
  <section aria-label="原操作结果">
    <p>原操作 {{ operation.id }}</p>
    <v-chip>{{ operation.state }}</v-chip>
    <dl class="detail-list">
      <div v-for="o in operation.observations" :key="o.key">
        <dt>{{ o.key }}</dt>
        <dd>{{ o.value ?? '未观察' }} · {{ o.state }}</dd>
      </div>
    </dl>
    <p>服务端受理不证明设备效果；空观察不表示完成。</p>
  </section>
</template>
