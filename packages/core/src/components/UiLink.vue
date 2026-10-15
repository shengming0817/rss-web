<script setup lang="ts">
const props = defineProps<{ href: string; target?: '_self' | '_blank'; disabled?: boolean }>()
const emit = defineEmits<{ click: [event: MouseEvent] }>()
function activate(event: MouseEvent) {
  if (props.disabled) event.preventDefault()
  else emit('click', event)
}
</script>
<template>
  <a
    class="ui-link"
    :href="disabled ? undefined : href"
    :target="target"
    :rel="target === '_blank' ? 'noopener noreferrer' : undefined"
    :role="disabled ? 'link' : undefined"
    :aria-disabled="disabled || undefined"
    :tabindex="disabled ? -1 : undefined"
    @click="activate"
    ><slot
  /></a>
</template>
