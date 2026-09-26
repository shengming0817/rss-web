<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Reference } from '../clients/scopes'
defineProps<{
  label: string
  disabled?: boolean
  devices: { id: string; name: string }[]
  groups: { id: string; name: string }[]
}>()
const model = defineModel<Reference[]>({ required: true })
const { t } = useI18n(),
  prefix = useId(),
  kind = ref<'device' | 'group'>('device'),
  id = ref('')
function add() {
  if (id.value && !model.value.some((v) => v.kind === kind.value && v.id === id.value))
    model.value = [...model.value, { kind: kind.value, id: id.value }]
}
</script>
<template>
  <fieldset :disabled="disabled">
    <legend>{{ label }}</legend>
    <label :for="`${prefix}-kind`">{{ t('policies.source') }}</label
    ><select :id="`${prefix}-kind`" v-model="kind">
      <option value="device">{{ t('policies.device') }}</option>
      <option value="group">{{ t('policies.group') }}</option></select
    ><label :for="`${prefix}-id`">{{ t('policies.id') }}</label
    ><input
      :id="`${prefix}-id`"
      v-model="id"
      :list="`${prefix}-options`"
      maxlength="256"
    /><datalist :id="`${prefix}-options`">
      <option v-for="item in kind === 'device' ? devices : groups" :key="item.id" :value="item.id">
        {{ item.name }}
      </option></datalist
    ><button type="button" :disabled="!id" @click="add">{{ t('policies.add') }}</button>
    <ul>
      <li v-for="(item, index) in model" :key="`${item.kind}:${item.id}`">
        {{ t(`policies.${item.kind}`) }}: {{ item.id }}
        <button type="button" @click="model = model.filter((_, i) => i !== index)">
          {{ t('policies.remove') }}
        </button>
      </li>
    </ul>
  </fieldset>
</template>
