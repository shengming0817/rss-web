<script setup lang="ts">
import { nextTick, reactive, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  POLICY_ATTRIBUTES,
  POLICY_EQUALITY_PREDICATES,
  POLICY_MEMBERSHIP_PREDICATES,
  POLICY_ORDERING_PREDICATES,
  POLICY_ROW_SCOPES,
  POLICY_STRING_PREDICATES,
  type PolicyView,
} from '@rss/identity'
import {
  createPolicyCreateCommand,
  createPolicyUpdateCommand,
  type PolicyWriteCommand,
} from './policy-write-operation'
import {
  emptyPolicyRule,
  policyEditorDraft,
  policyEditorFields,
  PolicyEditorValidationError,
  type EditablePolicyRule,
} from './policy-editor-model'

const props = defineProps<{
  readonly mode: 'create' | 'update'
  readonly snapshot?: PolicyView
  readonly busy?: boolean
}>()
const emit = defineEmits<{ prepare: [command: PolicyWriteCommand] }>()
const { t } = useI18n()
const draft = reactive(policyEditorDraft(props.snapshot))
const errorPath = ref<string>()
const errorBox = ref<HTMLElement>()
const form = ref<HTMLFormElement>()
const errorId = `policy-editor-error-${useId()}`

function fieldA11y(path: string) {
  return errorPath.value === path ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}
}

function predicates(rule: EditablePolicyRule): readonly string[] {
  switch (rule.family) {
    case 'equality':
      return POLICY_EQUALITY_PREDICATES
    case 'ordering':
      return POLICY_ORDERING_PREDICATES
    case 'membership':
      return POLICY_MEMBERSHIP_PREDICATES
    case 'string':
      return POLICY_STRING_PREDICATES
  }
}

function changeFamily(rule: EditablePolicyRule) {
  rule.predicate = predicates(rule)[0]!
  if (rule.family === 'ordering') {
    rule.operandKind = 'literal'
    rule.valueType = 'integer'
  } else if (rule.family === 'membership') {
    rule.operandKind = 'set'
  } else if (rule.family === 'string') {
    rule.operandKind = 'pattern'
    rule.valueType = 'string'
  } else {
    rule.operandKind = 'literal'
  }
}

function addRule() {
  draft.rules.push(emptyPolicyRule())
}

function submit() {
  errorPath.value = undefined
  try {
    const fields = policyEditorFields(draft)
    const command =
      props.mode === 'create'
        ? createPolicyCreateCommand({ policyId: draft.policyId, ...fields })
        : props.snapshot === undefined
          ? undefined
          : createPolicyUpdateCommand(props.snapshot, fields)
    if (command === undefined) throw new Error('missing policy snapshot')
    emit('prepare', command)
  } catch (error: unknown) {
    errorPath.value =
      error instanceof PolicyEditorValidationError
        ? error.path
        : props.mode === 'create'
          ? 'policyId'
          : 'contractId'
    void nextTick(() => {
      const field = form.value?.querySelector<HTMLElement>(`[data-field-path="${errorPath.value}"]`)
      ;(field ?? errorBox.value)?.focus()
    })
  }
}
</script>

