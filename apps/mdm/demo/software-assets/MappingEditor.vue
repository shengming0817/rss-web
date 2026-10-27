<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { VBtn, VSelect, VSwitch, VTextField } from 'vuetify/components'
import { sources, type Mapping, type Standard } from './model'
import { useAssetText } from './i18n'
const props = defineProps<{ initial: Mapping | null; standards: Standard[]; locked: boolean }>()
const emit = defineEmits<{ save: [value: Mapping]; cancel: [] }>()
const { t } = useAssetText()
const form = reactive<Mapping>({
  id: '',
  revision: 0,
  standardId: '',
  enabled: true,
  source: sources[0],
  platform: 'any',
  origin: null,
  identity: '',
  publisher: '',
  version: null,
})
const invalid = ref(false),
  origin = ref(''),
  version = ref('')
watch(
  () => props.initial,
  (value) => {
    Object.assign(
      form,
      value ?? {
        id: crypto.randomUUID(),
        revision: 0,
        standardId: props.standards.find((s) => !s.archived)?.id ?? '',
        enabled: true,
        source: sources[0],
        platform: 'any',
        origin: null,
        identity: '',
        publisher: '',
        version: null,
      },
    )
    origin.value = form.origin ?? ''
    version.value = form.version ?? ''
    invalid.value = false
  },
  { immediate: true },
)
function save() {
  invalid.value =
    !form.identity.trim() ||
    !form.publisher.trim() ||
    !props.standards.some((s) => s.id === form.standardId && !s.archived)
  if (!invalid.value)
    emit('save', { ...form, origin: origin.value || null, version: version.value || null })
}
</script>
<template>
  <v-card :title="initial?.revision ? t('edit') : t('addMapping')">
    <form @submit.prevent="save">
      <v-card-text class="asset-form">
        <v-alert type="info" variant="tonal">{{ t('mappingHint') }}</v-alert>
        <v-select
          v-model="form.standardId"
          :items="standards.filter((s) => !s.archived).map((s) => ({ title: s.name, value: s.id }))"
          :label="t('standard')"
          :disabled="locked"
          required
        />
        <v-select v-model="form.source" :items="sources" :label="t('source')" :disabled="locked" />
        <v-select
          v-model="form.platform"
          :items="['any', 'windows', 'macos'].map((value) => ({ title: t(value), value }))"
          :label="t('platform')"
          :disabled="locked"
        />
        <v-text-field v-model="origin" :label="t('origin')" :disabled="locked" />
        <v-text-field v-model="form.identity" :label="t('identity')" :disabled="locked" required />
        <v-text-field
          v-model="form.publisher"
          :label="t('publisher')"
          :disabled="locked"
          required
        />
        <v-text-field v-model="version" :label="t('version')" :disabled="locked" />
        <v-switch v-model="form.enabled" :label="t('enabled')" :disabled="locked" />
        <v-alert v-if="invalid" type="error" role="alert">{{ t('invalidMapping') }}</v-alert>
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
