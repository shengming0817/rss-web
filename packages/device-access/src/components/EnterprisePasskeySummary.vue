<script setup lang="ts">
import { computed } from 'vue'
import type { PasskeyRecord } from '../model'
const props = defineProps<{ deviceId: string; records: PasskeyRecord[] }>()
defineEmits<{ detail: [PasskeyRecord] }>()
const rows = computed(() =>
  props.records.filter((r) => r.device === props.deviceId && r.scope === 'enterprise'),
)
</script>
<template>
  <v-table
    ><thead>
      <tr>
        <th>网站 / 账号</th>
        <th>Passkey</th>
        <th>本机同步状态</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id">
        <td>
          {{ r.rp }}<small>{{ r.account }}</small>
        </td>
        <td>{{ r.label }}</td>
        <td>{{ r.state }}</td>
        <td><v-btn variant="text" size="small" @click="$emit('detail', r)">详情</v-btn></td>
      </tr>
    </tbody></v-table
  >
</template>
