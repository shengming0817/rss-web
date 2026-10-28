<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
const props = defineProps<{
  items: readonly object[]
  required?: readonly string[] | undefined
  disabled?: boolean | undefined
}>()
const emit = defineEmits<{ open: [row: Record<string, unknown>] }>()
const { locale } = useI18n()
const rows = computed(() => props.items.map((row) => row as Record<string, unknown>))
const columns = computed(() => [...new Set(rows.value.flatMap(Object.keys))])
const display = (value: unknown) =>
  value === null ? 'null' : typeof value === 'object' ? JSON.stringify(value) : String(value)
</script>
<template>
  <div class="directory-results">
    <table>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column" scope="col">{{ column }}</th>
          <th scope="col">{{ locale.startsWith('zh') ? '完整详情' : 'Full details' }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="index">
          <td v-for="column in columns" :key="column">
            {{ column in row ? display(row[column]) : '—' }}
          </td>
          <td>
            <button
              v-if="(required ?? ['id']).every((key) => key in row && row[key] !== null)"
              type="button"
              :disabled="disabled"
              @click="emit('open', row)"
            >
              {{ locale.startsWith('zh') ? '读取详情' : 'Read details' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<style scoped>
.directory-results {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.75rem;
  text-align: start;
  border-bottom: 1px solid currentColor;
  overflow-wrap: anywhere;
}
button {
  border: 1px solid currentColor;
  padding: 0.3rem;
}
</style>
