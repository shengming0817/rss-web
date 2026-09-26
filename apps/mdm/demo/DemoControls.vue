<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { createMdmTransport } from '@rss/api/mdm'
import { useI18n } from 'vue-i18n'
import { scenarios, TENANT } from './scenario'
import { record, enumeration } from '../src/services/decode'
import { moduleIds } from '../src/services/workspace'
const { locale, t } = useI18n()
const active = ref('normal')
const module = ref('devices')
const source = ref('mock')
const selectedSources = ref<Record<string, string>>({})
watch(module, (value) => {
  source.value = selectedSources.value[value] ?? 'mock'
})
onMounted(async () => {
  try {
    const value = await createMdmTransport().request({
      method: 'GET',
      path: '/api/mdm-candidate/v1/workspace/scenario',
      successStatus: 200,
      decode(value) {
        const v = record(value)
        const sources = record(v['sources'])
        return {
          scenario: enumeration(v['scenario'], scenarios),
          sources: Object.fromEntries(
            moduleIds.map((id) => [id, enumeration(sources[id], ['real', 'mock'] as const)]),
          ),
        }
      },
    })
    active.value = value.scenario
    selectedSources.value = value.sources
    source.value = value.sources[module.value] ?? 'mock'
  } catch {
    failed.value = true
  }
})
const failed = ref(false)
const busy = ref(false)
async function apply(reset: boolean) {
  if (busy.value) return
  busy.value = true
  failed.value = false
  try {
    await createMdmTransport().request({
      method: 'POST',
      path: '/api/mdm-candidate/v1/workspace/scenario',
      body: { reset, scenario: active.value, module: module.value, source: source.value },
      successStatus: 204,
    })
    window.location.assign(reset ? `/tenants/${TENANT}/login` : window.location.pathname)
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <aside class="mdm-source" :aria-label="locale === 'zh-CN' ? '模拟控制' : 'Mock controls'">
    <strong
      >Mock ·
      {{
        locale === 'zh-CN'
          ? '纯合成数据；账户 demo 或 reviewer，密码 demo；不执行真实设备操作'
          : 'Synthetic data; accounts demo or reviewer, password demo; no real device actions'
      }}</strong
    >
    <label for="demo-scenario">{{ locale === 'zh-CN' ? '场景' : 'Scenario' }}</label>
    <select id="demo-scenario" v-model="active">
      <option v-for="item in scenarios" :key="item" :value="item">
        {{ t(`mdm.scenarios.${item}`) }}
      </option>
    </select>
    <label for="demo-module">{{ locale === 'zh-CN' ? '模块' : 'Module' }}</label>
    <select id="demo-module" v-model="module">
      <option v-for="item in moduleIds" :key="item" :value="item">{{ t(`mdm.${item}`) }}</option>
    </select>
    <label for="demo-source">{{
      locale === 'zh-CN'
        ? '来源（真实接口未接入时显示不可用）'
        : 'Source (unconnected live API stays unavailable)'
    }}</label>
    <select id="demo-source" v-model="source">
      <option value="mock">{{ t('mdm.mock') }}</option>
      <option value="real">{{ t('mdm.real') }}</option>
    </select>
    <button :disabled="busy" @click="apply(false)">
      {{ locale === 'zh-CN' ? '应用' : 'Apply' }}
    </button>
    <button :disabled="busy" @click="apply(true)">
      {{ locale === 'zh-CN' ? '重置演示' : 'Reset demo' }}
    </button>
    <p v-if="failed" role="alert">
      {{ locale === 'zh-CN' ? '模拟服务不可用' : 'Demo server unavailable' }}
    </p>
  </aside>
</template>
