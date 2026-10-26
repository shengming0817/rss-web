<script lang="ts">
import type { ComputedRef, InjectionKey } from 'vue'
const policyFieldsDisabled: InjectionKey<ComputedRef<boolean>> = Symbol('Policy fields disabled')
</script>
<script setup lang="ts">
import { computed, inject, provide } from 'vue'
import { VDefaultsProvider } from 'vuetify/components'
const props = defineProps<{ disabled?: boolean }>()
defineOptions({ inheritAttrs: false })
const parentDisabled = inject(
  policyFieldsDisabled,
  computed(() => false),
)
const disabled = computed(() => !!props.disabled || parentDisabled.value)
provide(policyFieldsDisabled, disabled)
const defaults = computed(() =>
  Object.fromEntries(
    ['VTextField', 'VTextarea', 'VSelect', 'VCheckbox', 'VRadio', 'VBtn'].map((name) => [
      name,
      { disabled: disabled.value },
    ]),
  ),
)
</script>
<template>
  <VDefaultsProvider :defaults="defaults"
    ><fieldset v-bind="$attrs" :disabled="disabled"><slot /></fieldset
  ></VDefaultsProvider>
</template>
