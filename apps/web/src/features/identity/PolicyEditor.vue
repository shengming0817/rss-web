<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue'
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
const error = ref(false)
const errorBox = ref<HTMLElement>()

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
  error.value = false
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
  } catch {
    error.value = true
    void nextTick(() => errorBox.value?.focus())
  }
}
</script>

<template>
  <form class="policy-editor" :aria-busy="busy" @submit.prevent="submit">
    <p v-if="error" ref="errorBox" class="v1-alert" role="alert" tabindex="-1">
      {{ t('policies.write.validation') }}
    </p>
    <label v-if="mode === 'create'">
      {{ t('policies.write.policyId') }}
      <input v-model="draft.policyId" required :disabled="busy" />
    </label>
    <label>
      {{ t('policies.detail.contractId') }}
      <input v-model="draft.contractId" required :disabled="busy" />
    </label>
    <label>
      {{ t('policies.detail.permission') }}
      <input v-model="draft.permission" required :disabled="busy" />
    </label>
    <label>
      {{ t('policies.detail.effectiveFrom') }}
      <input v-model="draft.effectiveFrom" inputmode="numeric" required :disabled="busy" />
    </label>
    <label>
      {{ t('policies.detail.effectiveUntil') }}
      <input v-model="draft.effectiveUntil" inputmode="numeric" :disabled="busy" />
    </label>

    <fieldset v-for="(rule, index) in draft.rules" :key="index" class="policy-editor__rule">
      <legend>{{ t('policies.detail.rule', { number: index + 1 }) }}</legend>
      <label>
        {{ t('policies.detail.attribute') }}
        <input v-model="rule.attribute" required :disabled="busy" />
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
        <select v-model="rule.predicate" :disabled="busy">
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
        <select v-model="rule.valueType" :disabled="busy">
          <option value="string">string</option>
          <option value="boolean">boolean</option>
          <option value="integer">integer</option>
          <option value="decimal">decimal</option>
        </select>
      </label>
      <label v-if="rule.operandKind === 'attribute'">
        {{ t('policies.write.operandAttribute') }}
        <select v-model="rule.value" :disabled="busy">
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
            <input v-model="rule.values[valueIndex]" required :disabled="busy" />
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
        <input v-model="rule.value" required :disabled="busy" />
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
            <input v-model="rule.fieldMask[fieldIndex]" required :disabled="busy" />
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
