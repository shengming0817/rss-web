<script setup lang="ts">
import PolicyFieldset from './PolicyFieldset.vue'
import { VSelect, VBtn, VTextField } from 'vuetify/components'

import { ref, useId, watch } from 'vue'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
import { useI18n } from 'vue-i18n'
import type { Reference } from '../clients/scopes'
defineProps<{
  label: string
  disabled?: boolean
}>()
const model = defineModel<Reference[]>({ required: true })
const { t } = useI18n(),
  prefix = useId(),
  kind = ref<'device' | 'group'>('device'),
  id = ref('')
const runtime = useMdm(),
  { run, busy, failure } = useOperation([], () => [...deviceBinding(runtime), kind.value])
const page = ref<{ items: { id: string; name: string }[]; nextCursor: string | null }>()
function load(after?: string) {
  void run(
    async () => {
      if (kind.value === 'group') {
        const result = await runtime.devices.groups.list({ cursor: after })
        return {
          ...result,
          items: result.items.map((g) => ({
            id: g.id,
            name: `${g.presentation.name} · ${t('policies.revision')} ${g.revision}`,
          })),
        }
      }
      const result = await runtime.devices.directory.list({ cursor: after })
      return { ...result, items: result.items.map((d) => ({ id: d.id, name: d.id })) }
    },
    (value) => {
      page.value = value
    },
  )
}
watch(
  () => JSON.stringify([...deviceBinding(runtime), kind.value]),
  () => {
    page.value = undefined
    id.value = ''
  },
  { flush: 'sync' },
)
function add() {
  if (id.value && !model.value.some((v) => v.kind === kind.value && v.id === id.value))
    model.value = [...model.value, { kind: kind.value, id: id.value }]
}
</script>
<template>
  <PolicyFieldset :disabled="!!disabled">
    <legend>{{ label }}</legend>
    <label :for="`${prefix}-kind`">{{ t('policies.source') }}</label
    ><VSelect
      :id="`${prefix}-kind`"
      v-model="kind"
      :items="[
        { title: String(t('policies.device')), value: 'device' },
        { title: String(t('policies.group')), value: 'group' },
      ]"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
    />
    <VBtn type="button" :disabled="busy" @click="load()">{{ t('console.chooseLoaded') }}</VBtn>
    <template v-if="page">
      <label :for="`${prefix}-choice`">{{ t('devices.select') }}</label>
      <VSelect
        :id="`${prefix}-choice`"
        v-model="id"
        :disabled="busy"
        :items="[
          { title: String(t('devices.select')), value: '' },
          ...(id && !page.items.some((item) => item.id === id)
            ? [{ title: String(id), value: id }]
            : []),
          ...page.items.map((item) => ({ title: String(item.name), value: item.id })),
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
    </template>
    <details class="task-technical">
      <summary>{{ t('policies.ux.technical') }}</summary>
      <label :for="`${prefix}-id`">{{ t('policies.id') }}</label
      ><VTextField
        :id="`${prefix}-id`"
        v-model="id"
        maxlength="256"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
      />
    </details>
    <VBtn type="button" :disabled="!id || busy" @click="add">{{ t('policies.add') }}</VBtn>
    <p v-if="page">{{ t('console.pageNotTotal') }}</p>
    <VBtn v-if="page?.nextCursor" type="button" :disabled="busy" @click="load(page.nextCursor)">{{
      t('policies.next')
    }}</VBtn>
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <ul class="task-reference-list">
      <li v-for="(item, index) in model" :key="`${item.kind}:${item.id}`">
        <span>{{ page?.items.find((choice) => choice.id === item.id)?.name ?? item.id }}</span
        ><small>{{ t(`policies.${item.kind}`) }}</small>
        <VBtn type="button" @click="model = model.filter((_, i) => i !== index)">
          {{ t('policies.remove') }}
        </VBtn>
      </li>
    </ul>
  </PolicyFieldset>
</template>
