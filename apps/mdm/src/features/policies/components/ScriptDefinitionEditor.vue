<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { decodeScriptSpec, type ScriptSpec } from '../clients/resources'
const model = defineModel<ScriptSpec>({ required: true })
const { t } = useI18n(),
  id = useId()
const parameters = ref(''),
  output = ref(''),
  bindings = ref(''),
  mappings = ref('')
watch(
  model,
  (v) => {
    parameters.value = JSON.stringify(v.parameters, null, 2)
    output.value = JSON.stringify(v.output, null, 2)
    bindings.value = JSON.stringify(v.bindings, null, 2)
    mappings.value = JSON.stringify(
      v.purpose.kind === 'collection' ? v.purpose.mappings : {},
      null,
      2,
    )
  },
  { immediate: true },
)
function json(event: Event, key: 'parameters' | 'output' | 'bindings' | 'mappings') {
  const input = event.target as HTMLTextAreaElement
  try {
    const value: unknown = JSON.parse(input.value)
    const next =
      key === 'mappings'
        ? { ...model.value, purpose: { kind: 'collection', mappings: value } }
        : { ...model.value, [key]: value }
    model.value = decodeScriptSpec(next)
    input.setCustomValidity('')
  } catch {
    input.setCustomValidity(t('policies.invalidJson'))
  }
}
function osqueryTemplate() {
  model.value = {
    profile: 'osquery_info_v1',
    runAs: 'system',
    encoding: 'utf8',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    bindings: {},
    output: {
      type: 'array',
      maxItems: 1,
      items: {
        type: 'object',
        properties: { version: { type: 'string' } },
        required: ['version'],
        additionalProperties: false,
      },
    },
    purpose: { kind: 'collection', mappings: { 'custom.osquery.version': '/0/version' } },
    timeoutSeconds: 60,
    outputBytes: 16384,
    maxRows: 1,
  }
}
function collection(event: Event) {
  model.value = {
    ...model.value,
    purpose: (event.target as HTMLInputElement).checked
      ? { kind: 'collection', mappings: {} }
      : { kind: 'action' },
  }
}
</script>
<template>
  <fieldset>
    <legend>{{ t('policies.scriptDefinition') }}</legend>
    <button type="button" @click="osqueryTemplate">{{ t('policies.osqueryTemplate') }}</button>
    <p v-if="model.profile === 'osquery_info_v1'">{{ t('policies.osqueryHint') }}</p>
    <label :for="`${id}-profile`">{{ t('policies.profile') }}</label
    ><select :id="`${id}-profile`" v-model="model.profile">
      <option
        v-for="profile in ['power_shell7', 'posix_sh', 'bash', 'osquery_info_v1']"
        :key="profile"
        :value="profile"
      >
        {{ profile }}
      </option></select
    ><label :for="`${id}-run-as`">{{ t('policies.runAs') }}</label
    ><select :id="`${id}-run-as`" v-model="model.runAs">
      <option value="system">{{ t('policies.system') }}</option>
      <option value="logged_in_user">{{ t('policies.loggedInUser') }}</option></select
    ><label :for="`${id}-timeout`">{{ t('policies.timeout') }}</label
    ><input
      :id="`${id}-timeout`"
      v-model.number="model.timeoutSeconds"
      type="number"
      min="1"
      max="3600"
      required
    /><label :for="`${id}-bytes`">{{ t('policies.outputBytes') }}</label
    ><input
      :id="`${id}-bytes`"
      v-model.number="model.outputBytes"
      type="number"
      min="1"
      max="1048576"
      required
    /><label :for="`${id}-rows`">{{ t('policies.maxRows') }}</label
    ><input
      :id="`${id}-rows`"
      v-model.number="model.maxRows"
      type="number"
      min="1"
      max="1000"
      required
    /><label :for="`${id}-parameters`">{{ t('policies.parameterSchema') }}</label
    ><textarea
      :id="`${id}-parameters`"
      :value="parameters"
      rows="5"
      @input="json($event, 'parameters')"
    /><label :for="`${id}-output`">{{ t('policies.outputSchema') }}</label
    ><textarea
      :id="`${id}-output`"
      :value="output"
      rows="5"
      @input="json($event, 'output')"
    /><label :for="`${id}-bindings`">{{ t('policies.bindings') }}</label
    ><textarea
      :id="`${id}-bindings`"
      :value="bindings"
      rows="3"
      @input="json($event, 'bindings')"
    /><label
      ><input
        :checked="model.purpose.kind === 'collection'"
        type="checkbox"
        @change="collection"
      />{{ t('policies.collection') }}</label
    ><template v-if="model.purpose.kind === 'collection'"
      ><label :for="`${id}-mappings`">{{ t('policies.mappings') }}</label
      ><textarea
        :id="`${id}-mappings`"
        :value="mappings"
        rows="3"
        @input="json($event, 'mappings')"
      />
    </template>
  </fieldset>
</template>
