<script setup lang="ts" generic="T extends object">
import { computed } from 'vue'
import type { UiColumn, UiSort } from './types'
const props = defineProps<{
  label: string
  rows: readonly T[]
  columns: readonly UiColumn<T>[]
  rowKey: (row: T) => string
  busy?: boolean
  busyLabel: string
  emptyLabel: string
  selectable?: boolean
  selectionLabel?: string
  rowSelectionLabel?: (row: T) => string
  disabled?: boolean
}>()
const selected = defineModel<string[]>('selected', { default: () => [] })
const sort = defineModel<UiSort | null>('sort', { default: null })
const allSelected = computed(
  () =>
    props.rows.length > 0 && props.rows.every((row) => selected.value.includes(props.rowKey(row))),
)
const someSelected = computed(() =>
  props.rows.some((row) => selected.value.includes(props.rowKey(row))),
)
function select(key: string, checked: boolean) {
  selected.value = checked
    ? [...new Set([...selected.value, key])]
    : selected.value.filter((value) => value !== key)
}
function selectVisible(checked: boolean) {
  const keys = props.rows.map(props.rowKey)
  selected.value = checked
    ? [...new Set([...selected.value, ...keys])]
    : selected.value.filter((value) => !keys.includes(value))
}
function cell(row: T, column: UiColumn<T>): unknown {
  return column.value ? column.value(row) : (row as Record<string, unknown>)[column.key]
}
function order(key: string) {
  sort.value =
    sort.value?.key !== key
      ? { key, direction: 'asc' }
      : sort.value.direction === 'asc'
        ? { key, direction: 'desc' }
        : null
}
</script>
<template>
  <div class="ui-table-scroll" :aria-busy="busy || undefined">
    <table class="ui-table">
      <caption class="ui-sr-only">
        {{
          label
        }}
      </caption>
      <thead>
        <tr>
          <th v-if="selectable" scope="col">
            <input
              type="checkbox"
              :aria-label="selectionLabel ?? label"
              :checked="allSelected"
              :indeterminate="someSelected && !allSelected"
              :disabled="disabled || busy || !rows.length"
              @change="selectVisible(($event.target as HTMLInputElement).checked)"
            />
          </th>
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            :aria-sort="
              column.sortable
                ? sort?.key === column.key
                  ? sort.direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                : undefined
            "
          >
            <button
              v-if="column.sortable"
              class="ui-sort"
              type="button"
              :disabled="disabled || busy"
              @click="order(column.key)"
            >
              {{ column.label }}
              <span aria-hidden="true">{{
                sort?.key === column.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'
              }}</span></button
            ><template v-else>{{ column.label }}</template>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="rowKey(row)">
          <td v-if="selectable">
            <input
              type="checkbox"
              :checked="selected.includes(rowKey(row))"
              :aria-label="rowSelectionLabel ? rowSelectionLabel(row) : rowKey(row)"
              :disabled="disabled || busy"
              @change="select(rowKey(row), ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td v-for="column in columns" :key="column.key">
            <slot :name="`cell-${column.key}`" :row="row" :value="cell(row, column)">{{
              cell(row, column) ?? '—'
            }}</slot>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + (selectable ? 1 : 0)" class="ui-table-empty" role="status">
            {{ busy ? busyLabel : emptyLabel }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