<template>
  <form ref="form" class="policy-editor" :aria-busy="busy" @submit.prevent="submit">
    <p v-if="errorPath" :id="errorId" ref="errorBox" class="v1-alert" role="alert" tabindex="-1">
      {{ t('policies.write.validation', { field: errorPath }) }}
    </p>
    <label v-if="mode === 'create'">
      {{ t('policies.write.policyId') }}
      <input
        v-model="draft.policyId"
        data-field-path="policyId"
        required
        :disabled="busy"
        v-bind="fieldA11y('policyId')"
      />
    </label>
    <label>
      {{ t('policies.detail.contractId') }}
      <input
        v-model="draft.contractId"
        data-field-path="contractId"
        required
        :disabled="busy"
        v-bind="fieldA11y('contractId')"
      />
    </label>
    <label>
      {{ t('policies.detail.permission') }}
      <input
        v-model="draft.permission"
        data-field-path="permission"
        required
        :disabled="busy"
        v-bind="fieldA11y('permission')"
      />
    </label>
    <label>
      {{ t('policies.detail.effectiveFrom') }}
      <input
        v-model="draft.effectiveFrom"
        data-field-path="effectiveFrom"
        inputmode="numeric"
        required
        :disabled="busy"
        v-bind="fieldA11y('effectiveFrom')"
      />
    </label>
    <label>
      {{ t('policies.detail.effectiveUntil') }}
      <input
        v-model="draft.effectiveUntil"
        data-field-path="effectiveUntil"
        inputmode="numeric"
        :disabled="busy"
        v-bind="fieldA11y('effectiveUntil')"
      />
    </label>

    <fieldset v-for="(rule, index) in draft.rules" :key="index" class="policy-editor__rule">
      <legend>{{ t('policies.detail.rule', { number: index + 1 }) }}</legend>
      <label>
        {{ t('policies.detail.attribute') }}
        <input
          v-model="rule.attribute"
          :data-field-path="`rules.${index}.attribute`"
          required
          :disabled="busy"
          v-bind="fieldA11y(`rules.${index}.attribute`)"
        />
      </label>
      <label>
        {{ t('policies.detail.family') }}
        <select v-model="rule.family" :disabled="busy" @change="changeFamily(rule)">
          <option value="equality">equality</option>
          <option value="ordering">ordering</option>
          <option value="membership">membership</option>
          <option value="string">string</option>
        </select>
      </label>
      <label>
        {{ t('policies.detail.predicate') }}
        <select
          v-model="rule.predicate"
          :data-field-path="`rules.${index}.predicate`"
          :disabled="busy"
          v-bind="fieldA11y(`rules.${index}.predicate`)"
        >
          <option v-for="predicate in predicates(rule)" :key="predicate" :value="predicate">
            {{ predicate }}
          </option>
        </select>
      </label>
      <label v-if="rule.family === 'equality'">
        {{ t('policies.detail.operandKind') }}
        <select v-model="rule.operandKind" :disabled="busy">
          <option value="literal">literal</option>
          <option value="attribute">attribute</option>
        </select>
      </label>
      <label v-if="rule.family !== 'string' && rule.operandKind !== 'attribute'">
        {{ t('policies.detail.valueType') }}
        <select
          v-model="rule.valueType"
          :data-field-path="`rules.${index}.valueType`"
          :disabled="busy"
          v-bind="fieldA11y(`rules.${index}.valueType`)"
        >
          <option value="string">string</option>
          <option value="boolean">boolean</option>
          <option value="integer">integer</option>
          <option value="decimal">decimal</option>
        </select>
      </label>
      <label v-if="rule.operandKind === 'attribute'">
        {{ t('policies.write.operandAttribute') }}
        <select
          v-model="rule.value"
          :data-field-path="`rules.${index}.operand`"
          :disabled="busy"
          v-bind="fieldA11y(`rules.${index}.operand`)"
        >
          <option v-for="attribute in POLICY_ATTRIBUTES" :key="attribute" :value="attribute">
            {{ attribute }}
          </option>
        </select>
      </label>
      <template v-else-if="rule.family === 'membership'">
        <div
          v-for="(_value, valueIndex) in rule.values"
          :key="valueIndex"
          class="policy-editor__set"
        >
          <label>
            {{ t('policies.write.setValue', { number: valueIndex + 1 }) }}
            <input
              v-model="rule.values[valueIndex]"
              :data-field-path="`rules.${index}.values.${valueIndex}`"
              required
              :disabled="busy"
              v-bind="fieldA11y(`rules.${index}.values.${valueIndex}`)"
            />
          </label>
          <button
            type="button"
            class="v1-btn"
            :disabled="busy || rule.values.length === 1"
            @click="rule.values.splice(valueIndex, 1)"
          >
            {{ t('policies.write.removeValue') }}
          </button>
        </div>
        <button
          type="button"
          class="v1-btn"
          :disabled="busy || rule.values.length >= 32"
          @click="rule.values.push('')"
        >
          {{ t('policies.write.addValue') }}
        </button>
      </template>
      <label v-else>
        {{ t('policies.detail.operandValue') }}
        <input
          v-model="rule.value"
          :data-field-path="`rules.${index}.operand`"
          required
          :disabled="busy"
          v-bind="fieldA11y(`rules.${index}.operand`)"
        />
      </label>
      <label>
        {{ t('policies.detail.effect') }}
        <select v-model="rule.effect" :disabled="busy">
          <option value="allow">allow</option>
          <option value="deny">deny</option>
        </select>
      </label>
      <label>
        {{ t('policies.detail.rowScope') }}
        <select v-model="rule.rowScope" :disabled="busy">
          <option value="">{{ t('policies.detail.none') }}</option>
          <option v-for="scope in POLICY_ROW_SCOPES" :key="scope" :value="scope">
            {{ scope }}
          </option>
        </select>
      </label>
      <div>
        <span>{{ t('policies.detail.fieldMask') }}</span>
        <div
          v-for="(_field, fieldIndex) in rule.fieldMask"
          :key="fieldIndex"
          class="policy-editor__set"
        >
          <label>
            {{ t('policies.write.fieldMaskValue', { number: fieldIndex + 1 }) }}
            <input
              v-model="rule.fieldMask[fieldIndex]"
              :data-field-path="`rules.${index}.fieldMask.${fieldIndex}`"
              required
              :disabled="busy"
              v-bind="fieldA11y(`rules.${index}.fieldMask.${fieldIndex}`)"
            />
          </label>
          <button
            type="button"
            class="v1-btn"
            :disabled="busy"
            @click="rule.fieldMask.splice(fieldIndex, 1)"
          >
            {{ t('policies.write.removeValue') }}
          </button>
        </div>
        <button type="button" class="v1-btn" :disabled="busy" @click="rule.fieldMask.push('')">
          {{ t('policies.write.addFieldMask') }}
        </button>
      </div>
      <button
        type="button"
        class="v1-btn"
        :disabled="busy || draft.rules.length === 1"
        @click="draft.rules.splice(index, 1)"
      >
        {{ t('policies.write.removeRule') }}
      </button>
    </fieldset>
    <div class="policy-editor__actions">
      <button type="button" class="v1-btn" :disabled="busy" @click="addRule">
        {{ t('policies.write.addRule') }}
      </button>
      <button type="submit" class="v1-btn" :disabled="busy">
        {{ t(`policies.write.${mode}`) }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.policy-editor,
.policy-editor__rule {
  display: grid;
  gap: 12px;
}

.policy-editor__rule {
  padding: 16px;
}

.policy-editor label {
  display: grid;
  gap: 4px;
}

.policy-editor__set,
.policy-editor__actions {
  display: flex;
  align-items: end;
  gap: 8px;
}
</style>
