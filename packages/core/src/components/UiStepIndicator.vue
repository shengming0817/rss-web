<script setup lang="ts">
defineProps<{ label: string; steps: readonly string[]; current: number }>()
</script>
<template>
  <ol class="ui-steps" :aria-label="label">
    <li
      v-for="(step, index) in steps"
      :key="index"
      :aria-current="index === current ? 'step' : undefined"
      :class="{ 'ui-step-complete': index < current }"
    >
      <span class="ui-step-number" aria-hidden="true">{{ index < current ? '✓' : index + 1 }}</span
      ><span>{{ step }}</span>
    </li>
  </ol>
</template>
