<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CellEntry } from '../../manifest/types'

defineProps<{
  cells: readonly CellEntry[]
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="deps-list">
    <table class="deps-list__table" :aria-label="t('deps.list.tableLabel')">
      <thead>
        <tr>
          <th scope="col" class="deps-list__th">{{ t('deps.list.cell') }}</th>
          <th scope="col" class="deps-list__th">{{ t('deps.list.dependsOn') }}</th>
          <th scope="col" class="deps-list__th">{{ t('deps.list.requiredBy') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="cell in cells" :key="cell.id" class="deps-list__row">
          <td class="deps-list__td">
            <button type="button" class="deps-list__cell-btn" @click="emit('select', cell.id)">
              <span class="deps-list__mono">{{ cell.id }}</span>
            </button>
          </td>
          <td class="deps-list__td">
            <span v-if="cell.dependsOnCells.length === 0" class="deps-list__none">
              {{ t('deps.list.none') }}
            </span>
            <ul v-else class="deps-list__dep-list">
              <li v-for="dep in cell.dependsOnCells" :key="dep" class="deps-list__dep-item">
                <span class="deps-list__mono">{{ dep }}</span>
              </li>
            </ul>
          </td>
          <td class="deps-list__td">
            <span v-if="cell.requiredByCells.length === 0" class="deps-list__none">
              {{ t('deps.list.none') }}
            </span>
            <ul v-else class="deps-list__dep-list">
              <li v-for="dep in cell.requiredByCells" :key="dep" class="deps-list__dep-item">
                <span class="deps-list__mono">{{ dep }}</span>
              </li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.deps-list {
  overflow-x: auto;
}

.deps-list__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-base);
}

.deps-list__th {
  text-align: left;
  padding: 8px 12px;
  font-weight: 500;
  color: var(--fg-muted);
  font-size: var(--text-sm);
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}

.deps-list__row {
  border-bottom: 1px solid var(--line-soft);
}

.deps-list__row:last-child {
  border-bottom: none;
}

.deps-list__td {
  padding: 8px 12px;
  vertical-align: top;
}

.deps-list__cell-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--accent);
  font-size: var(--text-base);
}

.deps-list__cell-btn:hover {
  text-decoration: underline;
}

.deps-list__cell-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

.deps-list__mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.deps-list__none {
  color: var(--fg-faint);
  font-size: var(--text-sm);
}

.deps-list__dep-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.deps-list__dep-item {
  color: var(--fg-muted);
}
</style>
