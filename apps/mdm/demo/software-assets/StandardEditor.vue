<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { VBtn, VCombobox, VSelect, VSwitch, VTextField } from 'vuetify/components'
import { risks, type Group, type Standard } from './model'
import { useAssetText } from './i18n'
const props = defineProps<{ initial: Standard | null; groups: Group[]; locked: boolean }>()
const emit = defineEmits<{ save: [value: Standard]; cancel: [] }>()
const { t } = useAssetText()
const form = reactive<Standard>({
  id: '',
  revision: 0,
  name: '',
  risk: null,
  marks: [],
  threshold: null,
  allowedGroups: null,
  archived: false,
})
const thresholdOn = ref(false),
  allowOn = ref(false),
  threshold = ref<number | string>(2),
  selectedGroups = ref<string[]>([]),
  invalid = ref(false)
const risk = computed({
  get: () => form.risk ?? 'unclassified',
  set: (v: string) => {
    form.risk = v === 'unclassified' ? null : (risks.find((r) => r === v) ?? null)
  },
})
watch(
  () => props.initial,
  (value) => {
    Object.assign(
      form,
      value
        ? {
            ...value,
            marks: [...value.marks],
            allowedGroups: value.allowedGroups ? [...value.allowedGroups] : null,
          }
        : {
            id: crypto.randomUUID(),
            revision: 0,
            name: '',
            risk: null,
            marks: [],
            threshold: null,
            allowedGroups: null,
            archived: false,
          },
    )
    thresholdOn.value = form.threshold !== null
    threshold.value = form.threshold ?? 2
    allowOn.value = form.allowedGroups !== null
    selectedGroups.value = [...(form.allowedGroups ?? [])]
    invalid.value = false
  },
  { immediate: true },
)
function save() {
  invalid.value =
    !form.name.trim() ||
    (thresholdOn.value &&
      (!Number.isSafeInteger(Number(threshold.value)) || Number(threshold.value) < 1)) ||
    (allowOn.value && selectedGroups.value.length === 0)
  if (invalid.value) return
  emit('save', {
    ...form,
    marks: [...new Set(form.marks)],
    threshold: thresholdOn.value ? Number(threshold.value) : null,
    allowedGroups: allowOn.value ? [...selectedGroups.value] : null,
  })
}
</script>
<template>
  <v-card :title="initial ? t('edit') : t('addStandard')">
    <form @submit.prevent="save">
      <v-card-text class="asset-form">
        <v-alert type="info" variant="tonal">{{ t('fixedScope') }}</v-alert>
        <v-text-field
          v-model="form.name"
          :label="t('name')"
          :disabled="locked"
          required
          maxlength="256"
        />
        <v-select
          v-model="risk"
          :label="t('risk')"
          :items="['unclassified', ...risks].map((value) => ({ value, title: t(value) }))"
          :disabled="locked"
        />
        <v-combobox
          v-model="form.marks"
          :label="t('marks')"
          multiple
          chips
          closable-chips
          :disabled="locked"
        />
        <v-switch v-model="thresholdOn" :label="t('thresholdOn')" :disabled="locked" hide-details />
        <v-text-field
          v-if="thresholdOn"
          v-model="threshold"
          type="number"
          min="1"
          step="1"
          :label="t('threshold')"
          :disabled="locked"
          required
        />
        <v-switch v-model="allowOn" :label="t('allowOn')" :disabled="locked" hide-details />
        <template v-if="allowOn">
          <v-select
            v-model="selectedGroups"
            :items="groups.map((g) => ({ title: g.name, value: g.id }))"
            multiple
            chips
            closable-chips
            :label="t('allowGroups')"
            :disabled="locked"
          />
          <p>{{ t('syntheticGroups') }}</p>
          <p>{{ t('allowHint') }}</p>
        </template>
        <v-alert v-if="invalid" role="alert" type="error">{{ t('invalid') }}</v-alert>
      </v-card-text>
      <v-card-actions
        ><v-spacer /><v-btn :disabled="locked" @click="emit('cancel')">{{ t('cancel') }}</v-btn
        ><v-btn type="submit" color="primary" :disabled="locked">{{
          t('save')
        }}</v-btn></v-card-actions
      >
    </form>
  </v-card>
</template>
