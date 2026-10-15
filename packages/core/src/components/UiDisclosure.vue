<script setup lang="ts">
import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui'
defineProps<{ label: string; disabled?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
</script>
<template>
  <CollapsibleRoot v-model:open="open" :disabled="!!disabled" class="ui-disclosure"
    ><CollapsibleTrigger class="ui-disclosure-trigger"
      ><span>{{ label }}</span
      ><span aria-hidden="true">{{ open ? '−' : '+' }}</span></CollapsibleTrigger
    ><CollapsibleContent class="ui-disclosure-content"><slot /></CollapsibleContent
  ></CollapsibleRoot>
</template>
