<script setup lang="ts">
import PolicyFieldset from './PolicyFieldset.vue'
import { VBtn, VSelect, VTextField, VTextarea, VCheckbox } from 'vuetify/components'
import { controlEvent } from '../control-event'

import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { decodeScriptSpec, type ScriptSpec } from '../clients/resources'
import { defaultApplicability, identityMapping } from '../collection-draft'
import CollectionMappings from './CollectionMappings.vue'
const root = ref<HTMLFieldSetElement>()
function valid() {
  return Array.from(root.value?.querySelectorAll('input,select,textarea') ?? []).every((node) =>
    (node as HTMLInputElement).checkValidity(),
  )
}
defineExpose({ valid })
const model = defineModel<ScriptSpec>({ required: true })
const { t } = useI18n(),
  id = useId()
const parameters = ref(''),
  output = ref(''),
  bindings = ref('')
watch(
  model,
  (v) => {
    parameters.value = JSON.stringify(v.parameters, null, 2)
    output.value = JSON.stringify(v.output, null, 2)
    bindings.value = JSON.stringify(v.bindings, null, 2)
  },
  { immediate: true },
)
function json(event: Event, key: 'parameters' | 'output' | 'bindings') {
  const input = event.target as HTMLTextAreaElement
  try {
    const value: unknown = JSON.parse(input.value)
    const next = { ...model.value, [key]: value }
    model.value = decodeScriptSpec(next)
    input.setCustomValidity('')
  } catch {
    input.setCustomValidity(t('policies.invalidJson'))
  }
}
const mapped = computed({
  get: () => (model.value.purpose.kind === 'collection' ? model.value.purpose.mappings : {}),
  set: (mappings) => {
    if (model.value.purpose.kind === 'collection')
      model.value = { ...model.value, purpose: { ...model.value.purpose, mappings } }
  },
})
function osqueryTemplate() {
  model.value = {
    profile: 'osquery',
    sql: 'SELECT version FROM osquery_info',
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
    purpose: {
      kind: 'collection',
      scope: { kind: 'device' },
      applicability: defaultApplicability(),
      mappings: { 'custom.osquery.version': identityMapping('/0/version') },
    },
    timeoutSeconds: 60,
    outputBytes: 16384,
    maxRows: 1,
  }
}
function changeProfile(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'osquery') {
    osqueryTemplate()
    return
  }
  if (value === 'power_shell7' || value === 'posix_sh' || value === 'bash')
    model.value = { ...model.value, profile: value, sql: null }
}
function collection(event: Event) {
  model.value = {
    ...model.value,
    purpose: (event.target as HTMLInputElement).checked
      ? {
          kind: 'collection',
          scope: { kind: 'device' },
          applicability: defaultApplicability(),
          mappings: {},
        }
      : { kind: 'action' },
  }
}
</script>
<template>
  <PolicyFieldset ref="root">
    <legend>{{ t('policies.scriptDefinition') }}</legend>
    <VBtn type="button" @click="osqueryTemplate">{{ t('policies.osqueryTemplate') }}</VBtn>
    <p v-if="model.profile === 'osquery'">{{ t('policies.osqueryHint') }}</p>
    <label :for="`${id}-profile`">{{ t('policies.profile') }}</label
    ><VSelect
      :id="`${id}-profile`"
      :model-value="model.profile"
      :items="[
        ...['power_shell7', 'posix_sh', 'bash', 'osquery'].map((profile) => ({
          title: String(profile),
          value: profile,
        })),
      ]"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
      @update:model-value="changeProfile(controlEvent($event))"
    /><label :for="`${id}-run-as`">{{ t('policies.runAs') }}</label
    ><VSelect
      :id="`${id}-run-as`"
      v-model="model.runAs"
      :items="[
        { title: String(t('policies.system')), value: 'system' },
        { title: String(t('policies.loggedInUser')), value: 'logged_in_user' },
      ]"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
    />
    <p>{{ t('policies.selfService.identityHint') }}</p>
    <label :for="`${id}-timeout`">{{ t('policies.timeout') }}</label
    ><VTextField
      :id="`${id}-timeout`"
      v-model.number="model.timeoutSeconds"
      type="number"
      min="1"
      max="3600"
      required
      variant="outlined"
      density="comfortable"
      hide-details="auto"
    /><label :for="`${id}-bytes`">{{ t('policies.outputBytes') }}</label
    ><VTextField
      :id="`${id}-bytes`"
      v-model.number="model.outputBytes"
      type="number"
      min="1"
      max="1048576"
      required
      variant="outlined"
      density="comfortable"
      hide-details="auto"
    /><label :for="`${id}-rows`">{{ t('policies.maxRows') }}</label
    ><VTextField
      :id="`${id}-rows`"
      v-model.number="model.maxRows"
      type="number"
      min="1"
      max="1000"
      required
      variant="outlined"
      density="comfortable"
      hide-details="auto"
    /><label :for="`${id}-parameters`">{{ t('policies.parameterSchema') }}</label
    ><VTextarea
      :id="`${id}-parameters`"
      rows="5"
      :model-value="parameters"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
      @input="json($event, 'parameters')"
    /><label :for="`${id}-output`">{{ t('policies.outputSchema') }}</label
    ><VTextarea
      :id="`${id}-output`"
      rows="5"
      :model-value="output"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
      @input="json($event, 'output')"
    /><label :for="`${id}-bindings`">{{ t('policies.bindings') }}</label
    ><VTextarea
      :id="`${id}-bindings`"
      rows="3"
      :model-value="bindings"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
      @input="json($event, 'bindings')"
    /><label
      ><VCheckbox
        :model-value="model.purpose.kind === 'collection'"
        hide-details="auto"
        @update:model-value="collection(controlEvent($event))"
      />{{ t('policies.collection') }}</label
    ><CollectionMappings
      v-if="model.purpose.kind === 'collection'"
      v-model="mapped"
      :source="model.profile === 'osquery' ? 'agent.osquery' : 'agent.script'"
    />
  </PolicyFieldset>
</template>
