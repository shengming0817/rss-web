<script setup lang="ts">
import { VBtn, VSelect } from 'vuetify/components'

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import type { FieldDefinition } from '../../devices/clients/assets'
import type { ValueMapping, Platform } from '@rss/api/mdm-types'
import { identityMapping } from '../collection-draft'
import ValueMappingEditor from './ValueMappingEditor.vue'
const props = defineProps<{ source: string; platform?: Platform | undefined }>()
const model = defineModel<Record<string, ValueMapping>>({ required: true })
const runtime = useMdm(),
  { t } = useI18n(),
  { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const fields = ref<FieldDefinition[]>([]),
  selected = ref('')
const available = computed(() =>
  fields.value.filter(
    (f) =>
      f.sensitivity !== 'secret' &&
      Object.hasOwn(f.sources, props.source) &&
      (!props.platform || f.platforms.includes(props.platform)),
  ),
)
function load() {
  fields.value = []
  void run(
    () => runtime.devices.assets.catalog(),
    (v) => (fields.value = v.fields),
  )
}
watch(() => JSON.stringify(deviceBinding(runtime)), load, { immediate: true })
function add() {
  if (!available.value.some((f) => f.key === selected.value)) return
  model.value = { ...model.value, [selected.value]: identityMapping('') }
  selected.value = ''
}
function remove(key: string) {
  const next = { ...model.value }
  delete next[key]
  model.value = next
}
</script>
<template>
  <section data-testid="collection-mappings">
    <h3>{{ t('policies.mappings') }}</h3>
    <p>{{ t('telemetry.mappingHint') }}</p>
    <p v-if="failure" role="alert">
      {{ t('devices.' + failure) }}
      <VBtn type="button" :disabled="busy" @click="load">{{ t('devices.reload') }}</VBtn>
    </p>
    <label
      >{{ t('telemetry.field')
      }}<VSelect
        v-model="selected"
        :disabled="busy || !!failure"
        :items="[
          { title: String(t('devices.select')), value: '' },
          ...available
            .filter((f) => !model[f.key])
            .map((f) => ({
              title: String(f.key) + '· v' + String(f.version) + '·' + String(f.valueType.kind),
              value: f.key,
            })),
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
    /></label>
    <VBtn type="button" :disabled="!selected" @click="add">{{ t('telemetry.addMapping') }}</VBtn>
    <article v-for="(mapping, key) in model" :key="key" class="console-panel">
      <strong>{{ key }}</strong>
      <p v-if="fields.find((f) => f.key === key)">
        v{{ fields.find((f) => f.key === key)?.version }} ·
        {{ fields.find((f) => f.key === key)?.valueType.kind }} ·
        {{ fields.find((f) => f.key === key)?.unit ?? '—' }} ·
        {{ fields.find((f) => f.key === key)?.sensitivity }} ·
        {{ t('telemetry.mappingUi.itemKey') }}:
        {{ fields.find((f) => f.key === key)?.itemKey ?? '—' }}
      </p>
      <p v-else role="alert">{{ t('telemetry.mappingUi.unavailable') }}</p>
      <ValueMappingEditor
        :model-value="mapping"
        :value-type="fields.find((f) => f.key === key)?.valueType"
        @update:model-value="model = { ...model, [key]: $event }"
      />
      <VBtn type="button" @click="remove(key)">{{ t('telemetry.removeMapping') }}</VBtn>
    </article>
    <p v-if="!Object.keys(model).length">{{ t('telemetry.mappingUi.noMapping') }}</p>
  </section>
</template>
