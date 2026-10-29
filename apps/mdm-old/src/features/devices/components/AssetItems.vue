<script setup lang="ts">
import { computed } from 'vue'
import { VTable } from 'vuetify/components'
import { useI18n } from 'vue-i18n'
import type { ReadScalar } from '../clients/asset-model'
const props = defineProps<{ items: ReadScalar[]; completeEmpty?: boolean }>()
const { t } = useI18n()
const records = computed(() => props.items.every((x) => x.kind === 'object'))
const columns = computed(() => [
  ...new Set(props.items.flatMap((x) => (x.kind === 'object' ? Object.keys(x.value) : []))),
])
function display(x: ReadScalar | undefined): string {
  if (!x) return '—'
  if (x.kind === 'boolean') return t(x.value ? 'devices.yes' : 'devices.no')
  if (x.kind === 'array') return x.value.map(display).join(', ')
  if (x.kind === 'object')
    return Object.entries(x.value)
      .map(([k, v]) => `${k}: ${display(v)}`)
      .join('; ')
  return String(x.value)
}
</script>
<template>
  <p v-if="!items.length">{{ t(completeEmpty ? 'devices.completeEmptyList' : 'devices.empty') }}</p>
  <v-table v-else-if="records" density="compact" hover>
    <caption>
      {{
        t('devices.sourceLists')
      }}
    </caption>
    <thead>
      <tr>
        <th v-for="key in columns" :key="key" scope="col">{{ key }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(item, index) in items" :key="index">
        <td v-for="key in columns" :key="key">
          {{ item.kind === 'object' ? display(item.value[key]) : display(item) }}
        </td>
      </tr>
    </tbody>
  </v-table>
  <ol v-else>
    <li v-for="(item, index) in items" :key="index">{{ display(item) }}</li>
  </ol>
</template>
