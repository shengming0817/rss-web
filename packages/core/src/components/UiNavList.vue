<script setup lang="ts">
import type { UiOption } from './types'
defineProps<{ label: string; items: readonly UiOption[]; current?: string }>()
const emit = defineEmits<{ select: [value: string] }>()
</script>
<template>
  <nav :aria-label="label" class="ui-nav">
    <slot v-for="item in items" :key="item.value" :item="item" :active="item.value === current"
      ><button
        type="button"
        class="ui-nav-item"
        :aria-current="item.value === current ? 'page' : undefined"
        :disabled="!!item.disabled"
        @click="emit('select', item.value)"
      >
        {{ item.label }}
      </button></slot
    >
  </nav>
</template>
