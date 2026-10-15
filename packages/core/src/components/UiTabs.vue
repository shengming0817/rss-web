<script setup lang="ts">
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import type { UiOption } from './types'
defineProps<{ label: string; items: readonly UiOption[]; keepMounted?: boolean }>()
const model = defineModel<string>({ required: true })
</script>
<template>
  <TabsRoot v-model="model" class="ui-tabs-root"
    ><TabsList class="ui-tabs" :aria-label="label"
      ><TabsTrigger
        v-for="item in items"
        :key="item.value"
        class="ui-tab"
        :value="item.value"
        :disabled="!!item.disabled"
        >{{ item.label }}</TabsTrigger
      ></TabsList
    ><TabsContent
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :force-mount="!!keepMounted"
      :style="keepMounted && model !== item.value ? { display: 'none' } : undefined"
      class="ui-tab-panel"
      ><slot :name="item.value" /></TabsContent
  ></TabsRoot>
</template>
