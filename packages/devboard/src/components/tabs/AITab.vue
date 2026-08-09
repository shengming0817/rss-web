<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CellEntry } from '../../manifest/types'
import { UnavailablePanel } from '@gocell/core'

defineProps<{ cell: CellEntry }>()

const { t } = useI18n()
</script>

<template>
  <section class="ai-tab">
    <UnavailablePanel :title="t('cells.unavailable.title')" :message="t('cells.unavailable.ai')" />
  </section>
</template>

<style scoped>
.ai-tab {
  padding: 16px;
}
</style>
