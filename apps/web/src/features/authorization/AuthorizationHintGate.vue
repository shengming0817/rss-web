<script setup lang="ts">
import { toRef } from 'vue'
import type { AuthorizationIntent } from '@rss/authorization'
import { useAuthorizationIntent } from './authorization-context'

const props = defineProps<{ readonly intent: AuthorizationIntent }>()
const { execute, hint, outcome } = useAuthorizationIntent(toRef(props, 'intent'))
</script>

<template>
  <slot v-if="outcome.status === 'forbidden'" name="forbidden" :hint="hint" :outcome="outcome" />
  <slot
    v-else-if="hint.source.kind === 'preview' && hint.decision === 'deny'"
    name="denied"
    :hint="hint"
  />
  <slot v-else :hint="hint" :execute="execute" />
</template>
