<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  VExpansionPanel,
  VExpansionPanels,
  VExpansionPanelText,
  VExpansionPanelTitle,
} from 'vuetify/components'

const props = defineProps<{ open?: boolean | undefined }>()
const expanded = ref<number | undefined>(props.open ? 0 : undefined)
watch(
  () => props.open,
  (open) => {
    expanded.value = open ? 0 : undefined
  },
)
</script>

<template>
  <VExpansionPanels v-model="expanded" class="mdm-disclosure" variant="accordion">
    <VExpansionPanel :value="0">
      <VExpansionPanelTitle><slot name="title" /></VExpansionPanelTitle>
      <VExpansionPanelText eager><slot /></VExpansionPanelText>
    </VExpansionPanel>
  </VExpansionPanels>
</template>
