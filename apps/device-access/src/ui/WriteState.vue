<script setup lang="ts">
import type { WriteState } from '../services/mutation'
defineProps<{ state: WriteState; queryable?: boolean }>()
defineEmits<{ query: [] }>()
</script>
<template>
  <v-alert
    v-if="state.message"
    class="mt-5"
    :type="state.state === 'unknown' ? 'warning' : 'info'"
    :icon="false"
    role="status"
    >{{ state.message
    }}<template v-if="state.state === 'unknown'"
      ><p>{{ $t('da.me209f2ce8c') }}</p>
      <v-btn v-if="queryable" variant="text" @click="$emit('query')">{{
        $t('da.m208c1e649d')
      }}</v-btn></template
    ></v-alert
  >
</template>
