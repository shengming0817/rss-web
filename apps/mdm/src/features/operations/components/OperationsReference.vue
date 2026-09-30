<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { OperationsReference } from '../clients/model'
defineProps<{ target: OperationsReference }>()
const { t } = useI18n(),
  runtime = useMdm()
</script>
<template>
  <span>
    <RouterLink
      :to="{
        name: 'security-rules',
        params: { tenant: runtime.tenant },
        query: { rule: target.id },
      }"
      >{{ t(`operations.target.${target.kind}`) }} {{ target.id }}</RouterLink
    >
    · {{ t('devices.revision') }} {{ target.revision ?? '—' }}
    <template v-if="target.device">
      ·
      <RouterLink
        :to="{
          name: 'security-compliance',
          params: { tenant: runtime.tenant },
          query: { device: target.device },
        }"
        >{{ target.device }}</RouterLink
      ></template
    >
  </span>
</template>
