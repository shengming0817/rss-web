<script setup lang="ts">
import type { GroupCondition, GroupCriteria } from '../clients/groups'
import type { ConditionContext, FieldDefinition } from '../clients/asset-model'
import ConditionContextEditor from './ConditionContextEditor.vue'
import GroupCriteriaEditor from './GroupCriteriaEditor.vue'
defineProps<{
  fields: FieldDefinition[]
  assetContext: 'endpoint' | 'associated_device'
  group?: string | undefined
}>()
const model = defineModel<GroupCondition | null>({ required: true })
function context(value: ConditionContext | null) {
  model.value = value
    ? { ...value, criteria: model.value?.criteria ?? { kind: 'and', children: [] } }
    : null
}
function criteria(value: GroupCriteria) {
  model.value = {
    ...(model.value ?? { selector: { kind: 'device' }, quantifier: 'one' }),
    criteria: value,
  }
}
</script>
<template>
  <ConditionContextEditor :model-value="model" @update:model-value="context" /><GroupCriteriaEditor
    :model-value="model?.criteria ?? { kind: 'and', children: [] }"
    :fields="fields"
    :asset-context="assetContext"
    :group="group"
    @update:model-value="criteria"
  />
</template>
