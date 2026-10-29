<script setup lang="ts">
import type {
  InventoryCondition,
  Criteria,
  FieldDefinition,
  ConditionContext,
} from '../clients/asset-model'
import { deviceCondition } from '../clients/asset-model'
import ConditionContextEditor from './ConditionContextEditor.vue'
import CriteriaEditor from './CriteriaEditor.vue'
defineProps<{ fields: FieldDefinition[] }>()
const model = defineModel<InventoryCondition | null>({ required: true })
function context(value: ConditionContext | null) {
  model.value = value
    ? { ...value, criteria: model.value?.criteria ?? { kind: 'and', children: [] } }
    : null
}
function predicate(value: Criteria | null) {
  model.value = {
    ...(model.value ?? deviceCondition()),
    criteria: value ?? { kind: 'and', children: [] },
  }
}
</script>
<template>
  <section class="inventory-condition">
    <ConditionContextEditor :model-value="model" @update:model-value="context" /><CriteriaEditor
      :model-value="model?.criteria ?? null"
      :fields="fields"
      @update:model-value="predicate"
    />
  </section>
</template>
