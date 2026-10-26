<script setup lang="ts">
defineProps<{ busy: boolean; error: string }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <v-progress-linear
    v-if="busy"
    indeterminate
    color="primary"
    :aria-label="$t('da.m62e5156191')"
  /><v-alert v-if="error" type="error" :icon="false" class="mb-5" role="alert"
    >{{ error
    }}<v-btn size="small" variant="text" @click="$emit('retry')">{{
      $t('da.m7784972fc8')
    }}</v-btn></v-alert
  >
</template>
