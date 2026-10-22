<script setup lang="ts">
import { UiButton } from '@rss/core/components'
import { ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { decodeScriptSpec, type ScriptSpec } from '../clients/resources'
import { fieldKey } from '../../devices/clients/asset-model'
import {
  defaultApplicability,
  identityMapping,
  type ValueMapping,
} from '../clients/collection-mapping'
const root = ref<HTMLFieldSetElement>(),
  newField = ref(''),
  newPointer = ref(''),
  mappingFailure = ref(false)
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
        ? {
            ...model.value,
            purpose: {
              ...(model.value.purpose.kind === 'collection'
                ? model.value.purpose
                : { scope: { kind: 'device' }, applicability: defaultApplicability() }),
              kind: 'collection',
              mappings: value,
            },
          }
        : { ...model.value, [key]: value }
    model.value = decodeScriptSpec(next)
    input.setCustomValidity('')
  } catch {
    input.setCustomValidity(t('policies.invalidJson'))
  }
}
function changeMapping(key: string, event: Event, property: 'pointer' | 'conversion') {
  if (model.value.purpose.kind !== 'collection') return
  const input = event.target as HTMLInputElement,
    old = model.value.purpose.mappings[key]
  if (!old) return
  const next: ValueMapping = {
    ...old,
    ...(property === 'pointer'
      ? { pointer: input.value }
      : { conversion: { kind: input.value as 'identity' | 'integer' | 'number' | 'cim_time' } }),
  }
  try {
    model.value = decodeScriptSpec({
      ...model.value,
      purpose: {
        ...model.value.purpose,
        mappings: { ...model.value.purpose.mappings, [key]: next },
      },
    })
    input.setCustomValidity('')
  } catch {
    input.setCustomValidity(t('policies.invalidJson'))
  }
}
function addMapping() {
  if (model.value.purpose.kind !== 'collection') return
  try {
    const key = fieldKey(newField.value)
    if (Object.hasOwn(model.value.purpose.mappings, key)) throw new Error('Duplicate mapping')
    model.value = decodeScriptSpec({
      ...model.value,
      purpose: {
        ...model.value.purpose,
        mappings: { ...model.value.purpose.mappings, [key]: identityMapping(newPointer.value) },
      },
    })
    newField.value = ''
    newPointer.value = ''
    mappingFailure.value = false
  } catch {
    mappingFailure.value = true
  }
}
function removeMapping(key: string) {
  if (model.value.purpose.kind !== 'collection') return
  const mappings = { ...model.value.purpose.mappings }
  delete mappings[key]
  model.value = { ...model.value, purpose: { ...model.value.purpose, mappings } }
}
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
  <fieldset ref="root">
    <legend>{{ t('policies.scriptDefinition') }}</legend>
    <UiButton type="button" @click="osqueryTemplate">{{ t('policies.osqueryTemplate') }}</UiButton>
    <p v-if="model.profile === 'osquery'">{{ t('policies.osqueryHint') }}</p>
    <label :for="`${id}-profile`">{{ t('policies.profile') }}</label
    ><select :id="`${id}-profile`" class="ui-input" :value="model.profile" @change="changeProfile">
      <option
        v-for="profile in ['power_shell7', 'posix_sh', 'bash', 'osquery']"
        :key="profile"
        :value="profile"
      >
        {{ profile }}
      </option></select
    ><label :for="`${id}-run-as`">{{ t('policies.runAs') }}</label
    ><select :id="`${id}-run-as`" v-model="model.runAs" class="ui-input">
      <option value="system">{{ t('policies.system') }}</option>
      <option value="logged_in_user">{{ t('policies.loggedInUser') }}</option>
    </select>
    <p>{{ t('policies.selfService.identityHint') }}</p>
    <label :for="`${id}-timeout`">{{ t('policies.timeout') }}</label
    ><input
      :id="`${id}-timeout`"
      v-model.number="model.timeoutSeconds"
      class="ui-input"
      type="number"
      min="1"
      max="3600"
      required
    /><label :for="`${id}-bytes`">{{ t('policies.outputBytes') }}</label
    ><input
      :id="`${id}-bytes`"
      v-model.number="model.outputBytes"
      class="ui-input"
      type="number"
      min="1"
      max="1048576"
      required
    /><label :for="`${id}-rows`">{{ t('policies.maxRows') }}</label
    ><input
      :id="`${id}-rows`"
      v-model.number="model.maxRows"
      class="ui-input"
      type="number"
      min="1"
      max="1000"
      required
    /><label :for="`${id}-parameters`">{{ t('policies.parameterSchema') }}</label
    ><textarea
      :id="`${id}-parameters`"
      class="ui-input"
      :value="parameters"
      rows="5"
      @input="json($event, 'parameters')"
    /><label :for="`${id}-output`">{{ t('policies.outputSchema') }}</label
    ><textarea
      :id="`${id}-output`"
      class="ui-input"
      :value="output"
      rows="5"
      @input="json($event, 'output')"
    /><label :for="`${id}-bindings`">{{ t('policies.bindings') }}</label
    ><textarea
      :id="`${id}-bindings`"
      class="ui-input"
      :value="bindings"
      rows="3"
      @input="json($event, 'bindings')"
    /><label
      ><input
        :checked="model.purpose.kind === 'collection'"
        type="checkbox"
        @change="collection"
      />{{ t('policies.collection') }}</label
    ><template v-if="model.purpose.kind === 'collection'">
      <section v-for="(mapping, key) in model.purpose.mappings" :key="key" class="console-panel">
        <strong>{{ key }}</strong
        ><label
          >{{ t('telemetry.outputPointer')
          }}<input
            class="ui-input"
            :value="mapping.pointer"
            @input="changeMapping(key, $event, 'pointer')" /></label
        ><label
          >{{ t('telemetry.conversion')
          }}<select
            class="ui-input"
            :value="mapping.conversion.kind"
            @change="changeMapping(key, $event, 'conversion')"
          >
            <option
              v-for="kind in ['identity', 'integer', 'number', 'cim_time']"
              :key="kind"
              :value="kind"
            >
              {{ kind }}
            </option>
            <option
              v-if="
                !['identity', 'integer', 'number', 'cim_time'].includes(mapping.conversion.kind)
              "
              :value="mapping.conversion.kind"
              disabled
            >
              {{ mapping.conversion.kind }}
            </option>
          </select></label
        ><UiButton @click="removeMapping(key)">{{ t('telemetry.removeMapping') }}</UiButton>
      </section>
      <div class="console-panel">
        <label>{{ t('telemetry.field') }}<input v-model="newField" class="ui-input" /></label
        ><label
          >{{ t('telemetry.outputPointer') }}<input v-model="newPointer" class="ui-input"
        /></label>
        <p v-if="mappingFailure" role="alert">{{ t('policies.invalidJson') }}</p>
        <UiButton @click="addMapping">{{ t('telemetry.addMapping') }}</UiButton>
      </div>
      <p>{{ t('telemetry.mappingHint') }}</p>
      <label :for="`${id}-mappings`">{{ t('policies.mappings') }}</label
      ><textarea
        :id="`${id}-mappings`"
        class="ui-input"
        :value="mappings"
        rows="3"
        @input="json($event, 'mappings')"
      />
    </template>
  </fieldset>
</template>
