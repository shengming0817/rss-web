<script setup lang="ts">
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'reka-ui'
import type { UiOption } from './types'
defineProps<{ label: string; items: readonly UiOption[]; disabled?: boolean }>()
const emit = defineEmits<{ select: [value: string] }>()
</script>
<template>
  <DropdownMenuRoot
    ><DropdownMenuTrigger class="ui-button" :disabled="!!disabled"
      >{{ label }} <span aria-hidden="true">⌄</span></DropdownMenuTrigger
    ><DropdownMenuPortal
      ><DropdownMenuContent class="ui-popover" :side-offset="5"
        ><DropdownMenuItem
          v-for="item in items"
          :key="item.value"
          :disabled="!!item.disabled"
          :text-value="item.label"
          class="ui-menu-item"
          @select="emit('select', item.value)"
          >{{ item.label }}</DropdownMenuItem
        ></DropdownMenuContent
      ></DropdownMenuPortal
    ></DropdownMenuRoot
  >
</template>
