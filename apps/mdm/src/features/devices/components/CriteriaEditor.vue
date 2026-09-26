<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Criteria, FieldDefinition, Scalar } from '../clients/asset-model'
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
  if (!f) return
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
function kind(event: Event) {
  const value = (event.target as HTMLSelectElement).value
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
    <select :aria-label="t('devices.kind')" :value="modelValue?.kind ?? 'all'" @change="kind">
      <option v-if="!depth" value="all">{{ t('devices.all') }}</option>
      <option value="predicate">{{ t('devices.predicate') }}</option>
      <option v-if="(depth ?? 0) < 8" value="and">{{ t('devices.and') }}</option>
      <option v-if="(depth ?? 0) < 8" value="or">{{ t('devices.or') }}</option>
    </select>
    <template v-if="modelValue?.kind === 'predicate'">
      <select
        :aria-label="t('devices.field')"
        :value="modelValue.field"
        @change="predicate(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="f in fields" :key="f.key" :value="f.key">{{ f.key }} ({{ f.kind }})</option>
      </select>
      <select
        :aria-label="t('devices.operator')"
        :value="modelValue.op"
        @change="
          predicate(
            modelValue.field,
            ($event.target as HTMLSelectElement).value as FieldDefinition['operations'][number],
          )
        "
      >
        <option v-for="op in field?.operations" :key="op" :value="op">
          {{ t(`devices.op.${op}`) }}
        </option>
      </select>
      <ScalarEditor
        v-if="modelValue.value"
        :model-value="modelValue.value"
        @update:model-value="emit('update:modelValue', { ...modelValue, value: $event })"
      />
      <div v-for="(value, index) in modelValue.values" :key="index" class="device-actions">
        <ScalarEditor :model-value="value" @update:model-value="operand(index, $event)" /><button
          type="button"
          @click="operand(index)"
        >
          {{ t('devices.remove') }}
        </button>
      </div>
      <button
        v-if="modelValue.values && field"
        type="button"
        @click="operand(modelValue.values.length, initial(field.kind))"
      >
        {{ t('devices.add') }}
      </button>
    </template>
    <template v-else-if="modelValue">
      <div v-for="(item, index) in modelValue.children" :key="index">
        <CriteriaEditor
          :model-value="item"
          :fields="fields"
          :depth="(depth ?? 0) + 1"
          @update:model-value="child(index, $event)"
        /><button type="button" @click="child(index, null)">{{ t('devices.remove') }}</button>
      </div>
      <button
        type="button"
        @click="child(modelValue.children.length, { kind: 'and', children: [] })"
      >
        {{ t('devices.add') }}
      </button>
    </template>
  </fieldset>
</template>
