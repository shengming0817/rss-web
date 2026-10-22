<script setup lang="ts">
import { UiButton } from '@rss/core/components'
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
        const result = await runtime.devices.groups.list({ after })
        return {
          ...result,
          items: result.items.map((g) => ({
            id: g.id,
            name: `${g.presentation.name} · ${t('policies.revision')} ${g.revision}`,
          })),
        }
      }
      const result = await runtime.devices.directory.list(after)
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
  <fieldset :disabled="disabled">
    <legend>{{ label }}</legend>
    <label :for="`${prefix}-kind`">{{ t('policies.source') }}</label
    ><select :id="`${prefix}-kind`" v-model="kind" class="ui-input">
      <option value="device">{{ t('policies.device') }}</option>
      <option value="group">{{ t('policies.group') }}</option></select
    ><label :for="`${prefix}-id`">{{ t('policies.id') }}</label
    ><input
      :id="`${prefix}-id`"
      v-model="id"
      class="ui-input"
      :list="`${prefix}-options`"
      maxlength="256"
    /><datalist :id="`${prefix}-options`">
      <option v-for="item in page?.items ?? []" :key="item.id" :value="item.id">
        {{ item.name }}
      </option></datalist
    ><UiButton type="button" :disabled="!!!id" @click="add">{{ t('policies.add') }}</UiButton>
    <UiButton type="button" :disabled="busy" @click="load()">{{
      t('console.chooseLoaded')
    }}</UiButton>
    <p v-if="page">{{ t('console.pageNotTotal') }}</p>
    <UiButton
      v-if="page?.nextCursor"
      type="button"
      :disabled="busy"
      @click="load(page.nextCursor)"
      >{{ t('policies.next') }}</UiButton
    >
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
    <ul>
      <li v-for="(item, index) in model" :key="`${item.kind}:${item.id}`">
        {{ t(`policies.${item.kind}`) }}: {{ item.id }}
        <UiButton type="button" @click="model = model.filter((_, i) => i !== index)">
          {{ t('policies.remove') }}
        </UiButton>
      </li>
    </ul>
  </fieldset>
</template>
