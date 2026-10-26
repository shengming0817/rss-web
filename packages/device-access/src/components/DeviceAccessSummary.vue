<script setup lang="ts">
import type { Binding, Computer } from '../model'
defineProps<{ computer: Computer; bindings: Binding[] }>()
function observed(v: number | null) {
  return v === null ? '未观察' : 'v' + v
}
</script>
<template>
  <section aria-label="设备访问摘要">
    <p>配置、接收、实际应用与账号注册分别观察；平台状态不代表当前应用会话。</p>
    <v-table
      ><thead>
        <tr>
          <th>账号绑定</th>
          <th>目标</th>
          <th>接收</th>
          <th>实际应用</th>
          <th>服务端关联</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="b in bindings" :key="b.id">
          <td>{{ b.account }}</td>
          <td>{{ observed(b.targetRevision) }}</td>
          <td>{{ observed(b.receivedRevision) }}</td>
          <td>{{ observed(b.appliedRevision) }}</td>
          <td>{{ b.serverState }}</td>
        </tr>
      </tbody></v-table
    >
    <p v-if="!bindings.length">当前授权目录没有账号绑定记录。</p>
    <div v-for="b in bindings" :key="b.id" class="da-facts">
      <strong>{{ b.account }}</strong>
      <dl>
        <div v-for="o in b.observations" :key="o.key">
          <dt>{{ o.key }}</dt>
          <dd>{{ o.value ?? '未观察' }} · {{ o.state }}</dd>
        </div>
      </dl>
    </div>
    <p>应用会话：未在设备摘要中查询。</p>
  </section>
</template>
