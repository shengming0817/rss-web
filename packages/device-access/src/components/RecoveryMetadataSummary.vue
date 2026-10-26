<script setup lang="ts">
import type { Material } from '../model'
defineProps<{ materials: Material[] }>()
</script>
<template>
  <v-table
    ><thead>
      <tr>
        <th>材料类型</th>
        <th>材料版本</th>
        <th>托管</th>
        <th>有效性</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="m in materials" :key="m.id + ':' + m.version">
        <td>{{ m.subject.kind }}</td>
        <td>v{{ m.version }}</td>
        <td>{{ m.escrowed ? '已托管' : '未托管' }}</td>
        <td>{{ m.validity }}</td>
      </tr>
    </tbody></v-table
  >
</template>
