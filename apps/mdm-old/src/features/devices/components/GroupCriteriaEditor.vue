<script setup lang="ts">
import { VSelect, VBtn } from 'vuetify/components'
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
    <v-select
      :model-value="modelValue.kind"
      :label="t('devices.condition')"
      :items="[
        { value: 'predicate', title: t('devices.predicate') },
        { value: 'group', title: t('devices.groupMembership') },
        ...((depth ?? 0) < 16
          ? ['and', 'or'].map((value) => ({ value, title: t('devices.' + value) }))
          : []),
      ]"
      @update:model-value="select"
    />
    <template v-if="modelValue.kind === 'group'"
      ><v-select
        :model-value="modelValue.op"
        :label="t('devices.groupMembership')"
        :items="[
          { value: 'member_of', title: t('devices.memberOf') },
          { value: 'not_member_of', title: t('devices.notMemberOf') },
        ]"
        @update:model-value="
          emit('update:modelValue', { ...modelValue, op: $event })
        " /><GroupPicker
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
        /><v-btn @click="child(index)">{{ t('devices.remove') }}</v-btn>
      </div>
      <v-btn
        v-if="(depth ?? 0) < 16"
        @click="
          emit('update:modelValue', {
            ...modelValue,
            children: [...modelValue.children, { kind: 'group', groupId: '', op: 'member_of' }],
          })
        "
        >{{ t('devices.addGroupCondition') }}</v-btn
      ><v-btn
        v-if="(depth ?? 0) < 16"
        @click="
          emit('update:modelValue', {
            ...modelValue,
            children: [...modelValue.children, { kind: 'and', children: [] }],
          })
        "
        >{{ t('devices.addConditionSet') }}</v-btn
      ></template
    >
  </div>
</template>
