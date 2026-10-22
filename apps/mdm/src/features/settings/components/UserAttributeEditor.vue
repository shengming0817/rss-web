<script setup lang="ts">
import { ref, computed, watch, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { UiButton, UiMessage } from '@rss/core/components'
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
    <UiMessage v-if="failure" tone="warning" :title="t('devices.' + failure)" />
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
    <form class="auth-form" @submit.prevent="save()">
      <fieldset class="profile-fields" :disabled="locked || !canWrite">
        <legend>{{ t('profiles.edit') }}</legend>
        <label for="attribute-key">{{ t('profiles.key') }}</label
        ><input
          id="attribute-key"
          v-model="form.key"
          class="ui-input"
          required
          maxlength="64"
          pattern="[A-Za-z][A-Za-z0-9_]*"
        />
        <label for="attribute-name">{{ t('profiles.name') }}</label
        ><input
          id="attribute-name"
          v-model="form.displayName"
          class="ui-input"
          required
          maxlength="256"
        />
        <label for="attribute-source">{{ t('profiles.source') }}</label
        ><select id="attribute-source" v-model="selectedSource" class="ui-input" required>
          <option v-if="!available" :value="selectedSource">
            {{ t('profiles.sourceUnavailable') }} · {{ selectedSource }}
          </option>
          <option
            v-for="item in sources"
            :key="sourceKey(item.source)"
            :value="sourceKey(item.source)"
          >
            {{ item.source.kind === 'identity_local' ? t('profiles.local') : item.source.provider }}
          </option>
        </select>
        <p v-if="!available" role="alert">{{ t('profiles.sourceUnavailable') }}</p>
        <label for="attribute-pointer">{{ t('profiles.pointer') }}</label
        ><input
          id="attribute-pointer"
          v-model="form.pointer"
          class="ui-input"
          maxlength="1024"
          @input="form.useExistingObservation = false"
        />
        <label for="attribute-type">{{ t('profiles.type') }}</label
        ><select
          id="attribute-type"
          v-model="form.valueType"
          class="ui-input"
          @change="typeChanged"
        >
          <option v-for="kind in types" :key="kind" :value="kind">
            {{ t('profiles.' + kind) }}
          </option>
        </select>
        <template v-if="form.valueType === 'string'"
          ><label for="attribute-length">{{ t('profiles.maxLength') }}</label
          ><input
            id="attribute-length"
            v-model.number="form.maxLength"
            class="ui-input"
            type="number"
            min="1"
            max="65536"
            @input="form.useExistingObservation = false"
        /></template>
        <template v-if="form.valueType === 'array' || form.valueType === 'object'"
          ><label for="attribute-items">{{ t('profiles.maxItems') }}</label
          ><input
            id="attribute-items"
            v-model.number="form.maxItems"
            class="ui-input"
            type="number"
            min="1"
            :max="form.valueType === 'array' ? 128 : 256"
            @input="form.useExistingObservation = false"
        /></template>
        <template v-if="form.valueType === 'number' || form.valueType === 'integer'"
          ><label for="attribute-min">{{ t('profiles.minimum') }}</label
          ><input
            id="attribute-min"
            v-model.number="form.minimum"
            class="ui-input"
            type="number"
            :step="form.valueType === 'integer' ? 1 : 'any'"
            @input="form.useExistingObservation = false" /><label for="attribute-max">{{
            t('profiles.maximum')
          }}</label
          ><input
            id="attribute-max"
            v-model.number="form.maximum"
            class="ui-input"
            type="number"
            :step="form.valueType === 'integer' ? 1 : 'any'"
            @input="form.useExistingObservation = false"
        /></template>
        <label><input v-model="form.enabled" type="checkbox" />{{ t('profiles.enabled') }}</label
        ><label
          ><input v-model="form.sensitive" type="checkbox" @change="sensitivityChanged" />{{
            t('profiles.sensitive')
          }}</label
        >
        <p>{{ t('profiles.sensitiveHint') }}</p>
        <label for="attribute-visibility">{{ t('profiles.visibility') }}</label
        ><select id="attribute-visibility" v-model="form.visibility" class="ui-input">
          <option v-for="option in visibility" :key="option" :value="option">
            {{ t('profiles.' + option) }}
          </option>
        </select>
        <label for="attribute-use">{{ t('profiles.displayUse') }}</label
        ><select id="attribute-use" v-model="form.displayUse" class="ui-input">
          <option v-for="option in uses" :key="option" :value="option">
            {{ t('profiles.' + option) }}
          </option>
        </select>
        <label><input v-model="form.required" type="checkbox" />{{ t('profiles.required') }}</label
        ><label
          ><input v-model="form.useExistingObservation" type="checkbox" />{{
            t('profiles.reuse')
          }}</label
        >
        <p>{{ t('profiles.reuseHelp') }}</p>
        <UiButton type="submit" :disabled="!available && form.enabled">{{
          t('profiles.save')
        }}</UiButton>
        <template v-if="current.revision > 0"
          ><label
            ><input v-model="confirmed" type="checkbox" />{{ t('profiles.confirmDelete') }}</label
          ><UiButton type="button" :disabled="!confirmed" @click="save(true)">{{
            t('profiles.remove')
          }}</UiButton></template
        >
      </fieldset>
    </form>
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
