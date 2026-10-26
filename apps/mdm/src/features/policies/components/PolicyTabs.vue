<script setup lang="ts">
import { VTab, VTabs, VTabsWindow, VTabsWindowItem } from 'vuetify/components'
defineProps<{
  label: string
  items: readonly { value: string; label: string; disabled?: boolean }[]
  keepMounted?: boolean
}>()
const model = defineModel<string>({ required: true })
</script>
<template>
  <VTabs v-model="model" :aria-label="label" color="primary"
    ><VTab v-for="item in items" :key="item.value" :value="item.value" :disabled="!!item.disabled">{{
      item.label
    }}</VTab></VTabs
  >
  <VTabsWindow v-model="model"
    ><VTabsWindowItem
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :eager="!!keepMounted"
      ><slot :name="item.value" /></VTabsWindowItem
  ></VTabsWindow>
</template>
