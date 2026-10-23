<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMdm } from '../../../context'
import type { Grant } from '../clients/authorization'
import { managedPermission } from './authorization-presentation'
defineProps<{ grants: readonly Grant[] }>()
const { t } = useI18n(),
  runtime = useMdm()
</script>
<template>
  <ul class="authorization-grants">
    <li v-for="g in grants" :key="JSON.stringify(g)">
      {{
        managedPermission(g.operation)
          ? t('operations.ruleUi.permissions.' + g.operation)
          : g.operation
      }}
      <span class="ui-help"> · {{ t('operations.ruleUi.scopes.' + g.scope.kind) }}</span>
      <RouterLink
        v-if="g.scope.kind === 'device' && runtime.realm === 'tenant'"
        :to="{ name: 'device-detail', params: { tenant: runtime.tenant, device: g.scope.id } }"
        >{{ g.scope.id }}</RouterLink
      >
    </li>
  </ul>
</template>
