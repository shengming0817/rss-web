<script setup lang="ts">
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
} from 'reka-ui'
defineProps<{ label: string }>()
</script>
<template>
  <TooltipProvider :delay-duration="300"
    ><TooltipRoot
      ><TooltipTrigger as-child><slot /></TooltipTrigger
      ><TooltipPortal
        ><TooltipContent class="ui-tooltip" :side-offset="5">{{
          label
        }}</TooltipContent></TooltipPortal
      ></TooltipRoot
    ></TooltipProvider
  >
</template>
