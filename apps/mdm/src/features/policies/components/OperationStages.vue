<script setup lang="ts">
import { UiBadge } from '@rss/core/components'
import { useI18n } from 'vue-i18n'
defineProps<{ dispatch: string; receipt: string; effect: string }>()
const { t, te } = useI18n()
function label(value: string) {
  return te(`policies.fact.${value}`) ? t(`policies.fact.${value}`) : value
}
</script>
<template>
  <dl class="operation-stages">
    <div>
      <dt><span>01</span>{{ t('policies.admission') }}</dt>
      <dd>
        <UiBadge>{{ t('policies.ux.accepted') }}</UiBadge>
      </dd>
    </div>
    <div>
      <dt><span>02</span>{{ t('policies.dispatch') }}</dt>
      <dd>{{ label(dispatch) }}</dd>
    </div>
    <div>
      <dt><span>03</span>{{ t('policies.receipt') }}</dt>
      <dd>{{ label(receipt) }}</dd>
    </div>
    <div>
      <dt><span>04</span>{{ t('policies.effect') }}</dt>
      <dd>
        <UiBadge :tone="['unknown', 'unverified'].includes(effect) ? 'warning' : 'neutral'">{{
          label(effect)
        }}</UiBadge>
      </dd>
    </div>
  </dl>
</template>
