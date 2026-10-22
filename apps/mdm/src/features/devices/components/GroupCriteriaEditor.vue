<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import type { GroupCriteria } from '../clients/groups'
import type { Criteria, FieldDefinition } from '../clients/asset-model'
import CriteriaEditor from './CriteriaEditor.vue'
import GroupPicker from './GroupPicker.vue'
const props = defineProps<{
  modelValue: GroupCriteria
  fields: FieldDefinition[]
  assetContext: 'endpoint' | 'associated_device'
  group?: string | undefined
  depth?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: GroupCriteria] }>()
const { t } = useI18n()
function select(kind: string) {
  if (kind === 'group') emit('update:modelValue', { kind, groupId: '', op: 'member_of' })
  else if (kind === 'and' || kind === 'or')
    emit('update:modelValue', {
      kind,
      children:
        props.modelValue.kind === 'and' || props.modelValue.kind === 'or'
          ? props.modelValue.children
          : [props.modelValue],
    })
  else {
    const field = props.fields.find((f) =>
      ['string', 'boolean', 'integer', 'time'].includes(f.kind),
    )
    emit('update:modelValue', {
      kind: 'predicate',
      field: field?.key ?? '',
      op: field?.operations[0] ?? 'eq',
      value: { kind: 'string', value: '' },
    })
  }
}
function child(index: number, value?: GroupCriteria) {
  if (props.modelValue.kind !== 'and' && props.modelValue.kind !== 'or') return
  const children = [...props.modelValue.children]
  if (value) children[index] = value
  else children.splice(index, 1)
  emit('update:modelValue', { ...props.modelValue, children })
}
function scalar(value: Criteria | null) {
  emit('update:modelValue', value ?? { kind: 'and', children: [] })
}
</script>
<template>
  <div class="group-criteria">
    <div class="console-toolbar">
      <select
        class="ui-input"
        :aria-label="t('devices.condition')"
        :value="modelValue.kind"
        @change="select(($event.target as HTMLSelectElement).value)"
      >
        <option value="predicate">{{ t('devices.predicate') }}</option>
        <option value="group">{{ t('devices.groupMembership') }}</option>
        <option v-if="(depth ?? 0) < 16" value="and">{{ t('devices.and') }}</option>
        <option v-if="(depth ?? 0) < 16" value="or">{{ t('devices.or') }}</option>
      </select>
    </div>
    <template v-if="modelValue.kind === 'group'"
      ><select
        class="ui-input"
        :aria-label="t('devices.groupMembership')"
        :value="modelValue.op"
        @change="
          emit('update:modelValue', {
            ...modelValue,
            op: ($event.target as HTMLSelectElement).value as 'member_of' | 'not_member_of',
          })
        "
      >
        <option value="member_of">{{ t('devices.memberOf') }}</option>
        <option value="not_member_of">{{ t('devices.notMemberOf') }}</option></select
      ><GroupPicker
        :model-value="modelValue.groupId"
        :asset-context="assetContext"
        :referenceable-for="group"
        @update:model-value="
          emit('update:modelValue', { ...modelValue, groupId: $event } as GroupCriteria)
        "
    /></template>
    <CriteriaEditor
      v-else-if="modelValue.kind === 'predicate'"
      :model-value="modelValue"
      :fields="fields"
      @update:model-value="scalar"
    />
    <template v-else
      ><div v-for="(item, index) in modelValue.children" :key="index" class="group-condition-row">
        <GroupCriteriaEditor
          :model-value="item"
          :fields="fields"
          :asset-context="assetContext"
          :group="group"
          :depth="(depth ?? 0) + 1"
          @update:model-value="child(index, $event)"
        /><UiButton @click="child(index)">{{ t('devices.remove') }}</UiButton>
      </div>
      <UiButton
        v-if="(depth ?? 0) < 16"
        @click="
          emit('update:modelValue', {
            ...modelValue,
            children: [...modelValue.children, { kind: 'group', groupId: '', op: 'member_of' }],
          })
        "
        >{{ t('devices.addGroupCondition') }}</UiButton
      ><UiButton
        v-if="(depth ?? 0) < 16"
        @click="
          emit('update:modelValue', {
            ...modelValue,
            children: [...modelValue.children, { kind: 'and', children: [] }],
          })
        "
        >{{ t('devices.addConditionSet') }}</UiButton
      ></template
    >
  </div>
</template>
