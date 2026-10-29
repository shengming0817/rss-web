<script setup lang="ts">
import { VSelect, VAutocomplete, VBtn } from 'vuetify/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Criteria, FieldDefinition, Scalar } from '../clients/asset-model'
import { editableField } from '../clients/asset-model'
import ScalarEditor from './ScalarEditor.vue'
const props = defineProps<{
  modelValue: Criteria | null
  fields: FieldDefinition[]
  depth?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Criteria | null] }>()
const { t } = useI18n()
const field = computed(() =>
  props.fields.find(
    (f) => props.modelValue?.kind === 'predicate' && f.key === props.modelValue.field,
  ),
)
const initial = (kind: Scalar['kind']): Scalar =>
  kind === 'string'
    ? { kind, value: '' }
    : kind === 'boolean'
      ? { kind, value: false }
      : { kind, value: 0 }
function predicate(key: string, op?: FieldDefinition['operations'][number]) {
  const f = props.fields.find((f) => f.key === key)
  if (!f || !editableField(f)) return
  const operator = op ?? f.operations[0]!
  const base = { kind: 'predicate' as const, field: f.key, op: operator }
  emit(
    'update:modelValue',
    operator === 'is_null' || operator === 'is_not_null'
      ? base
      : operator === 'in' || operator === 'not_in'
        ? { ...base, values: [initial(f.kind)] }
        : { ...base, value: initial(f.kind) },
  )
}
function kind(value: string) {
  if (value === 'all') emit('update:modelValue', null)
  else if (value === 'and' || value === 'or')
    emit('update:modelValue', { kind: value, children: [] })
  else predicate(props.fields[0]?.key ?? '')
}
function child(index: number, value: Criteria | null) {
  if (!props.modelValue || props.modelValue.kind === 'predicate') return
  const children = [...props.modelValue.children]
  if (value) children[index] = value
  else children.splice(index, 1)
  emit('update:modelValue', { ...props.modelValue, children })
}
function operand(index: number, value?: Scalar) {
  if (props.modelValue?.kind !== 'predicate') return
  const values = [...(props.modelValue.values ?? [])]
  if (value) values[index] = value
  else values.splice(index, 1)
  emit('update:modelValue', { ...props.modelValue, values })
}
</script>
<template>
  <fieldset class="condition-editor">
    <legend>{{ t('devices.condition') }}</legend>
    <v-select
      :model-value="modelValue?.kind ?? 'all'"
      :label="t('devices.kind')"
      :items="[
        ...(!depth ? [{ value: 'all', title: t('devices.all') }] : []),
        { value: 'predicate', title: t('devices.predicate') },
        ...((depth ?? 0) < 8
          ? ['and', 'or'].map((value) => ({ value, title: t('devices.' + value) }))
          : []),
      ]"
      @update:model-value="kind"
    />
    <template v-if="modelValue?.kind === 'predicate'">
      <v-autocomplete
        :model-value="modelValue.field"
        :label="t('devices.field')"
        :items="
          fields
            .filter(editableField)
            .map((f) => ({ value: f.key, title: f.key + ' (' + f.kind + ')' }))
        "
        @update:model-value="predicate"
      />
      <v-select
        :model-value="modelValue.op"
        :label="t('devices.operator')"
        :items="
          field?.operations.map((value) => ({ value, title: t('devices.op.' + value) })) ?? []
        "
        @update:model-value="predicate(modelValue.field, $event)"
      />
      <ScalarEditor
        v-if="modelValue.value"
        :model-value="modelValue.value"
        @update:model-value="emit('update:modelValue', { ...modelValue, value: $event })"
      />
      <div v-for="(value, index) in modelValue.values" :key="index" class="console-inline-actions">
        <ScalarEditor :model-value="value" @update:model-value="operand(index, $event)" /><v-btn
          type="button"
          @click="operand(index)"
          >{{ t('devices.remove') }}</v-btn
        >
      </div>
      <v-btn
        v-if="modelValue.values && field && editableField(field)"
        type="button"
        @click="operand(modelValue.values.length, initial(field.kind))"
        >{{ t('devices.add') }}</v-btn
      >
    </template>
    <template v-else-if="modelValue"
      ><div v-for="(item, index) in modelValue.children" :key="index">
        <CriteriaEditor
          :model-value="item"
          :fields="fields"
          :depth="(depth ?? 0) + 1"
          @update:model-value="child(index, $event)"
        /><v-btn type="button" @click="child(index, null)">{{ t('devices.remove') }}</v-btn>
      </div>
      <v-btn
        type="button"
        @click="child(modelValue.children.length, { kind: 'and', children: [] })"
        >{{ t('devices.add') }}</v-btn
      ></template
    >
  </fieldset>
</template>
