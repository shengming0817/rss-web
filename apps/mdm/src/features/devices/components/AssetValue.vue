<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ResolvedField, Scalar } from '../clients/asset-model'
defineProps<{ field: ResolvedField }>()
const { t } = useI18n()
const display = (value: Scalar) =>
  value.kind === 'boolean' ? t(`devices.${value.value ? 'yes' : 'no'}`) : String(value.value)
</script>
<template>
  <div class="asset-value">
    <strong>{{ t(`devices.state.${field.state.kind}`) }}</strong>
    <span v-if="field.state.kind === 'known'"> · {{ display(field.state.value) }}</span>
    <details v-if="field.sources.length">
      <summary>{{ t('devices.evidence') }}</summary>
      <dl v-for="source in field.sources" :key="source.evidence.source">
        <dt>{{ t('devices.source') }}</dt>
        <dd>{{ source.evidence.source }}</dd>
        <dt>{{ t('devices.current') }}</dt>
        <dd>
          {{ t(`devices.state.${source.state.kind}`)
          }}<template v-if="source.state.kind === 'known'">
            · {{ display(source.state.value) }}</template
          >
        </dd>
        <dt>{{ t('devices.observed') }}</dt>
        <dd>{{ source.evidence.observedAt }}</dd>
        <dt>{{ t('devices.received') }}</dt>
        <dd>{{ source.evidence.receivedAt }}</dd>
        <dt>{{ t('devices.registration') }}</dt>
        <dd>
          {{ source.evidence.registration ?? '—' }} /
          {{ source.evidence.registrationGeneration ?? '—' }}
        </dd>
        <dt>{{ t('devices.snapshot') }}</dt>
        <dd>{{ source.evidence.snapshotId }}</dd>
        <dt>{{ t('devices.actor') }}</dt>
        <dd>{{ source.evidence.actor ?? '—' }}</dd>
        <template v-if="source.lastKnown"
          ><dt>{{ t('devices.lastKnown') }}</dt>
          <dd>
            {{ display(source.lastKnown.value) }} · {{ source.lastKnown.evidence.observedAt }} ·
            {{ source.lastKnown.evidence.snapshotId }}
          </dd></template
        >
      </dl>
    </details>
  </div>
</template>
