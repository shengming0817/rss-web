<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <div class="ui-empty">
    <slot name="icon" />
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
