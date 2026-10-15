<script setup lang="ts">
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverClose } from 'reka-ui'
defineProps<{ label: string; closeLabel: string }>()
const open = defineModel<boolean>('open', { default: false })
</script>
<template>
  <PopoverRoot v-model:open="open"
    ><PopoverTrigger class="ui-button">{{ label }}</PopoverTrigger
    ><PopoverPortal
      ><PopoverContent class="ui-popover ui-popover-panel" :aria-label="label" :side-offset="5"
        ><slot /><PopoverClose class="ui-button ui-button--ghost">{{
          closeLabel
        }}</PopoverClose></PopoverContent
      ></PopoverPortal
    ></PopoverRoot
  >
</template>
