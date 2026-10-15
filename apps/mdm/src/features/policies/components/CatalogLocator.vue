<script setup lang="ts">
import { ref } from 'vue'
import { UiButton } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import { useOperation } from '../../../services/useOperation'
import type { Collection } from '../clients/catalog'
const props = defineProps<{ collection: Collection; disabled?: boolean }>()
const value = defineModel<string>({ required: true })
const { t } = useI18n(),
  runtime = useMdm()
const { run, busy, failure } = useOperation()
const page = ref<Awaited<ReturnType<typeof runtime.policies.catalog.list>>>()
function load(cursor?: string) {
  void run(
    () => runtime.policies.catalog.list(props.collection, cursor),
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
    <label v-if="page"
      >{{ t('console.pageNotTotal')
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
