<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PolicyOperator, PolicyView } from '@rss/identity'

defineProps<{ readonly policy: PolicyView }>()
const { t } = useI18n()

function operandValue(operator: PolicyOperator): string {
  const operand = operator.operand
  if (operand.kind === 'attribute') return operand.attribute
  if (operand.kind === 'set') return ''
  return String(operand.value)
}
</script>

<template>
  <ol class="policy-rules">
    <li v-for="(rule, index) in policy.rules" :key="index" class="policy-rule">
      <h4>{{ t('policies.detail.rule', { number: index + 1 }) }}</h4>
      <dl>
        <dt>{{ t('policies.detail.attribute') }}</dt>
        <dd>{{ rule.condition.attribute }}</dd>
        <dt>{{ t('policies.detail.family') }}</dt>
        <dd>{{ rule.condition.operator.family }}</dd>
        <dt>{{ t('policies.detail.predicate') }}</dt>
        <dd>{{ rule.condition.operator.predicate }}</dd>
        <dt>{{ t('policies.detail.operandKind') }}</dt>
        <dd>{{ rule.condition.operator.operand.kind }}</dd>
        <dt>{{ t('policies.detail.valueType') }}</dt>
        <dd>{{ rule.condition.operator.operand.valueType }}</dd>
        <dt>{{ t('policies.detail.operandValue') }}</dt>
        <dd>
          <ul v-if="rule.condition.operator.operand.kind === 'set'" class="policy-set">
            <li
              v-for="(value, valueIndex) in rule.condition.operator.operand.values"
              :key="valueIndex"
            >
              <code>{{ String(value) }}</code>
            </li>
          </ul>
          <template v-else>{{ operandValue(rule.condition.operator) }}</template>
        </dd>
        <dt>{{ t('policies.detail.effect') }}</dt>
        <dd>{{ rule.effect }}</dd>
        <template v-if="rule.obligations">
          <dt>{{ t('policies.detail.rowScope') }}</dt>
          <dd>{{ rule.obligations.rowScope ?? t('policies.detail.none') }}</dd>
          <dt>{{ t('policies.detail.fieldMask') }}</dt>
          <dd>
            <span v-if="rule.obligations.fieldMask.length === 0">{{
              t('policies.detail.none')
            }}</span>
            <ul v-else>
              <li v-for="field in rule.obligations.fieldMask" :key="field">{{ field }}</li>
            </ul>
          </dd>
        </template>
      </dl>
    </li>
  </ol>
</template>

<style scoped>
.policy-rules {
  display: grid;
  gap: 16px;
  padding-inline-start: 24px;
}

.policy-rule {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}

dl {
  display: grid;
  grid-template-columns: minmax(130px, auto) 1fr;
  gap: 6px 16px;
}

dt {
  color: var(--fg-muted);
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.policy-set {
  margin: 0;
  padding-inline-start: 20px;
}
</style>
