import { identityI18n } from '@rss/auth'
import { policiesZh, policiesEn } from './features/policies/i18n'
import { devicesZh, devicesEn } from './features/devices/i18n'
const zh = {
  scenarios: {
    normal: '正常',
    empty: '空数据',
    forbidden: '查询被拒',
    denied: '无模块入口',
    offline: '服务离线',
    unsupported: '不支持',
    partial: '部分结果',
    conflict: '版本冲突',
    unknown: '提交结果未知',
    late: '迟到响应',
  },
  home: '管理工作区',
  title: '企业终端管理',
  intro: '管理 Windows 与 macOS 设备。受理、设备回执、实际效果与合规分别呈现。',
  source: '数据来源',
  real: '真实接口',
  mock: 'Mock · 仅模拟',
  unavailable: '当前无法读取导航。不会回退模拟数据。',
  unknown: '导航未知',
  unknownSource: '来源未知',
  queryDenied: '工作区查询被拒绝。请联系管理员核实权限。',
  denied: '无访问入口',
  planned: '业务模块尚未交付',
  open: '打开',
  reload: '重新读取',
  devices: '设备与资产',
  policies: '配置与执行',
  security: '安全与支持',
  operations: '权限与运营',
  boundary: '导航仅为展示提示，真实权限由后端判定。Mock 不证明设备效果或生产能力。',
}
const en: typeof zh = {
  scenarios: {
    normal: 'Normal',
    empty: 'Empty',
    forbidden: 'Query denied',
    denied: 'No module entry',
    offline: 'Service offline',
    unsupported: 'Unsupported',
    partial: 'Partial results',
    conflict: 'Revision conflict',
    unknown: 'Unknown submission result',
    late: 'Late response',
  },
  home: 'Workspace',
  title: 'Enterprise device management',
  intro:
    'Manage Windows and macOS devices. Acceptance, receipt, effect and compliance remain separate facts.',
  source: 'Data source',
  real: 'Live API',
  mock: 'Mock · simulation only',
  unavailable: 'Navigation is unavailable. Live failures never fall back to simulated data.',
  unknown: 'Navigation unknown',
  unknownSource: 'Source unknown',
  queryDenied: 'Workspace query denied. Ask an administrator to verify access.',
  denied: 'No entry available',
  planned: 'Feature not delivered yet',
  open: 'Open',
  reload: 'Reload',
  devices: 'Devices & assets',
  policies: 'Configuration & execution',
  security: 'Security & support',
  operations: 'Authorization & operations',
  boundary:
    'Navigation is a display hint; the server enforces authorization. Mock data proves neither device effects nor production capability.',
}
export function mdmI18n() {
  const i18n = identityI18n()
  i18n.global.mergeLocaleMessage('zh-CN', { mdm: zh })
  i18n.global.mergeLocaleMessage('en-US', { mdm: en })
  i18n.global.mergeLocaleMessage('zh-CN', { devices: devicesZh })
  i18n.global.mergeLocaleMessage('en-US', { devices: devicesEn })
  i18n.global.mergeLocaleMessage('zh-CN', { policies: policiesZh })
  i18n.global.mergeLocaleMessage('en-US', { policies: policiesEn })
  return i18n
}
