<script setup lang="ts">
import { VSelect, VTextField, VCheckbox, VBtn } from 'vuetify/components'
import { controlEvent } from '../../policies/control-event'

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FieldDefinition } from '@rss/api/mdm-types'
const props = withDefaults(defineProps<{ depth?: number }>(), { depth: 0 })
const model = defineModel<FieldDefinition['valueType']>({ required: true })
const { t } = useI18n(),
  name = ref(''),
  member = ref('')
const propertyNames = computed(() =>
  model.value.kind === 'record' || model.value.kind === 'object'
    ? Object.keys(model.value.properties)
    : [],
)
function kind(event: Event) {
  const kind = (event.target as HTMLSelectElement).value
  if (kind === 'string') model.value = { kind, maxLength: 256, allowEmpty: false }
  else if (kind === 'enum') model.value = { kind, values: [] }
  else if (kind === 'array')
    model.value = {
      kind,
      maxItems: 1000,
      items: {
        kind: 'record',
        properties: {
          id: { required: true, valueType: { kind: 'string', maxLength: 256, allowEmpty: false } },
        },
      },
    }
  else if (kind === 'record') model.value = { kind, properties: {} }
  else if (kind === 'boolean' || kind === 'time' || kind === 'integer' || kind === 'number')
    model.value = { kind }
}
function addMember() {
  if (model.value.kind !== 'enum' || !member.value || model.value.values.includes(member.value))
    return
  model.value = { ...model.value, values: [...model.value.values, member.value] }
  member.value = ''
}
function addProperty() {
  if (
    model.value.kind !== 'record' ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(name.value) ||
    Object.hasOwn(model.value.properties, name.value)
  )
    return
  model.value = {
    ...model.value,
    properties: {
      ...model.value.properties,
      [name.value]: {
        required: true,
        valueType: { kind: 'string', maxLength: 256, allowEmpty: false },
      },
    },
  }
  name.value = ''
}
function removeProperty(key: string) {
  if (model.value.kind !== 'record' && model.value.kind !== 'object') return
  const properties = { ...model.value.properties }
  delete properties[key]
  model.value = { ...model.value, properties } as FieldDefinition['valueType']
}
</script>
<template>
  <section class="console-panel" data-testid="field-type">
    <label
      >{{ t('telemetry.valueType')
      }}<VSelect
        :model-value="model.kind"
        :items="[
          ...[
            'string',
            'integer',
            'number',
            'boolean',
            'time',
            'enum',
            ...(props.depth < 4 ? ['array', 'record'] : []),
          ].map((optionKind) => ({ title: String(optionKind), value: String(optionKind) })),
          ...(model.kind === 'object' ? [{ title: 'object', value: 'object' }] : []),
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
        @update:model-value="kind(controlEvent($event))"
    /></label>
    <template v-if="model.kind === 'string'"
      ><label
        >{{ t('telemetry.fieldUi.maxLength')
        }}<VTextField
          v-model.number="model.maxLength"
          type="number"
          min="1"
          max="65536"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><label
        ><VCheckbox v-model="model.allowEmpty" hide-details="auto" />{{
          t('telemetry.fieldUi.allowEmpty')
        }}</label
      ></template
    >
    <template v-if="model.kind === 'enum'"
      ><ul>
        <li v-for="(value, index) in model.values" :key="value">
          {{ value }}
          <VBtn type="button" @click="model.values.splice(index, 1)">{{
            t('telemetry.removeMapping')
          }}</VBtn>
        </li>
      </ul>
      <label
        >{{ t('telemetry.stateMembers')
        }}<VTextField
          v-model="member"
          maxlength="256"
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><VBtn
        type="button"
        :disabled="!member || model.values.includes(member)"
        @click="addMember"
        >{{ t('telemetry.mappingUi.addCode') }}</VBtn
      ></template
    >
    <template v-if="model.kind === 'array'"
      ><label
        >{{ t('telemetry.fieldUi.maxItems')
        }}<VTextField
          v-model.number="model.maxItems"
          type="number"
          min="1"
          max="1000"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><FieldTypeEditor v-model="model.items" :depth="props.depth + 1"
    /></template>
    <template v-if="model.kind === 'record'"
      ><article v-for="key in propertyNames" :key="key">
        <h4>{{ key }}</h4>
        <label
          ><VCheckbox v-model="model.properties[key]!.required" hide-details="auto" />{{
            t('telemetry.fieldUi.required')
          }}</label
        ><FieldTypeEditor
          v-model="model.properties[key]!.valueType"
          :depth="props.depth + 1"
        /><VBtn type="button" @click="removeProperty(key)">{{ t('telemetry.removeMapping') }}</VBtn>
      </article>
      <label
        >{{ t('telemetry.mappingUi.column')
        }}<VTextField
          v-model="name"
          maxlength="64"
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><VBtn type="button" :disabled="!name || props.depth >= 4" @click="addProperty">{{
        t('telemetry.fieldUi.addProperty')
      }}</VBtn></template
    >
    <template v-if="model.kind === 'object'"
      ><article v-for="key in propertyNames" :key="key">
        <h4>{{ key }}</h4>
        <FieldTypeEditor v-model="model.properties[key]!" :depth="props.depth + 1" /></article
    ></template>
  </section>
</template>
