<script setup lang="ts">
import { VBtn, VSelect } from 'vuetify/components'
import PolicyScopeEditor from './PolicyScopeEditor.vue'

import { comparison as queryComparison } from '../../../services/directory-query'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import { deviceBinding } from '../../devices/useDeviceBinding'
const props = defineProps<{ collection: 'scopes' | 'resources'; disabled?: boolean }>()
const value = defineModel<string>({ required: true })
const { t } = useI18n(),
  runtime = useMdm()
const { run, busy, failure } = useOperation([], () => deviceBinding(runtime))
const page = ref<{ items: { id: string; label: string }[]; nextCursor: string | null }>()
watch(
  () => deviceBinding(runtime),
  () => {
    page.value = undefined
  },
  { flush: 'sync' },
)
function load(cursor?: string) {
  void run(
    async () => {
      if (props.collection === 'scopes') {
        const p = await runtime.policies.scopes.list({
          cursor,
          filter: queryComparison('ready', '==', true),
        })
        return {
          ...p,
          items: p.items.map((i) => ({
            id: i.id,
            label: `${i.id} · ${t('policies.revision')} ${i.revision}`,
          })),
        }
      }
      {
        const p = await runtime.policies.resources.list({
          cursor,
          filter: queryComparison('active', '==', true),
        })
        return {
          ...p,
          items: p.items.map((i) => ({
            id: i.id,
            label: `${i.id} · ${t('policies.version')} ${i.activeVersion ?? '—'}`,
          })),
        }
      }
    },
    (result) => {
      page.value = result
    },
  )
}
</script>
<template>
  <div class="console-locator">
    <PolicyScopeEditor
      v-if="collection === 'scopes'"
      v-model="value"
      :disabled="disabled || busy"
    />
    <VBtn type="button" variant="tonal" :disabled="disabled || busy" @click="load()">{{
      t('console.chooseLoaded')
    }}</VBtn>
    <p v-if="page">{{ t('console.pageNotTotal') }}</p>
    <label v-if="page"
      >{{ t(`policies.${collection}`)
      }}<VSelect
        v-model="value"
        :disabled="disabled || busy"
        :items="[
          { title: String(t('devices.select')), value: '' },
          ...(value && !page.items.some((item) => item.id === value)
            ? [{ title: String(value), value: value }]
            : []),
          ...page.items.map((item) => ({ title: String(item.label), value: item.id })),
        ]"
        variant="outlined"
        density="comfortable"
        hide-details="auto"
    /></label>
    <VBtn
      v-if="page?.nextCursor"
      type="button"
      :disabled="disabled || busy"
      @click="load(page.nextCursor!)"
      >{{ t('devices.next') }}</VBtn
    >
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
  </div>
</template>
