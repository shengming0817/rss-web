<script setup lang="ts">
import { ref, watch } from 'vue'
import { UiButton } from '@rss/core/components'
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
        const p = await runtime.policies.scopes.list(cursor)
        return { ...p, items: p.items.map((i) => ({ id: i.id, label: i.id })) }
      }
      {
        const p = await runtime.policies.resources.list(undefined, cursor)
        return { ...p, items: p.items.map((i) => ({ id: i.id, label: i.id })) }
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
    <UiButton type="button" variant="secondary" :disabled="disabled || busy" @click="load()">{{
      t('console.chooseLoaded')
    }}</UiButton>
    <p v-if="page">{{ t('console.pageNotTotal') }}</p>
    <label v-if="page"
      >{{ t(`policies.${collection}`)
      }}<select v-model="value" class="ui-input" :disabled="disabled || busy">
        <option value="">{{ t('devices.select') }}</option>
        <option v-if="value && !page.items.some((item) => item.id === value)" :value="value">
          {{ value }}
        </option>
        <option v-for="item in page.items" :key="item.id" :value="item.id">{{ item.label }}</option>
      </select></label
    >
    <UiButton
      v-if="page?.nextCursor"
      type="button"
      :disabled="disabled || busy"
      @click="load(page.nextCursor!)"
      >{{ t('devices.next') }}</UiButton
    >
    <p v-if="failure" role="alert">{{ t(`devices.${failure}`) }}</p>
  </div>
</template>
