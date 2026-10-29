<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { ObjectRef } from '../clients/objects'
defineProps<{ object: ObjectRef }>()
const runtime = useMdm(),
  { t } = useI18n()
</script>
<template>
  <RouterLink
    :to="{
      name: 'device-view-detail',
      params: { tenant: runtime.tenant, kind: object.kind, view: object.id },
    }"
    >{{ t(`devices.objectKind_${object.kind}`) }} · {{ object.id }}</RouterLink
  >
</template>
