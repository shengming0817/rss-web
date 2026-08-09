<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CellEntry } from '../../manifest/types'

const props = defineProps<{ cell: CellEntry }>()
const { t } = useI18n()

const totalContracts = computed(() => props.cell.produces.length + props.cell.consumes.length)

interface InventoryRow {
  key: string
  label: string
  value: number
}

const rows = computed((): InventoryRow[] => [
  { key: 'slices', label: t('cells.inventory.slices'), value: props.cell.slices.length },
  { key: 'produces', label: t('cells.inventory.produces'), value: props.cell.produces.length },
  { key: 'consumes', label: t('cells.inventory.consumes'), value: props.cell.consumes.length },
  { key: 'requires', label: t('cells.inventory.requires'), value: props.cell.requires.length },
  {
    key: 'smokeTests',
    label: t('cells.inventory.smokeTests'),
    value: props.cell.smokeTests.length,
  },
  { key: 'contracts', label: t('cells.inventory.contracts'), value: totalContracts.value },
])
</script>

<template>
  <div class="inventory">
    <h2 id="cell-inventory-title" class="inventory__title">{{ t('cells.inventory.title') }}</h2>
    <table class="inv-table" aria-labelledby="cell-inventory-title">
      <thead>
        <tr>
          <th scope="col" class="inv-table__th">{{ t('cells.inventory.metric') }}</th>
          <th scope="col" class="inv-table__th inv-table__th--num">
            {{ t('cells.inventory.count') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key" class="inv-table__row">
          <td class="inv-table__label">{{ row.label }}</td>
          <td class="inv-table__value mono">{{ row.value }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.inventory {
  padding: 16px 0;
}

.inventory__title {
  margin: 0 0 14px;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--fg);
}

.inv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-base);
}

.inv-table__th {
  padding: 6px 12px;
  text-align: left;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line);
}

.inv-table__th--num {
  text-align: right;
}

.inv-table__row:hover {
  background: var(--bg-sunken);
}

.inv-table__label {
  padding: 7px 12px;
  color: var(--fg);
  border-bottom: 1px solid var(--line-soft);
}

.inv-table__value {
  padding: 7px 12px;
  text-align: right;
  color: var(--fg);
  border-bottom: 1px solid var(--line-soft);
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
</style>
