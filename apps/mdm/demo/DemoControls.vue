<script setup lang="ts">
import { ref, watch, type Ref } from 'vue'
import type { HttpTransport } from '@rss/api/mdm'
import { useI18n } from 'vue-i18n'
import { scenarios, TENANT } from './scenario'
import { record, enumeration } from '../src/services/decode'
import { moduleIds } from '../src/services/workspace'
const props = defineProps<{ transport: HttpTransport; authenticated: Readonly<Ref<boolean>> }>()
const { locale, t } = useI18n()
const active = ref('normal')
const module = ref('devices')
const source = ref('mock')
const selectedSources = ref<Record<string, string>>({})
watch(module, (value) => {
  source.value = selectedSources.value[value] ?? 'mock'
})
async function load() {
  try {
    const value = await props.transport.request({
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
}
watch(
  () => props.authenticated.value,
  (value) => {
    if (value) void load()
  },
  { immediate: true },
)
const failed = ref(false)
const busy = ref(false)
const eventKind = ref('clock'),
  eventAt = ref(Math.floor(Date.now() / 1000)),
  eventDevice = ref('device-01'),
  eventResource = ref(''),
  eventItem = ref(''),
  eventTask = ref(''),
  eventEnrollment = ref(''),
  eventActive = ref(true)
async function simulate() {
  if (busy.value) return
  busy.value = true
  failed.value = false
  try {
    await props.transport.request({
      method: 'POST',
      path: '/api/mdm-candidate/v1/workspace/scenario',
      body: {
        event: {
          kind: eventKind.value,
          at: eventAt.value,
          ...(eventKind.value !== 'clock' ? { device: eventDevice.value } : {}),
          ...(eventKind.value === 'software_usage'
            ? { resource: eventResource.value, active: eventActive.value }
            : {}),
          ...(['software_detect', 'security_result', 'security_detect'].includes(eventKind.value)
            ? { task: eventTask.value }
            : {}),
          ...(eventKind.value === 'software_request' ? { item: eventItem.value } : {}),
          ...(eventKind.value === 'enrollment_bind' ? { enrollment: eventEnrollment.value } : {}),
          ...(eventKind.value === 'agent_binding' ? { active: eventActive.value } : {}),
        },
      },
      successStatus: 204,
    })
    window.location.reload()
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
async function apply(reset: boolean) {
  if (busy.value) return
  busy.value = true
  failed.value = false
  try {
    await props.transport.request({
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
    <p>
      {{
        locale === 'zh-CN'
          ? '配置、软件、安全与运营共用执行、审批和审计，来源会一起切换。'
          : 'Configuration, software, security and operations share execution, approval and audit records; their sources switch together.'
      }}
    </p>
    <button :disabled="busy || !authenticated.value" @click="apply(false)">
      {{ locale === 'zh-CN' ? '应用' : 'Apply' }}
    </button>
    <button :disabled="busy || !authenticated.value" @click="apply(true)">
      {{ locale === 'zh-CN' ? '重置演示' : 'Reset demo' }}
    </button>
    <p v-if="failed" role="alert">
      {{ locale === 'zh-CN' ? '模拟服务不可用' : 'Demo server unavailable' }}
    </p>
    <details>
      <summary>
        {{
          locale === 'zh-CN'
            ? '模拟自动化触发事件（先登录并启用策略或工作流）'
            : 'Simulate automation events (sign in and enable a policy or workflow first)'
        }}
      </summary>
      <label for="demo-event-kind">{{ locale === 'zh-CN' ? '事件' : 'Event' }}</label>
      <select id="demo-event-kind" v-model="eventKind">
        <option value="clock">
          {{ locale === 'zh-CN' ? '服务端时钟推进' : 'Server clock tick' }}
        </option>
        <option value="registration">
          {{ locale === 'zh-CN' ? '模拟设备注册事件' : 'Synthetic registration event' }}
        </option>
        <option value="check_in">
          {{ locale === 'zh-CN' ? '模拟设备签入事件' : 'Synthetic check-in event' }}
        </option>
        <option value="software_start">
          {{
            locale === 'zh-CN'
              ? '模拟本地用户继续安装'
              : 'Synthetic local user continues installation'
          }}
        </option>
        <option value="software_usage">
          {{ locale === 'zh-CN' ? '模拟独立软件使用采样' : 'Synthetic software usage observation' }}
        </option>
        <option value="software_request">
          {{
            locale === 'zh-CN'
              ? '模拟本地用户提交安装申请'
              : 'Synthetic local user installation request'
          }}
        </option>
        <option value="enrollment_bind">
          {{
            locale === 'zh-CN'
              ? '模拟设备完成已授权注册（使用设备页 Enrollment ID）'
              : 'Synthetic completion of an authorized enrollment'
          }}
        </option>
        <option value="agent_binding">
          {{
            locale === 'zh-CN'
              ? '模拟已注册 Agent 的独立能力回报'
              : 'Synthetic independent Agent binding report'
          }}
        </option>
        <option value="bootstrap_continue">
          {{
            locale === 'zh-CN'
              ? '模拟本地用户继续来源策略动作'
              : 'Synthetic local consent for source policy action'
          }}
        </option>
        <option value="bootstrap_detect">
          {{
            locale === 'zh-CN'
              ? '模拟 Agent 安装检测 / 来源任务对账回报'
              : 'Synthetic Agent detection / source attempt reconciliation'
          }}
        </option>
        <option value="software_detect">
          {{
            locale === 'zh-CN'
              ? '模拟原任务的迟到检测证据'
              : 'Synthetic late detection for the original task'
          }}
        </option>
        <option value="software_reboot">
          {{ locale === 'zh-CN' ? '模拟重启后检测回报' : 'Synthetic detection after reboot' }}
        </option>
        <option value="security_result">
          {{
            locale === 'zh-CN'
              ? '模拟安全任务设备回执（不确认效果）'
              : 'Synthetic security command result (effect unverified)'
          }}
        </option>
        <option value="security_detect">
          {{
            locale === 'zh-CN'
              ? '模拟安全任务的独立补丁检测'
              : 'Independent synthetic security patch detection'
          }}
        </option>
      </select>
      <label for="demo-event-at">{{
        locale === 'zh-CN' ? '时间（Unix 秒，单向推进）' : 'Time (Unix seconds, advances only)'
      }}</label>
      <input id="demo-event-at" v-model.number="eventAt" type="number" min="0" />
      <label v-if="eventKind !== 'clock'" for="demo-event-device">{{
        locale === 'zh-CN' ? '设备 ID' : 'Device ID'
      }}</label>
      <input v-if="eventKind !== 'clock'" id="demo-event-device" v-model="eventDevice" />
      <template
        v-if="['software_detect', 'security_result', 'security_detect'].includes(eventKind)"
      >
        <label for="demo-event-task">{{
          locale === 'zh-CN' ? '原任务 ID（运行详情）' : 'Original task ID (run detail)'
        }}</label>
        <input id="demo-event-task" v-model="eventTask" />
      </template>
      <template v-if="eventKind === 'software_usage'">
        <label for="demo-event-resource">{{
          locale === 'zh-CN' ? '软件 Resource ID' : 'Software Resource ID'
        }}</label
        ><input id="demo-event-resource" v-model="eventResource" />
        <label
          ><input v-model="eventActive" type="checkbox" />{{
            locale === 'zh-CN' ? '该次采样观察到活跃使用' : 'Active use observed in this sample'
          }}</label
        >
      </template>
      <template v-if="eventKind === 'enrollment_bind'"
        ><label for="demo-enrollment">Enrollment ID</label
        ><input id="demo-enrollment" v-model="eventEnrollment"
      /></template>
      <label v-if="eventKind === 'agent_binding'"
        ><input v-model="eventActive" type="checkbox" />{{
          locale === 'zh-CN'
            ? '明确报告软件执行和注册指引能力'
            : 'Explicit software execution and enrollment guidance capabilities'
        }}</label
      >
      <template v-if="eventKind === 'software_request'"
        ><label for="demo-event-item">{{
          locale === 'zh-CN' ? '自助目录条目 ID' : 'Self-service item ID'
        }}</label
        ><input id="demo-event-item" v-model="eventItem"
      /></template>
      <button :disabled="busy || !authenticated.value" @click="simulate">
        {{ locale === 'zh-CN' ? '注入模拟事件' : 'Inject synthetic event' }}
      </button>
    </details>
  </aside>
</template>
