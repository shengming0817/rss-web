<script setup lang="ts">
import { VAlert, VBtn, VCheckbox, VForm, VSelect, VTextField } from 'vuetify/components'
import { ref, computed, watch, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { usePermission } from '../../enrollment/usePermission'
import { useSettingsAction, useSettingsFacts } from '../useSettingsAction'
import {
  type Definition,
  type DefinitionValue,
  type SourceMetadata,
  types,
  visibility,
  uses,
  sourceKey,
} from '../clients/profiles'
import { inputDigest } from '../clients/value'
import OperationNotice from './OperationNotice.vue'
const props = defineProps<{ field: Definition; sources: SourceMetadata[] }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n(),
  runtime = useMdm(),
  { canWrite, refresh } = usePermission(
    'user_attribute_definitions_read',
    'user_attribute_definitions_write',
  )
const {
  busy,
  failure,
  pending,
  locked,
  submit,
  query,
  run,
  compared,
  markCompared,
  resolveConflict,
} = useSettingsAction(() => 'user-attribute:' + props.field.fieldId)
const current = ref(props.field),
  form = ref<DefinitionValue>(
    props.field.value ?? {
      key: '',
      displayName: '',
      source: { kind: 'identity_local' },
      pointer: '/extensions/',
      valueType: 'string',
      maxLength: 2048,
      maxItems: null,
      minimum: null,
      maximum: null,
      enabled: true,
      sensitive: false,
      visibility: 'both',
      displayUse: 'profile',
      required: false,
      useExistingObservation: false,
    },
  ),
  confirmed = ref(false)
form.value = structuredClone(toRaw(form.value))
const selectedSource = computed({
  get: () => sourceKey(form.value.source),
  set: (key: string) => {
    const item = props.sources.find((v) => sourceKey(v.source) === key)
    if (item) {
      form.value.source = structuredClone(toRaw(item.source))
      form.value.useExistingObservation = false
    }
  },
})
const available = computed(() =>
  props.sources.some((v) => sourceKey(v.source) === selectedSource.value),
)
function sensitivityChanged() {
  if (form.value.sensitive) form.value.visibility = 'profiles_read'
}
function typeChanged() {
  const kind = form.value.valueType
  form.value.maxLength = kind === 'string' ? 2048 : null
  form.value.maxItems = kind === 'array' ? 128 : kind === 'object' ? 256 : null
  form.value.minimum = null
  form.value.maximum = null
  form.value.useExistingObservation = false
}
watch(failure, (v) => {
  if (v === 'denied') {
    form.value.key = ''
    form.value.displayName = ''
    form.value.pointer = ''
    void refresh()
  }
})
useSettingsFacts(() => {
  form.value.key = ''
  form.value.displayName = ''
  form.value.pointer = ''
})
async function save(remove = false, replay = false) {
  if (!canWrite.value || (!remove && form.value.enabled && !available.value)) return
  const value = remove ? null : structuredClone(toRaw(form.value))
  if (value)
    for (const key of ['maxLength', 'maxItems', 'minimum', 'maximum'] as const) {
      const raw: unknown = value[key]
      value[key] = raw === '' || raw === null ? null : Number(raw)
    }
  const revision = replay ? pending.value!.expectedRevision : current.value.revision
  const input = { fieldId: props.field.fieldId, digest: inputDigest(JSON.stringify(value)) }
  await submit(
    remove ? 'delete' : 'save',
    revision,
    input,
    (id) => runtime.settings.profiles.save(props.field.fieldId, id, revision, value),
    (v) => {
      current.value = v.definition
      emit('changed')
    },
    replay,
  )
}
async function lookup() {
  const id = pending.value?.id
  if (id)
    await query(
      id,
      () => runtime.settings.profiles.operation(id),
      (v) => {
        if (v.definition.fieldId !== props.field.fieldId) throw new Error('Wrong field')
        current.value = v.definition
        if (v.definition.value) form.value = structuredClone(toRaw(v.definition.value))
        emit('changed')
      },
    )
}
async function compare() {
  if (
    await run(
      () => runtime.settings.profiles.definition(props.field.fieldId),
      (v) => {
        current.value = v
        if (v.value) form.value = structuredClone(toRaw(v.value))
        emit('changed')
      },
    )
  )
    markCompared()
}
</script>
<template>
  <section class="settings-stack">
    <VAlert v-if="failure" type="warning" :title="t('devices.' + failure)" />
    <OperationNotice
      :operation="pending"
      :busy="busy"
      :can-write="canWrite"
      :compared="compared"
      @query="lookup"
      @compare="compare"
      @edit="resolveConflict"
      @retry="save(pending?.action === 'delete', true)"
    />
    <p v-if="!canWrite">{{ t('profiles.readOnly') }}</p>
    <p>{{ t('profiles.sourceHelp') }}</p>
    <VForm
      :disabled="locked || !canWrite"
      class="auth-form"
      @submit.prevent="($event.target as HTMLFormElement).reportValidity() &amp;&amp; (save())"
    >
      <fieldset class="profile-fields" :disabled="locked || !canWrite">
        <legend>{{ t('profiles.edit') }}</legend>
        <VTextField
          id="attribute-key"
          v-model="form.key"
          required
          maxlength="64"
          pattern="[A-Za-z][A-Za-z0-9_]*"
          :label="t('profiles.key')"
        />
        <VTextField
          id="attribute-name"
          v-model="form.displayName"
          required
          maxlength="256"
          :label="t('profiles.name')"
        />
        <VSelect
          id="attribute-source"
          v-model="selectedSource"
          required
          :items="[
            ...(!available
              ? [
                  {
                    title: t('profiles.sourceUnavailable') + ' · ' + selectedSource,
                    value: selectedSource,
                  },
                ]
              : []),
            ...sources.map((item) => ({
              title:
                item.source.kind === 'identity_local' ? t('profiles.local') : item.source.provider,
              value: sourceKey(item.source),
            })),
          ]"
          :label="t('profiles.source')"
        />
        <p v-if="!available" role="alert">{{ t('profiles.sourceUnavailable') }}</p>
        <VTextField
          id="attribute-pointer"
          v-model="form.pointer"
          maxlength="1024"
          :label="t('profiles.pointer')"
          @update:model-value="form.useExistingObservation = false"
        />
        <VSelect
          id="attribute-type"
          v-model="form.valueType"
          :items="[...types.map((kind) => ({ title: t('profiles.' + kind), value: kind }))]"
          :label="t('profiles.type')"
          @update:model-value="typeChanged"
        />
        <template v-if="form.valueType === 'string'"
          ><VTextField
            id="attribute-length"
            v-model.number="form.maxLength"
            type="number"
            min="1"
            max="65536"
            :label="t('profiles.maxLength')"
            @update:model-value="form.useExistingObservation = false"
        /></template>
        <template v-if="form.valueType === 'array' || form.valueType === 'object'"
          ><VTextField
            id="attribute-items"
            v-model.number="form.maxItems"
            type="number"
            min="1"
            :max="form.valueType === 'array' ? 128 : 256"
            :label="t('profiles.maxItems')"
            @update:model-value="form.useExistingObservation = false"
        /></template>
        <template v-if="form.valueType === 'number' || form.valueType === 'integer'"
          ><VTextField
            id="attribute-min"
            v-model.number="form.minimum"
            type="number"
            :step="form.valueType === 'integer' ? 1 : 'any'"
            :label="t('profiles.minimum')"
            @update:model-value="form.useExistingObservation = false" /><VTextField
            id="attribute-max"
            v-model.number="form.maximum"
            type="number"
            :step="form.valueType === 'integer' ? 1 : 'any'"
            :label="t('profiles.maximum')"
            @update:model-value="form.useExistingObservation = false"
        /></template>
        <VCheckbox v-model="form.enabled" :label="t('profiles.enabled')" /><VCheckbox
          v-model="form.sensitive"
          :label="t('profiles.sensitive')"
          @update:model-value="sensitivityChanged"
        />
        <p>{{ t('profiles.sensitiveHint') }}</p>
        <VSelect
          id="attribute-visibility"
          v-model="form.visibility"
          :items="visibility.map((option) => ({ title: t('profiles.' + option), value: option }))"
          :label="t('profiles.visibility')"
        />
        <VSelect
          id="attribute-use"
          v-model="form.displayUse"
          :items="[...uses.map((option) => ({ title: t('profiles.' + option), value: option }))]"
          :label="t('profiles.displayUse')"
        />
        <VCheckbox v-model="form.required" :label="t('profiles.required')" /><VCheckbox
          v-model="form.useExistingObservation"
          :label="t('profiles.reuse')"
        />
        <p>{{ t('profiles.reuseHelp') }}</p>
        <VBtn type="submit" :disabled="!available && form.enabled">{{ t('profiles.save') }}</VBtn>
        <template v-if="current.revision > 0"
          ><VCheckbox v-model="confirmed" :label="t('profiles.confirmDelete')" /><VBtn
            type="button"
            :disabled="!confirmed"
            @click="save(true)"
            >{{ t('profiles.remove') }}</VBtn
          ></template
        >
      </fieldset>
    </VForm>
  </section>
</template>

<style scoped>
.profile-fields {
  display: grid;
  gap: 0.65rem;
  border: 0;
  padding: 0;
  min-width: 0;
}
.profile-fields legend {
  margin-bottom: 0.75rem;
  font-weight: 600;
}
.profile-fields p {
  margin: 0;
}
</style>
