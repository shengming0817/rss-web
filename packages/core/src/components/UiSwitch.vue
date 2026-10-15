<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'
defineProps<{ label: string; disabled?: boolean }>()
const model = defineModel<boolean>({ required: true })
</script>
<template>
  <label class="ui-choice"
    ><SwitchRoot v-model="model" class="ui-switch" :disabled="!!disabled" :aria-label="label"
      ><SwitchThumb class="ui-switch-thumb" /></SwitchRoot
    ><span>{{ label }}</span></label
  >
</template>
