<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { VSelect, VTextField, VCombobox, VBtn, VAlert } from 'vuetify/components'
import { defaultRule, fields, operators, type Rule, type Scalar } from './model'
import { messages } from './messages'
const props = withDefaults(
  defineProps<{
    modelValue: Rule
    domain: 'user' | 'device'
    depth?: number
    disabled?: boolean
  }>(),
  { depth: 0, disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: Rule] }>()
const { t } = useI18n({ useScope: 'local', messages })
const field = computed(() => {
  const value = props.modelValue
  return value.mode === 'match'
    ? fields[props.domain].find((f) => f.key === value.attribute)
    : undefined
})
const allowed = computed(() =>
  operators.filter((op) =>
    field.value?.type === 'string'
      ? !['gt', 'ge', 'lt', 'le'].includes(op)
      : field.value?.type === 'boolean'
        ? ['eq', 'ne', 'in', 'not_in'].includes(op)
        : !['contains', 'not_contains'].includes(op),
  ),
)
const isSet = computed(
  () => props.modelValue.mode === 'match' && ['in', 'not_in'].includes(props.modelValue.operator),
)
const boolItems = computed(() => [
  { title: t('demoGroups.true'), value: true },
  { title: t('demoGroups.false'), value: false },
])
function mode(value: string) {
  emit(
    'update:modelValue',
    value === 'all' || value === 'any'
      ? {
          mode: value,
          rules:
            props.modelValue.mode === 'all' || props.modelValue.mode === 'any'
              ? props.modelValue.rules
              : [props.modelValue],
        }
      : defaultRule(props.domain),
  )
}
function attribute(value: string) {
  const selected = fields[props.domain].find((f) => f.key === value)
  if (!selected) return
  emit('update:modelValue', {
    mode: 'match',
    attribute: value,
    operator: 'eq',
    operand: selected.type === 'boolean' ? false : selected.type === 'number' ? 0 : '',
  })
}
function operator(value: string) {
  if (props.modelValue.mode !== 'match') return
  const set = ['in', 'not_in'].includes(value),
    old = props.modelValue.operand
  emit('update:modelValue', {
    ...props.modelValue,
    operator: value as typeof props.modelValue.operator,
    operand: set ? (Array.isArray(old) ? old : [old]) : Array.isArray(old) ? (old[0] ?? '') : old,
  })
}
function operand(value: unknown) {
  if (props.modelValue.mode !== 'match') return
  const convert = (v: unknown): Scalar =>
    field.value?.type === 'number'
      ? v === '' || v === null
        ? Number.NaN
        : Number(v)
      : field.value?.type === 'boolean'
        ? v === true
        : String(v ?? '')
  emit('update:modelValue', {
    ...props.modelValue,
    operand: isSet.value ? (Array.isArray(value) ? value : []).map(convert) : convert(value),
  })
}
function child(index: number, value?: Rule) {
  if (props.modelValue.mode !== 'all' && props.modelValue.mode !== 'any') return
  const rules = [...props.modelValue.rules]
  if (value) rules[index] = value
  else rules.splice(index, 1)
  emit('update:modelValue', { ...props.modelValue, rules })
}
</script>
<template>
  <div class="mock-group-rule">
    <v-select
      :model-value="modelValue.mode"
      :label="t('demoGroups.mode')"
      :disabled="!!disabled"
      :items="[
        { value: 'match', title: t('demoGroups.matchRule') },
        { value: 'all', title: t('demoGroups.all') },
        { value: 'any', title: t('demoGroups.any') },
        ...(modelValue.mode === 'users' ? [{ value: 'users', title: t('demoGroups.users') }] : []),
      ]"
      @update:model-value="mode"
    />
    <template v-if="modelValue.mode === 'match'">
      <v-select
        :model-value="modelValue.attribute"
        :label="t('demoGroups.field')"
        :disabled="!!disabled"
        :items="
          fields[domain].map((f) => ({ value: f.key, title: t('demoGroups.fields.' + f.key) }))
        "
        @update:model-value="attribute"
      />
      <v-select
        :model-value="modelValue.operator"
        :label="t('demoGroups.operator')"
        :disabled="!!disabled"
        :items="allowed.map((op) => ({ value: op, title: t('demoGroups.operators.' + op) }))"
        @update:model-value="operator"
      />
      <v-select
        v-if="field?.type === 'boolean'"
        :model-value="modelValue.operand"
        :multiple="isSet"
        :items="boolItems"
        :label="t('demoGroups.operand')"
        :disabled="!!disabled"
        @update:model-value="operand"
      />
      <v-combobox
        v-else-if="isSet"
        :model-value="Array.isArray(modelValue.operand) ? modelValue.operand : []"
        multiple
        chips
        :label="t('demoGroups.operand')"
        :disabled="!!disabled"
        @update:model-value="operand"
      />
      <v-text-field
        v-else
        :model-value="modelValue.operand"
        :type="field?.type === 'number' ? 'number' : 'text'"
        :label="t('demoGroups.operand')"
        :disabled="!!disabled"
        @update:model-value="operand"
      />
    </template>
    <template v-else-if="modelValue.mode === 'users'">
      <v-alert type="info" variant="tonal"
        >{{ t('demoGroups.source') }}: {{ modelValue.groupId }}</v-alert
      >
      <v-select
        :model-value="modelValue.relation"
        :label="t('demoGroups.relation')"
        :disabled="!!disabled"
        :items="
          ['registration_user', 'current_user'].map((v) => ({
            value: v,
            title: t('demoGroups.' + v),
          }))
        "
        @update:model-value="emit('update:modelValue', { ...modelValue, relation: $event })"
      />
    </template>
    <template v-else>
      <div v-for="(item, index) in modelValue.rules" :key="index" class="console-panel">
        <GroupRuleEditor
          :model-value="item"
          :domain="domain"
          :depth="(depth ?? 0) + 1"
          :disabled="!!disabled"
          @update:model-value="child(index, $event)"
        />
        <v-btn :disabled="disabled || modelValue.rules.length === 1" @click="child(index)">{{
          t('demoGroups.removeRule')
        }}</v-btn>
      </div>
      <v-btn
        :disabled="disabled || (depth ?? 0) >= 7 || modelValue.rules.length >= 16"
        @click="
          emit('update:modelValue', {
            ...modelValue,
            rules: [...modelValue.rules, defaultRule(domain)],
          })
        "
        >{{ t('demoGroups.addRule') }}</v-btn
      >
    </template>
  </div>
</template>
