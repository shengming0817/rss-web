<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CellEntry, ContractUsage } from '../../manifest/types'

const props = defineProps<{ cell: CellEntry }>()
const { t } = useI18n()

function roleKey(usage: ContractUsage): string {
  return `cells.roles.${usage.role}`
}
</script>

<template>
  <div class="contracts">
    <h2 class="contracts__title">{{ t('cells.contracts.title') }}</h2>

    <p v-if="props.cell.produces.length === 0 && props.cell.consumes.length === 0" class="muted">
      {{ t('cells.contracts.none') }}
    </p>

    <template v-else>
      <!-- Produces table -->
      <section class="section" aria-labelledby="contracts-produces-h">
        <h3 id="contracts-produces-h" class="section__heading">
          {{ t('cells.contracts.produces') }}
          <span class="count mono">{{ props.cell.produces.length }}</span>
        </h3>
        <p v-if="props.cell.produces.length === 0" class="muted">—</p>
        <table v-else class="contracts-table">
          <thead>
            <tr>
              <th scope="col" class="contracts-table__th">{{ t('cells.contracts.contract') }}</th>
              <th scope="col" class="contracts-table__th">{{ t('cells.contracts.role') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="usage in props.cell.produces"
              :key="usage.contract"
              class="contracts-table__row"
            >
              <td class="contracts-table__cell mono">{{ usage.contract }}</td>
              <td class="contracts-table__cell">
                <span class="role-pill">{{ t(roleKey(usage)) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Consumes table -->
      <section class="section" aria-labelledby="contracts-consumes-h">
        <h3 id="contracts-consumes-h" class="section__heading">
          {{ t('cells.contracts.consumes') }}
          <span class="count mono">{{ props.cell.consumes.length }}</span>
        </h3>
        <p v-if="props.cell.consumes.length === 0" class="muted">—</p>
        <table v-else class="contracts-table">
          <thead>
            <tr>
              <th scope="col" class="contracts-table__th">{{ t('cells.contracts.contract') }}</th>
              <th scope="col" class="contracts-table__th">{{ t('cells.contracts.role') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="usage in props.cell.consumes"
              :key="usage.contract"
              class="contracts-table__row"
            >
              <td class="contracts-table__cell mono">{{ usage.contract }}</td>
              <td class="contracts-table__cell">
                <span class="role-pill">{{ t(roleKey(usage)) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.contracts {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px 0;
}

.contracts__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--fg);
}

.muted {
  font-size: var(--text-base);
  color: var(--fg-muted);
  margin: 0;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--fg);
}

.count {
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.contracts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-base);
}

.contracts-table__th {
  padding: 6px 12px;
  text-align: left;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line);
}

.contracts-table__row:hover {
  background: var(--bg-sunken);
}

.contracts-table__cell {
  padding: 7px 12px;
  color: var(--fg);
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
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
