<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Authorization, ReauthorizationEligibility } from '../clients/authorization'
defineProps<{ authorization: Authorization; reauthorization: ReauthorizationEligibility }>()
const { t } = useI18n()
</script>
<template>
  <div class="authorization-facts">
    <p>
      {{ t('policies.authorization.title') }}:
      {{ t(`policies.authorization.${authorization.state}`)
      }}<template v-if="authorization.state === 'blocked'">
        · {{ t(`policies.authorization.${authorization.reason}`) }}</template
      >
    </p>
    <p>
      {{ t('policies.authorization.reauthorization') }}:
      {{ t(`policies.authorization.${reauthorization.state}`)
      }}<template v-if="reauthorization.state === 'unavailable'">
        · {{ t(`policies.authorization.${reauthorization.reason}`) }}</template
      >
    </p>
  </div>
</template>
