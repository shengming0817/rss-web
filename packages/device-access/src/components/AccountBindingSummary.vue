<script setup lang="ts">
import type { Binding } from '../model'
defineProps<{ binding: Binding }>()
</script>
<template>
  <dl class="detail-list">
    <div>
      <dt>本地账号</dt>
      <dd>{{ binding.account }}</dd>
    </div>
    <div>
      <dt>绑定代际</dt>
      <dd>{{ binding.bindingGeneration }}</dd>
    </div>
    <div>
      <dt>因子代际</dt>
      <dd>{{ binding.factorGeneration }}</dd>
    </div>
    <div>
      <dt>实际应用</dt>
      <dd>{{ binding.appliedRevision === null ? '未观察' : 'v' + binding.appliedRevision }}</dd>
    </div>
  </dl>
</template>
