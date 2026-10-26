<script setup lang="ts">
import { VTextField, VSelect, VBtn } from 'vuetify/components'
import { controlEvent } from '../control-event'

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ValueMapping } from '../../../contracts/collection/generated/ResourceWrite'
import type { FieldView } from '../../../contracts/collection/generated/FieldView'
import { identityMapping } from '../collection-draft'
const props = withDefaults(
  defineProps<{ valueType?: FieldView['valueType'] | undefined; depth?: number }>(),
  { depth: 0 },
)
const model = defineModel<ValueMapping>({ required: true })
const { t } = useI18n()
const token = ref(''),
  literal = ref(''),
  scalar = ref('string'),
  failure = ref(false),
  column = ref('')
const itemType = computed(() =>
  props.valueType?.kind === 'array' ? props.valueType.items : props.valueType,
)
const columns = computed(() => {
  const type = itemType.value
  if (type?.kind !== 'record' && type?.kind !== 'object') return []
  return Object.entries(type.properties).map(([name, value]) => ({
    name,
    type: 'valueType' in value ? value.valueType : value,
  }))
})
function conversion(event: Event) {
  const kind = (event.target as HTMLSelectElement).value as ValueMapping['conversion']['kind']
  const value: ValueMapping['conversion'] =
    kind === 'enum'
      ? { kind, values: {} }
      : kind === 'scale'
        ? { kind, numerator: 1, denominator: 1 }
        : kind === 'array_member'
          ? { kind, member: 0, present: 'yes', absent: 'no' }
          : kind === 'bitmask'
            ? { kind, flags: {} }
            : { kind }
  model.value = { ...model.value, conversion: value }
}
function number(event: Event, key: 'numerator' | 'denominator' | 'member') {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  const valid =
    /^\d+$/.test(input.value) &&
    Number.isSafeInteger(value) &&
    (key === 'member' ? value >= 0 : value > 0)
  input.setCustomValidity(valid ? '' : t('telemetry.mappingUi.precision'))
  if (valid)
    model.value = { ...model.value, conversion: { ...model.value.conversion, [key]: value } }
}
function addCode() {
  failure.value = false
  try {
    const c = model.value.conversion
    if (c.kind === 'enum') {
      if (scalar.value === 'boolean' && !['true', 'false'].includes(literal.value))
        throw new Error('Choose a boolean literal')
      const value =
        scalar.value === 'number'
          ? Number(literal.value)
          : scalar.value === 'boolean'
            ? literal.value === 'true'
            : literal.value
      if (
        scalar.value === 'number' &&
        (!literal.value.trim() ||
          !Number.isFinite(value) ||
          (Number.isInteger(value) && !Number.isSafeInteger(value)))
      )
        throw new Error('Unsafe number')
      model.value = {
        ...model.value,
        conversion: { ...c, values: { ...c.values, [token.value]: value } },
      }
    } else if (c.kind === 'bitmask') {
      if (!/^[1-9]\d*$/.test(token.value)) throw new Error('Invalid flag')
      const bit = BigInt(token.value)
      if (
        (bit & (bit - 1n)) !== 0n ||
        bit > 9223372036854775807n ||
        !literal.value ||
        Object.values(c.flags).includes(literal.value)
      )
        throw new Error('Invalid flag')
      model.value = {
        ...model.value,
        conversion: { ...c, flags: { ...c.flags, [token.value]: literal.value } },
      }
    }
    token.value = ''
    literal.value = ''
  } catch {
    failure.value = true
  }
}
function removeCode(key: string) {
  const c = model.value.conversion
  if (c.kind === 'enum') {
    const values = { ...c.values }
    delete values[key]
    model.value = { ...model.value, conversion: { ...c, values } }
  }
  if (c.kind === 'bitmask') {
    const flags = { ...c.flags }
    delete flags[key]
    model.value = { ...model.value, conversion: { ...c, flags } }
  }
}
function addColumn() {
  if (!columns.value.some((v) => v.name === column.value)) return
  model.value = {
    ...model.value,
    conversion: { kind: 'identity' },
    columns: {
      ...model.value.columns,
      [column.value]: identityMapping('/' + column.value.replace(/~/g, '~0').replace(/\//g, '~1')),
    },
  }
}
function removeColumn(name: string) {
  const columns = { ...model.value.columns }
  delete columns[name]
  model.value = { ...model.value, columns }
}
</script>
<template>
  <div class="console-panel" data-testid="value-mapping">
    <label
      >{{ t('telemetry.outputPointer')
      }}<VTextField
        v-model="model.pointer"
        pattern="(?:/(?:[^~]|~[01])*)*"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
    /></label>
    <label
      >{{ t('telemetry.conversion')
      }}<VSelect
        :disabled="Object.keys(model.columns).length > 0"
        :model-value="model.conversion.kind"
        :items="[
          ...[
            'identity',
            'integer',
            'number',
            'cim_time',
            'enum',
            'array_member',
            'scale',
            'bitmask',
          ].map((kind) => ({ title: String(kind), value: String(kind) })),
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
        @update:model-value="conversion(controlEvent($event))"
    /></label>
    <template v-if="model.conversion.kind === 'scale'">
      <label
        >{{ t('telemetry.mappingUi.numerator')
        }}<VTextField
          inputmode="numeric"
          required
          :model-value="model.conversion.numerator"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @input="number($event, 'numerator')"
      /></label>
      <label
        >{{ t('telemetry.mappingUi.denominator')
        }}<VTextField
          inputmode="numeric"
          required
          :model-value="model.conversion.denominator"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @input="number($event, 'denominator')"
      /></label>
    </template>
    <template v-if="model.conversion.kind === 'array_member'">
      <label
        >{{ t('telemetry.mappingUi.member')
        }}<VTextField
          inputmode="numeric"
          required
          :model-value="model.conversion.member"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
          @input="number($event, 'member')"
      /></label>
      <label
        >{{ t('telemetry.mappingUi.present')
        }}<VTextField
          v-model="model.conversion.present"
          maxlength="128"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
      <label
        >{{ t('telemetry.mappingUi.absent')
        }}<VTextField
          v-model="model.conversion.absent"
          maxlength="128"
          required
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
    </template>
    <template v-if="model.conversion.kind === 'enum' || model.conversion.kind === 'bitmask'">
      <ul>
        <li
          v-for="(value, key) in model.conversion.kind === 'enum'
            ? model.conversion.values
            : model.conversion.flags"
          :key="key"
        >
          {{ key }} → {{ value }}
          <VBtn type="button" @click="removeCode(String(key))">{{
            t('telemetry.removeMapping')
          }}</VBtn>
        </li>
      </ul>
      <label
        >{{ t('telemetry.mappingUi.code')
        }}<VTextField
          v-model="token"
          maxlength="256"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
      <label v-if="model.conversion.kind === 'enum'"
        >{{ t('telemetry.valueType')
        }}<VSelect
          v-model="scalar"
          :items="[
            { title: 'string', value: 'string' },
            { title: 'number', value: 'number' },
            { title: 'boolean', value: 'boolean' },
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
      <label
        >{{ t('telemetry.mappingUi.value')
        }}<VSelect
          v-if="scalar === 'boolean' && model.conversion.kind === 'enum'"
          v-model="literal"
          :items="[
            { title: 'true', value: 'true' },
            { title: 'false', value: 'false' },
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto" /><VTextField
          v-else
          v-model="literal"
          maxlength="256"
          variant="outlined"
          density="comfortable"
          hide-details="auto"
      /></label>
      <VBtn type="button" @click="addCode">{{ t('telemetry.mappingUi.addCode') }}</VBtn>
      <p v-if="failure" role="alert">{{ t('telemetry.mappingUi.precision') }}</p>
    </template>
    <template v-for="(value, name) in model.columns" :key="name">
      <h4>{{ name }}</h4>
      <ValueMappingEditor
        :model-value="value"
        :value-type="columns.find((c) => c.name === name)?.type"
        :depth="props.depth + 1"
        @update:model-value="model = { ...model, columns: { ...model.columns, [name]: $event } }"
      />
      <VBtn type="button" @click="removeColumn(String(name))">{{
        t('telemetry.removeMapping')
      }}</VBtn>
    </template>
    <template v-if="columns.length && props.depth < 4"
      ><label
        >{{ t('telemetry.mappingUi.column')
        }}<VSelect
          v-model="column"
          :items="[
            { title: String(t('devices.select')), value: '' },
            ...columns
              .filter((c) => !model.columns[c.name])
              .map((c) => ({ title: String(c.name), value: c.name })),
          ]"
          variant="outlined"
          density="comfortable"
          hide-details="auto" /></label
      ><VBtn type="button" :disabled="!column" @click="addColumn">{{
        t('telemetry.mappingUi.addColumn')
      }}</VBtn></template
    >
  </div>
</template>
