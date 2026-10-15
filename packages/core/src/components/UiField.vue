<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  id: string
  label: string
  description?: string
  error?: string
  required?: boolean
}>()
const describedBy = computed(
  () =>
    [props.description && `${props.id}-help`, props.error && `${props.id}-error`]
      .filter(Boolean)
      .join(' ') || undefined,
)
</script>
<template>
  <div class="ui-field">
    <label :for="id" class="ui-label"
      >{{ label }}<span v-if="required" aria-hidden="true"> *</span></label
    ><slot :id="id" :described-by="describedBy" :invalid="!!error" :required="required" />
    <p v-if="description" :id="`${id}-help`" class="ui-help">{{ description }}</p>
    <p v-if="error" :id="`${id}-error`" class="ui-error" role="alert">{{ error }}</p>
  </div>
</template>
