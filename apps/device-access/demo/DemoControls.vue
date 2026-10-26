<script setup lang="ts">
import { ref } from 'vue'
import { bindSession } from '@rss/auth'
import { createDeviceAccessDemoTransport } from '@rss/api/device-access-demo'
import { useDa } from '../src/context'
const r = useDa(),
  transport = bindSession(createDeviceAccessDemoTransport(), r.session),
  scenario = ref('normal'),
  error = ref(''),
  busy = ref(false)
const options = [
  { title: '正常', value: 'normal' },
  { title: '只读', value: 'readonly' },
  { title: '无权限', value: 'forbidden' },
  { title: '空目录', value: 'empty' },
  { title: '离线', value: 'offline' },
  { title: '版本冲突', value: 'conflict' },
  { title: '响应未知', value: 'unknown' },
  { title: '服务故障', value: 'unavailable' },
  { title: '会话失效', value: 'expired' },
  { title: '需要重新认证', value: 'stepup' },
]
async function change(value: string) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await transport.request({
      method: 'POST',
      path: '/api/da-demo/scenario',
      body: { scenario: value },
      successStatus: 200,
      decode: () => undefined,
    })
    scenario.value = value
  } catch {
    error.value = '场景未切换'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="demo-bar">
    <span>MOCK · 合成接口数据 · 非设备验收</span
    ><span v-if="r.session.state.value.status !== 'authenticated'"
      >演示账号 demo / demo；只读账号 reader / demo</span
    ><v-select
      v-else
      :model-value="scenario"
      :items="options"
      label="接口场景（切换后重新读取）"
      :disabled="busy"
      hide-details
      density="compact"
      @update:model-value="change"
    /><span role="status">{{ error }}</span>
  </div>
</template>
