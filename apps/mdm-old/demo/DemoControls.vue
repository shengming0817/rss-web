<script setup lang="ts">
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VDialog,
  VExpansionPanel,
  VExpansionPanels,
  VExpansionPanelText,
  VExpansionPanelTitle,
  VSelect,
  VSpacer,
  VTextField,
} from 'vuetify/components'
import MdmSurface from '../src/ui/MdmSurface.vue'
import { useDialogFocus } from '../src/ui/dialog-focus'
import { computed, ref, watch, type Ref } from 'vue'
import type { HttpTransport } from '@rss/api/mdm'
import { useI18n } from 'vue-i18n'
import { scenarios } from './scenario'
import { record, enumeration, count } from '../src/services/decode'
import { moduleIds } from '../src/services/workspace'
const props = defineProps<{ transport: HttpTransport; authenticated: Readonly<Ref<boolean>> }>()
const { locale, t } = useI18n()
const overlays = ref<HTMLElement>()
// Keep menus in the theme surface, outside the select activator that handles mousedown.
const menuProps = computed(() => ({ attach: overlays.value }))
const controlsOpen = ref(false),
  resetOpen = ref(false)
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
          ...([
            'software_detect',
            'security_result',
            'security_detect',
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
    window.location.assign(reset ? '/login' : window.location.pathname)
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
function submitConfirmed() {
  resetOpen.value = false
  void apply(true)
}
const controlsTitle = computed(() => (locale.value === 'zh-CN' ? '演示控制' : 'Demo controls'))
const resetTitle = computed(() =>
  locale.value === 'zh-CN' ? '重置演示并退出' : 'Reset demo and sign out',
)
const eventOptions = computed(() => [
  { value: 'clock', title: locale.value === 'zh-CN' ? '服务端时钟推进' : 'Server clock tick' },
  {
    value: 'registration',
    title: locale.value === 'zh-CN' ? '模拟设备注册事件' : 'Synthetic registration event',
  },
  {
    value: 'check_in',
    title: locale.value === 'zh-CN' ? '模拟设备签入事件' : 'Synthetic check-in event',
  },
  {
    value: 'software_start',
    title:
      locale.value === 'zh-CN'
        ? '模拟本地用户继续安装'
        : 'Synthetic local user continues installation',
  },
  {
    value: 'enrollment_bind',
    title:
      locale.value === 'zh-CN'
        ? '模拟设备完成已授权注册（使用设备页 Enrollment ID）'
        : 'Synthetic completion of an authorized enrollment',
  },
  {
    value: 'agent_binding',
    title:
      locale.value === 'zh-CN'
        ? '模拟已注册 Agent 的独立能力回报'
        : 'Synthetic independent Agent binding report',
  },
  {
    value: 'software_detect',
    title:
      locale.value === 'zh-CN'
        ? '模拟原任务的迟到检测证据'
        : 'Synthetic late detection for the original task',
  },
  {
    value: 'software_reboot',
    title: locale.value === 'zh-CN' ? '模拟重启后检测回报' : 'Synthetic detection after reboot',
  },
  {
    value: 'security_result',
    title:
      locale.value === 'zh-CN'
        ? '模拟安全任务设备回执（不确认效果）'
        : 'Synthetic security command result (effect unverified)',
  },
  ...[
    'remote_consent',
    'remote_revoke',
    'remote_ended',
    'support_detect',
    'elevation_used',
    'elevation_ended',
    'elevation_revoked',
    'diagnostic_uploaded',
    'diagnostic_scanned',
  ].map((value) => ({ value, title: t(`security.supportEvents.${value}`) })),
  {
    value: 'security_detect',
    title:
      locale.value === 'zh-CN'
        ? '模拟安全任务的独立补丁检测'
        : 'Independent synthetic security patch detection',
  },
])
const restoreControlsFocus = useDialogFocus(controlsOpen)
const restoreResetFocus = useDialogFocus(resetOpen)
function setEventAt(value: string | number | null) {
  eventAt.value = value === '' || value === null ? '' : Number(value)
}
</script>
<template>
  <MdmSurface>
    <aside
      class="demo-controls-bar"
      :aria-label="locale === 'zh-CN' ? '模拟控制' : 'Mock controls'"
    >
      <strong
        >Mock ·
        {{
          locale === 'zh-CN'
            ? '纯合成数据；账户 demo 或 reviewer，密码 demo；不执行真实设备操作'
            : 'Synthetic data; accounts demo or reviewer, password demo; no real device actions'
        }}</strong
      >
      <v-btn type="button" variant="outlined" @click="controlsOpen = true">{{
        controlsTitle
      }}</v-btn>
    </aside>
    <v-dialog
      v-model="controlsOpen"
      :attach="overlays"
      :aria-label="controlsTitle"
      :data-state="controlsOpen ? 'open' : 'closed'"
      :persistent="busy"
      max-width="640"
      scrollable
      content-class="demo-controls-sheet"
      @after-leave="restoreControlsFocus"
    >
      <v-card :title="controlsTitle">
        <v-card-text class="demo-controls-form" :aria-busy="busy">
          <v-select
            id="demo-scenario"
            v-model="active"
            :menu-props="menuProps"
            :label="locale === 'zh-CN' ? '场景' : 'Scenario'"
            :items="scenarios.map((value) => ({ value, title: t(`mdm.scenarios.${value}`) }))"
            :disabled="busy"
          />
          <v-select
            id="demo-module"
            v-model="module"
            :menu-props="menuProps"
            :label="locale === 'zh-CN' ? '模块' : 'Module'"
            :items="moduleIds.map((value) => ({ value, title: t(`mdm.${value}`) }))"
            :disabled="busy"
          />
          <v-select
            id="demo-source"
            v-model="source"
            :menu-props="menuProps"
            :label="
              locale === 'zh-CN'
                ? '来源（真实接口未接入时显示不可用）'
                : 'Source (unconnected live API stays unavailable)'
            "
            :items="[
              { value: 'mock', title: t('mdm.mock') },
              { value: 'real', title: t('mdm.real') },
            ]"
            :disabled="busy"
          />
          <p>
            {{
              locale === 'zh-CN'
                ? '配置、软件、安全与运营共用执行、审批和审计，来源会一起切换。'
                : 'Configuration, software, security and operations share execution, approval and audit records; their sources switch together.'
            }}
          </p>
          <div class="demo-controls-actions">
            <v-btn type="button" :disabled="busy || !authenticated.value" @click="apply(false)">{{
              locale === 'zh-CN' ? '应用' : 'Apply'
            }}</v-btn>
            <v-btn
              type="button"
              variant="outlined"
              :disabled="busy || !authenticated.value"
              @click="resetOpen = true"
              >{{ locale === 'zh-CN' ? '重置演示' : 'Reset demo' }}</v-btn
            >
          </div>
          <v-alert v-if="failed" type="error" variant="tonal" role="alert">
            {{
              locale === 'zh-CN'
                ? '未确认模拟操作生效，请检查目标、状态和时间，或服务是否可用。'
                : 'Demo operation is unconfirmed. Check the target, state, time and service availability.'
            }}
          </v-alert>
          <v-expansion-panels>
            <v-expansion-panel>
              <v-expansion-panel-title>{{
                locale === 'zh-CN'
                  ? '模拟自动化触发事件（先登录并启用策略或工作流）'
                  : 'Simulate automation events (sign in and enable a policy first)'
              }}</v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="demo-event-form">
                  <v-select
                    id="demo-event-kind"
                    v-model="eventKind"
                    :menu-props="menuProps"
                    :label="locale === 'zh-CN' ? '事件' : 'Event'"
                    :items="eventOptions"
                    :disabled="busy"
                  />
                  <v-text-field
                    id="demo-event-at"
                    :model-value="eventAt"
                    :label="
                      locale === 'zh-CN'
                        ? '时间（Unix 秒；留空使用提交时的模拟时间 + 1 秒）'
                        : 'Time (Unix seconds; blank uses current demo time + 1 second)'
                    "
                    type="number"
                    min="0"
                    :disabled="busy"
                    @update:model-value="setEventAt"
                  />
                  <v-text-field
                    v-if="eventKind !== 'clock'"
                    id="demo-event-device"
                    v-model="eventDevice"
                    :label="locale === 'zh-CN' ? '设备 ID' : 'Device ID'"
                    :disabled="busy"
                  />
                  <v-text-field
                    v-if="
                      [
                        'software_detect',
                        'security_result',
                        'security_detect',
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
                    id="demo-event-task"
                    v-model="eventTask"
                    :label="
                      ['remote_consent', 'remote_revoke'].includes(eventKind)
                        ? locale === 'zh-CN'
                          ? '申请 ID（远程支持申请）'
                          : 'Request ID (remote support request)'
                        : locale === 'zh-CN'
                          ? '原任务 ID（运行详情）'
                          : 'Original task ID (run detail)'
                    "
                    :disabled="busy"
                  />
                  <v-text-field
                    v-if="eventKind === 'enrollment_bind'"
                    id="demo-enrollment"
                    v-model="eventEnrollment"
                    label="Enrollment ID"
                    :disabled="busy"
                  />
                  <v-checkbox
                    v-if="eventKind === 'remote_consent'"
                    v-model="eventActive"
                    :label="t('security.consentChoice')"
                    :disabled="busy"
                  />
                  <v-checkbox
                    v-if="eventKind === 'agent_binding'"
                    v-model="eventActive"
                    :label="
                      locale === 'zh-CN'
                        ? '明确报告软件执行和注册指引能力'
                        : 'Explicit software execution and enrollment guidance capabilities'
                    "
                    :disabled="busy"
                  />
                  <v-btn type="button" :disabled="busy || !authenticated.value" @click="simulate">{{
                    locale === 'zh-CN' ? '注入模拟事件' : 'Inject synthetic event'
                  }}</v-btn>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
        <v-card-actions
          ><v-spacer /><v-btn
            type="button"
            variant="text"
            :disabled="busy"
            @click="controlsOpen = false"
            >{{ t('console.close') }}</v-btn
          ></v-card-actions
        >
      </v-card>
    </v-dialog>
    <v-dialog
      v-model="resetOpen"
      :attach="overlays"
      role="alertdialog"
      :aria-label="resetTitle"
      aria-describedby="demo-reset-description"
      :data-state="resetOpen ? 'open' : 'closed'"
      :persistent="busy"
      @after-leave="restoreResetFocus"
    >
      <v-card :title="resetTitle">
        <v-card-text id="demo-reset-description">{{
          locale === 'zh-CN'
            ? '清空当前合成场景进度并返回演示登录。'
            : 'Clears the synthetic scenario and returns to demo sign-in.'
        }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn type="button" variant="text" :disabled="busy" @click="resetOpen = false">{{
            t('console.close')
          }}</v-btn>
          <v-btn type="button" :disabled="busy" @click="submitConfirmed">{{
            t('identity.confirm')
          }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <div ref="overlays" class="demo-controls-overlays"></div>
  </MdmSurface>
</template>

<style scoped>
.demo-controls-bar {
  position: fixed;
  bottom: 10px;
  right: 12px;
  z-index: 30;
  max-width: min(580px, calc(100vw - 24px));
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-raised);
  color: var(--fg-muted);
  font: 11px var(--font-sans);
  box-shadow: var(--shadow-sm);
}
.demo-controls-form,
.demo-event-form {
  display: grid;
  align-content: start;
  gap: 12px;
}
.demo-controls-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
:deep(.v-dialog > .v-overlay__content.demo-controls-sheet) {
  top: 0;
  right: 0;
  margin: 0;
  height: 100dvh;
  max-height: 100dvh;
  width: min(640px, 100vw);
}
</style>
