<script setup lang="ts">
import { ref, watch, type Ref } from 'vue'
import type { HttpTransport } from '@rss/api/mdm'
import { useI18n } from 'vue-i18n'
import { scenarios, TENANT } from './scenario'
import { record, enumeration, count } from '../src/services/decode'
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
      path: '/api/v1/mdm-candidate/workspace/scenario',
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
  eventAt = ref<number | ''>(''),
  eventDevice = ref('device-01'),
  eventResource = ref(''),
  eventTask = ref(''),
  eventEnrollment = ref(''),
  eventActive = ref(true)
async function simulate() {
  if (busy.value) return
  busy.value = true
  failed.value = false
  try {
    const at =
      eventAt.value === ''
        ? (
            await props.transport.request({
              method: 'GET',
              path: '/api/v1/mdm-candidate/workspace/scenario',
              successStatus: 200,
              decode: (value) => ({ asOf: count(record(value)['asOf']) }),
            })
          ).asOf + 1
        : eventAt.value
    await props.transport.request({
      method: 'POST',
      path: '/api/v1/mdm-candidate/workspace/scenario',
      body: {
        event: {
          kind: eventKind.value,
          at,
          ...(eventKind.value !== 'clock' ? { device: eventDevice.value } : {}),
          ...(eventKind.value === 'software_usage'
            ? { resource: eventResource.value, active: eventActive.value }
            : {}),
          ...([
            'software_detect',
            'security_result',
            'security_detect',
            'material_detect',
            'certificate_issued',
            'certificate_detect',
            'remote_consent',
            'remote_revoke',
            'remote_ended',
            'support_detect',
            'elevation_used',
            'elevation_ended',
            'elevation_revoked',
            'diagnostic_uploaded',
            'diagnostic_scanned',
          ].includes(eventKind.value)
            ? { task: eventTask.value }
            : {}),
          ...(eventKind.value === 'enrollment_bind' ? { enrollment: eventEnrollment.value } : {}),
          ...(['agent_binding', 'remote_consent'].includes(eventKind.value)
            ? { active: eventActive.value }
            : {}),
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
      path: '/api/v1/mdm-candidate/workspace/scenario',
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
      {{
        locale === 'zh-CN'
          ? '未确认模拟操作生效，请检查目标、状态和时间，或服务是否可用。'
          : 'Demo operation is unconfirmed. Check the target, state, time and service availability.'
      }}
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
        <option value="certificate_issued">{{ t('security.demoCertificateIssued') }}</option>
        <option value="remote_consent">{{ t('security.supportEvents.remote_consent') }}</option>
        <option value="remote_revoke">{{ t('security.supportEvents.remote_revoke') }}</option>
        <option value="remote_ended">{{ t('security.supportEvents.remote_ended') }}</option>
        <option value="support_detect">{{ t('security.supportEvents.support_detect') }}</option>
        <option value="elevation_used">{{ t('security.supportEvents.elevation_used') }}</option>
        <option value="elevation_ended">{{ t('security.supportEvents.elevation_ended') }}</option>
        <option value="elevation_revoked">
          {{ t('security.supportEvents.elevation_revoked') }}
        </option>
        <option value="diagnostic_uploaded">
          {{ t('security.supportEvents.diagnostic_uploaded') }}
        </option>
        <option value="diagnostic_scanned">
          {{ t('security.supportEvents.diagnostic_scanned') }}
        </option>
        <option value="certificate_detect">{{ t('security.demoCertificateDetected') }}</option>
        <option value="material_detect">
          {{
            locale === 'zh-CN'
              ? '模拟新材料独立托管观测'
              : 'Independent synthetic material escrow observation'
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
        locale === 'zh-CN'
          ? '时间（Unix 秒；留空使用提交时的模拟时间 + 1 秒）'
          : 'Time (Unix seconds; blank uses current demo time + 1 second)'
      }}</label>
      <input id="demo-event-at" v-model.number="eventAt" type="number" min="0" />
      <label v-if="eventKind !== 'clock'" for="demo-event-device">{{
        locale === 'zh-CN' ? '设备 ID' : 'Device ID'
      }}</label>
      <input v-if="eventKind !== 'clock'" id="demo-event-device" v-model="eventDevice" />
      <template
        v-if="
          [
            'software_detect',
            'security_result',
            'security_detect',
            'material_detect',
            'certificate_issued',
            'certificate_detect',
            'remote_consent',
            'remote_revoke',
            'remote_ended',
            'support_detect',
            'elevation_used',
            'elevation_ended',
            'elevation_revoked',
            'diagnostic_uploaded',
            'diagnostic_scanned',
          ].includes(eventKind)
        "
      >
        <label for="demo-event-task">{{
          ['remote_consent', 'remote_revoke'].includes(eventKind)
            ? locale === 'zh-CN'
              ? '申请 ID（远程支持申请）'
              : 'Request ID (remote support request)'
            : locale === 'zh-CN'
              ? '原任务 ID（运行详情）'
              : 'Original task ID (run detail)'
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
      <label v-if="eventKind === 'remote_consent'"
        ><input v-model="eventActive" type="checkbox" />{{ t('security.consentChoice') }}</label
      >
      <label v-if="eventKind === 'agent_binding'"
        ><input v-model="eventActive" type="checkbox" />{{
          locale === 'zh-CN'
            ? '明确报告软件执行和注册指引能力'
            : 'Explicit software execution and enrollment guidance capabilities'
        }}</label
      >
      <button :disabled="busy || !authenticated.value" @click="simulate">
        {{ locale === 'zh-CN' ? '注入模拟事件' : 'Inject synthetic event' }}
      </button>
    </details>
  </aside>
</template>
