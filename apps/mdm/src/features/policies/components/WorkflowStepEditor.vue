<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FieldDefinition } from '../../devices/clients/asset-model'
import type { WorkflowStep, WorkflowAction } from '../clients/workflows'
import { jsonValue } from '../clients/resources'
import CriteriaEditor from '../../devices/components/CriteriaEditor.vue'
defineProps<{ fields: FieldDefinition[] }>()
const model = defineModel<WorkflowStep>({ required: true })
const { t } = useI18n(),
  id = useId()
const kinds = ['approval', 'configuration', 'script', 'query', 'repair'] as const
function kind(event: Event) {
  const kind = (event.target as HTMLSelectElement).value as WorkflowAction['kind']
  model.value.action =
    kind === 'approval'
      ? { kind }
      : kind === 'configuration'
        ? { kind, configuration: '', version: 1 }
        : kind === 'query'
          ? { kind, sql: 'SELECT version FROM osquery_info;', mappings: [] }
          : { kind, resource: '', version: '1', variant: 'main', parameters: {} }
}
function parameters(event: Event) {
  const input = event.target as HTMLTextAreaElement
  try {
    if (model.value.action.kind === 'script' || model.value.action.kind === 'repair')
      model.value.action.parameters = jsonValue(JSON.parse(input.value), 8192)
    input.setCustomValidity('')
  } catch {
    input.setCustomValidity(t('policies.invalidJson'))
  }
}
</script>
<template>
  <fieldset>
    <legend>{{ t('policies.step') }}</legend>
    <label :for="`${id}-name`">{{ t('policies.name') }}</label
    ><input :id="`${id}-name`" v-model="model.name" required /><label :for="`${id}-kind`">{{
      t('policies.kind')
    }}</label
    ><select :id="`${id}-kind`" :value="model.action.kind" @change="kind">
      <option v-for="option in kinds" :key="option" :value="option">
        {{ t(`policies.stepKind.${option}`) }}
      </option></select
    ><template v-if="model.action.kind === 'configuration'"
      ><label :for="`${id}-configuration`">{{ t('policies.configurations') }}</label
      ><input :id="`${id}-configuration`" v-model="model.action.configuration" required /><label
        :for="`${id}-version`"
        >{{ t('policies.version') }}</label
      ><input
        :id="`${id}-version`"
        v-model.number="model.action.version"
        type="number"
        min="1"
        required /></template
    ><template v-else-if="model.action.kind === 'script' || model.action.kind === 'repair'"
      ><label :for="`${id}-resource`">{{ t('policies.resources') }}</label
      ><input :id="`${id}-resource`" v-model="model.action.resource" required /><label
        :for="`${id}-version`"
        >{{ t('policies.version') }}</label
      ><input :id="`${id}-version`" v-model="model.action.version" required /><label
        :for="`${id}-variant`"
        >{{ t('policies.variant') }}</label
      ><input :id="`${id}-variant`" v-model="model.action.variant" required /><label
        :for="`${id}-parameters`"
        >{{ t('policies.parameters') }}</label
      ><textarea
        :id="`${id}-parameters`"
        :value="JSON.stringify(model.action.parameters, null, 2)"
        rows="4"
        @input="parameters"
      /></template
    ><template v-else-if="model.action.kind === 'query'"
      ><label :for="`${id}-sql`">SQL</label
      ><textarea :id="`${id}-sql`" v-model="model.action.sql" required rows="4" />
      <div v-for="(mapping, index) in model.action.mappings" :key="index">
        <label :for="`${id}-field-${index}`">{{ t('policies.field') }}</label
        ><select :id="`${id}-field-${index}`" v-model="mapping.field">
          <option v-for="field in fields" :key="field.key" :value="field.key">
            {{ field.key }}
          </option></select
        ><label :for="`${id}-pointer-${index}`">JSON Pointer</label
        ><input :id="`${id}-pointer-${index}`" v-model="mapping.pointer" required /><button
          type="button"
          @click="model.action.mappings.splice(index, 1)"
        >
          {{ t('policies.remove') }}
        </button>
      </div>
      <button
        type="button"
        :disabled="!fields.length"
        @click="model.action.mappings.push({ field: fields[0]!.key, pointer: '/0/value' })"
      >
        {{ t('policies.addMapping') }}
      </button></template
    >
    <h3>{{ t('policies.condition') }}</h3>
    <CriteriaEditor v-model="model.condition" :fields="fields" /><label :for="`${id}-failure`">{{
      t('policies.onFailure')
    }}</label
    ><select :id="`${id}-failure`" v-model="model.onFailure">
      <option value="stop">{{ t('policies.stop') }}</option>
      <option value="continue">{{ t('policies.continue') }}</option>
      <option value="approval">{{ t('policies.approve') }}</option>
    </select>
  </fieldset>
</template>
