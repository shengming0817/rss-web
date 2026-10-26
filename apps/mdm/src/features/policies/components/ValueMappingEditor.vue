<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
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
      }}<input v-model="model.pointer" class="ui-input" pattern="(?:/(?:[^~]|~[01])*)*"
    /></label>
    <label
      >{{ t('telemetry.conversion')
      }}<select
        :value="model.conversion.kind"
        class="ui-input"
        :disabled="Object.keys(model.columns).length > 0"
        @change="conversion"
      >
        <option
          v-for="kind in [
            'identity',
            'integer',
            'number',
            'cim_time',
            'enum',
            'array_member',
            'scale',
            'bitmask',
          ]"
          :key="kind"
        >
          {{ kind }}
        </option>
      </select></label
    >
    <template v-if="model.conversion.kind === 'scale'">
      <label
        >{{ t('telemetry.mappingUi.numerator')
        }}<input
          :value="model.conversion.numerator"
          inputmode="numeric"
          class="ui-input"
          required
          @input="number($event, 'numerator')"
      /></label>
      <label
        >{{ t('telemetry.mappingUi.denominator')
        }}<input
          :value="model.conversion.denominator"
          inputmode="numeric"
          class="ui-input"
          required
          @input="number($event, 'denominator')"
      /></label>
    </template>
    <template v-if="model.conversion.kind === 'array_member'">
      <label
        >{{ t('telemetry.mappingUi.member')
        }}<input
          :value="model.conversion.member"
          class="ui-input"
          inputmode="numeric"
          required
          @input="number($event, 'member')"
      /></label>
      <label
        >{{ t('telemetry.mappingUi.present')
        }}<input v-model="model.conversion.present" class="ui-input" maxlength="128" required
      /></label>
      <label
        >{{ t('telemetry.mappingUi.absent')
        }}<input v-model="model.conversion.absent" class="ui-input" maxlength="128" required
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
          <UiButton type="button" @click="removeCode(String(key))">{{
            t('telemetry.removeMapping')
          }}</UiButton>
        </li>
      </ul>
      <label
        >{{ t('telemetry.mappingUi.code') }}<input v-model="token" class="ui-input" maxlength="256"
      /></label>
      <label v-if="model.conversion.kind === 'enum'"
        >{{ t('telemetry.valueType')
        }}<select v-model="scalar" class="ui-input">
          <option>string</option>
          <option>number</option>
          <option>boolean</option>
        </select></label
      >
      <label
        >{{ t('telemetry.mappingUi.value')
        }}<select
          v-if="scalar === 'boolean' && model.conversion.kind === 'enum'"
          v-model="literal"
          class="ui-input"
        >
          <option>true</option>
          <option>false</option></select
        ><input v-else v-model="literal" class="ui-input" maxlength="256"
      /></label>
      <UiButton type="button" @click="addCode">{{ t('telemetry.mappingUi.addCode') }}</UiButton>
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
      <UiButton type="button" @click="removeColumn(String(name))">{{
        t('telemetry.removeMapping')
      }}</UiButton>
    </template>
    <template v-if="columns.length && props.depth < 4"
      ><label
        >{{ t('telemetry.mappingUi.column')
        }}<select v-model="column" class="ui-input">
          <option value="">{{ t('devices.select') }}</option>
          <option
            v-for="c in columns.filter((c) => !model.columns[c.name])"
            :key="c.name"
            :value="c.name"
          >
            {{ c.name }}
          </option>
        </select></label
      ><UiButton type="button" :disabled="!column" @click="addColumn">{{
        t('telemetry.mappingUi.addColumn')
      }}</UiButton></template
    >
  </div>
</template>
