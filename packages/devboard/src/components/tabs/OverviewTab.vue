<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CellEntry } from '../../manifest/types'
import CellDurabilityBadge from '../CellDurabilityBadge.vue'
import { UnavailablePanel } from '@gocell/core'

const props = defineProps<{ cell: CellEntry }>()
const { t } = useI18n()
</script>

<template>
  <div class="overview">
    <!-- Identity card -->
    <section class="card" :aria-labelledby="`overview-${cell.id}-identity-h`">
      <h2 :id="`overview-${cell.id}-identity-h`" class="card__heading">
        {{ t('cells.overview.identity') }}
      </h2>
      <dl class="kv">
        <div class="kv__row">
          <dt>{{ t('cells.overview.id') }}</dt>
          <dd class="mono">{{ props.cell.id }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.name') }}</dt>
          <dd>{{ props.cell.name }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.domain') }}</dt>
          <dd>{{ props.cell.domain }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.type') }}</dt>
          <dd>{{ props.cell.type }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.consistency') }}</dt>
          <dd>{{ props.cell.consistencyLevel }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.durability') }}</dt>
          <dd><CellDurabilityBadge :mode="props.cell.durabilityMode" /></dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.owner') }}</dt>
          <dd>{{ props.cell.owner.team }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.ownerRole') }}</dt>
          <dd>{{ props.cell.owner.role }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.goStruct') }}</dt>
          <dd class="mono">{{ props.cell.goStructName }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.schema') }}</dt>
          <dd class="mono">{{ props.cell.schemaPrimary ?? t('cells.unavailable.label') }}</dd>
        </div>
        <div class="kv__row">
          <dt>{{ t('cells.overview.lifecycle') }}</dt>
          <dd>{{ props.cell.lifecycle }}</dd>
        </div>
      </dl>
    </section>

    <!-- Health card — degraded (requires BR-001) -->
    <section class="card" :aria-labelledby="`overview-${cell.id}-health-h`">
      <h2 :id="`overview-${cell.id}-health-h`" class="card__heading">
        {{ t('cells.overview.health') }}
      </h2>
      <UnavailablePanel
        :title="t('cells.overview.health')"
        :message="t('cells.unavailable.runtime')"
      />
    </section>

    <!-- Runtime card — degraded (requires BR-001) -->
    <section class="card" :aria-labelledby="`overview-${cell.id}-runtime-h`">
      <h2 :id="`overview-${cell.id}-runtime-h`" class="card__heading">
        {{ t('cells.overview.runtime') }}
      </h2>
      <UnavailablePanel
        :title="t('cells.overview.runtime')"
        :message="t('cells.unavailable.runtime')"
      />
    </section>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.card {
  padding: 16px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  background: var(--bg-raised);
}

.card__heading {
  margin: 0 0 12px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg);
}

.kv {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 0;
  margin: 0;
}

.kv__row {
  display: contents;
}

.kv__row dt,
.kv__row dd {
  padding: 5px 0;
  font-size: var(--text-base);
  border-bottom: 1px solid var(--line-soft);
  margin: 0;
}

.kv__row:last-child dt,
.kv__row:last-child dd {
  border-bottom: none;
}

.kv__row dt {
  color: var(--fg-muted);
  padding-right: 12px;
}

.kv__row dd {
  color: var(--fg);
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
</style>
