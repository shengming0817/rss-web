<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxEmpty,
} from 'reka-ui'
import type { UiOption } from './types'
const props = defineProps<{
  id?: string
  name?: string
  label: string
  options: readonly UiOption[]
  emptyLabel: string
  disabled?: boolean
  invalid?: boolean
  readonly?: boolean
  required?: boolean
  invalidLabel: string
}>()
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
const open = ref(false)
const selectedLabel = computed(() => display(model.value))
const query = ref(selectedLabel.value)
const input = ref<InstanceType<typeof ComboboxInput>>()
watch([() => props.readonly, selectedLabel], ([readonly, label]) => {
  if (readonly) {
    open.value = false
    query.value = label
  }
})
watchEffect(() => {
  const element = input.value?.$el
  if (element instanceof HTMLInputElement)
    element.setCustomValidity(props.required && !model.value ? props.invalidLabel : '')
})
function select(value: unknown) {
  if (!props.readonly && typeof value === 'string') model.value = value
}
function display(value: unknown) {
  return props.options.find((item) => item.value === value)?.label ?? String(value ?? '')
}
</script>
<template>
  <ComboboxRoot
    v-bind="name === undefined ? {} : { name }"
    :model-value="model"
    :open="readonly ? false : open"
    :required="!!required && !readonly"
    :disabled="!!disabled"
    class="ui-combobox"
    :open-on-focus="!readonly"
    @update:model-value="select"
    @update:open="open = readonly ? false : $event"
    ><ComboboxAnchor class="ui-combobox-anchor"
      ><ComboboxInput
        v-bind="$attrs"
        :id="id"
        ref="input"
        v-model="query"
        :readonly="readonly"
        :aria-required="required || undefined"
        class="ui-input"
        :aria-label="label"
        :aria-invalid="invalid || undefined"
        :display-value="display"
      /><ComboboxTrigger :disabled="!!readonly" class="ui-trigger" :aria-label="label"
        >⌄</ComboboxTrigger
      ></ComboboxAnchor
    ><ComboboxPortal
      ><ComboboxContent class="ui-popover" position="popper" :side-offset="4"
        ><ComboboxViewport
          ><ComboboxEmpty class="ui-menu-item">{{ emptyLabel }}</ComboboxEmpty
          ><ComboboxItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :text-value="option.label"
            :disabled="!!option.disabled"
            class="ui-menu-item"
            >{{ option.label
            }}<ComboboxItemIndicator aria-hidden="true">✓</ComboboxItemIndicator></ComboboxItem
          ></ComboboxViewport
        ></ComboboxContent
      ></ComboboxPortal
    ></ComboboxRoot
  >
</template>
