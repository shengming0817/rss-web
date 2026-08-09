<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CellEntry, ContractUsage } from '../../manifest/types'
import { UnavailablePanel } from '@gocell/core'

const props = defineProps<{ cell: CellEntry }>()
const { t } = useI18n()

function roleKey(usage: ContractUsage): string {
  return `cells.roles.${usage.role}`
}
</script>

<template>
  <div class="interfaces">
    <!-- ISP header -->
    <div class="isp-header">
      <h2 class="isp-header__title">{{ t('cells.interfaces.ispTitle') }}</h2>
      <p class="isp-header__hint">{{ t('cells.interfaces.ispHint') }}</p>
    </div>

    <!-- Four ISP cards -->
    <div class="isp-grid">
      <!-- Identity sub-interface -->
      <section class="card" aria-labelledby="isp-identity-h">
        <h3 id="isp-identity-h" class="card__heading">{{ t('cells.interfaces.identity') }}</h3>
        <p class="card__desc">{{ t('cells.interfaces.identityDesc') }}</p>
        <dl class="kv">
          <div class="kv__row">
            <dt>{{ t('cells.interfaces.fields.id') }}</dt>
            <dd class="mono">{{ props.cell.id }}</dd>
          </div>
          <div class="kv__row">
            <dt>{{ t('cells.interfaces.fields.owner') }}</dt>
            <dd>{{ props.cell.owner.team }}</dd>
          </div>
          <div class="kv__row">
            <dt>{{ t('cells.interfaces.fields.goStruct') }}</dt>
            <dd class="mono">{{ props.cell.goStructName }}</dd>
          </div>
        </dl>
      </section>

      <!-- Lifecycle sub-interface -->
      <section class="card" aria-labelledby="isp-lifecycle-h">
        <h3 id="isp-lifecycle-h" class="card__heading">{{ t('cells.interfaces.lifecycle') }}</h3>
        <p class="card__desc">{{ t('cells.interfaces.lifecycleDesc') }}</p>
        <dl class="kv">
          <div class="kv__row">
            <dt>{{ t('cells.interfaces.fields.lifecycle') }}</dt>
            <dd>{{ props.cell.lifecycle }}</dd>
          </div>
          <div class="kv__row">
            <dt>{{ t('cells.interfaces.fields.consistency') }}</dt>
            <dd>{{ props.cell.consistencyLevel }}</dd>
          </div>
          <div class="kv__row">
            <dt>{{ t('cells.wiring.requires') }}</dt>
            <dd>
              <span v-if="props.cell.requires.length === 0" class="muted">—</span>
              <span v-else>{{ props.cell.requires.join(', ') }}</span>
            </dd>
          </div>
        </dl>
      </section>

      <!-- Status sub-interface — degraded -->
      <section class="card" aria-labelledby="isp-status-h">
        <h3 id="isp-status-h" class="card__heading">{{ t('cells.interfaces.status') }}</h3>
        <p class="card__desc">{{ t('cells.interfaces.statusDesc') }}</p>
        <UnavailablePanel :message="t('cells.unavailable.runtime')" />
      </section>

      <!-- Inventory sub-interface -->
      <section class="card" aria-labelledby="isp-inventory-h">
        <h3 id="isp-inventory-h" class="card__heading">{{ t('cells.interfaces.inventory') }}</h3>
        <p class="card__desc">{{ t('cells.interfaces.inventoryDesc') }}</p>
        <dl class="kv">
          <div class="kv__row">
            <dt>{{ t('cells.slices.title') }}</dt>
            <dd class="mono">{{ props.cell.slices.length }}</dd>
          </div>
          <div class="kv__row">
            <dt>{{ t('cells.inventory.contracts') }}</dt>
            <dd class="mono">{{ props.cell.produces.length + props.cell.consumes.length }}</dd>
          </div>
          <div class="kv__row">
            <dt>{{ t('cells.inventory.smokeTests') }}</dt>
            <dd class="mono">{{ props.cell.smokeTests.length }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <!-- Produces list -->
    <section class="card" aria-labelledby="isp-produces-h">
      <h3 id="isp-produces-h" class="card__heading">{{ t('cells.interfaces.produces') }}</h3>
      <p v-if="props.cell.produces.length === 0" class="muted">
        {{ t('cells.interfaces.noProduces') }}
      </p>
      <ul v-else class="contract-list" role="list">
        <li v-for="usage in props.cell.produces" :key="usage.contract" class="contract-list__item">
          <span class="mono contract-name">{{ usage.contract }}</span>
          <span class="role-pill">{{ t(roleKey(usage)) }}</span>
        </li>
      </ul>
    </section>

    <!-- Consumes list -->
    <section class="card" aria-labelledby="isp-consumes-h">
      <h3 id="isp-consumes-h" class="card__heading">{{ t('cells.interfaces.consumes') }}</h3>
      <p v-if="props.cell.consumes.length === 0" class="muted">
        {{ t('cells.interfaces.noConsumes') }}
      </p>
      <ul v-else class="contract-list" role="list">
        <li v-for="usage in props.cell.consumes" :key="usage.contract" class="contract-list__item">
          <span class="mono contract-name">{{ usage.contract }}</span>
          <span class="role-pill">{{ t(roleKey(usage)) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.interfaces {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.isp-header {
  margin-bottom: 4px;
}

.isp-header__title {
  margin: 0 0 4px;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--fg);
}

.isp-header__hint {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}

.isp-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.card {
  padding: 14px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r);
  background: var(--bg-raised);
}

.card__heading {
  margin: 0 0 6px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg);
}

.card__desc {
  margin: 0 0 10px;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.kv {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 0;
  margin: 0;
}

.kv__row {
  display: contents;
}

.kv__row dt,
.kv__row dd {
  padding: 4px 0;
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
  padding-right: 8px;
}

.kv__row dd {
  color: var(--fg);
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.muted {
  font-size: var(--text-base);
  color: var(--fg-muted);
}

.contract-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.contract-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--line-soft);
}

.contract-list__item:last-child {
  border-bottom: none;
}

.contract-name {
  flex: 1;
  color: var(--fg);
}

.role-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: var(--text-xs);
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-sm);
  white-space: nowrap;
}
</style>
