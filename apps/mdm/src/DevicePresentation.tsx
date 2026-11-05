import { Tag } from 'antd'
import type { FieldState, Scalar } from '@rss/mdm-devices'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
const names: Record<string, readonly [string, string]> = {
  idle: ['尚未验证此用途', 'This purpose has not been verified'],
  not_started: ['尚未开始', 'Not started'],
  waiting_reboot: ['等待重启', 'Waiting for reboot'],
  enrollment: ['注册任务', 'Enrollment task'],
  credential: ['凭据任务', 'Credential task'],
  access: ['Device Access', 'Device Access'],
  software: ['软件任务', 'Software task'],
  device: ['设备任务', 'Device task'],
  native: ['原生通道', 'Native channel'],
  action_run: ['任务运行', 'Task run'],
  command: ['原生命令', 'Native command'],
  collection: ['采集', 'Collection'],
  script: ['脚本', 'Script'],
  eligible: ['资格满足', 'Eligible'],
  excluded: ['已排除', 'Excluded'],
  channel_unknown: ['通道事实未知', 'Channel facts unknown'],
  channel_unavailable: ['通道不可用', 'Channel unavailable'],
  outside_window: ['等待执行窗口', 'Waiting for execution window'],
  outside_scope: ['不在当前范围', 'Outside current scope'],
  scope_pending: ['等待范围计算', 'Waiting for scope calculation'],
  outside_stage: ['不在当前阶段', 'Outside current stage'],
  scheduled: ['等待计划条件', 'Waiting for schedule'],
  success_gate: ['等待成功门槛', 'Waiting for success gate'],
  missing_registration: ['缺少当前注册', 'No current registration'],
  ambiguous_registration: ['注册坐标不唯一', 'Ambiguous registration'],
  unsupported_capability: ['能力不支持', 'Capability unsupported'],
  missing_variant: ['缺少匹配变体', 'No matching variant'],
  authorization_withdrawn: ['执行授权已撤回', 'Execution authorization withdrawn'],
  permission_withdrawn: ['提交权限已撤回', 'Submission permission withdrawn'],
  projection_pending: ['等待事实投影', 'Waiting for projection'],
  already_satisfied: ['当前期望已满足', 'Desired state already satisfied'],
  organization_conflict: ['组织关联冲突', 'Organization association conflict'],
  missing_native_rights: ['缺少原生管理权限', 'Native management rights missing'],
  missing_architecture: ['架构事实未知', 'Architecture unknown'],
  installation_pending: ['等待安装结算', 'Installation settlement pending'],
  recovery_observation_pending: ['等待恢复观察', 'Recovery observation pending'],
  recovery_retry_exhausted: ['恢复重试已耗尽', 'Recovery retries exhausted'],
  mdm_software_disabled: ['原生软件管理未启用', 'Native software management disabled'],
  waiting_check_in: ['等待设备签入', 'Waiting for device check-in'],
  waiting_trigger: ['等待触发事件', 'Waiting for trigger'],
  interval_not_elapsed: ['触发间隔尚未满足', 'Trigger interval not elapsed'],
  execution_pending: ['已有执行待结算', 'Execution pending'],
  frequency_consumed: ['当前频率资格已使用', 'Frequency eligibility consumed'],
  effect_unknown: ['效果未知', 'Effect unknown'],
  capacity_busy: ['当前容量忙', 'Capacity busy'],
  schedule_ended: ['计划已结束', 'Schedule ended'],
  input_required: ['需要输入', 'Input required'],
  lifecycle_blocked: ['生命周期阻断', 'Lifecycle blocked'],
  report_source_unavailable: ['报告来源不可用', 'Report source unavailable'],

  active: ['有效', 'Active'],
  pending: ['待处理', 'Pending'],
  prepared: ['已准备', 'Prepared'],
  verify_only: ['仅验证旧证书', 'Verify existing certificates only'],
  distributing: ['已受理分发', 'Distribution accepted'],
  activated: ['已激活代次', 'Generation activated'],
  retired: ['已退休', 'Retired'],
  received: ['已接收', 'Received'],
  applied: ['已应用', 'Applied'],
  none: ['尚未提交', 'Not submitted'],
  valid: ['有效期内', 'Within validity'],
  expiring: ['即将到期', 'Expiring'],
  not_yet_valid: ['尚未生效', 'Not yet valid'],
  unparsed: ['未解析材料', 'Unparsed material'],
  request: ['证书申请', 'Certificate request'],
  key: ['密钥材料', 'Key material'],
  consumed: ['已消费', 'Consumed'],
  cancellation_unconfirmed: ['取消未确认', 'Cancellation unconfirmed'],
  cancelling: ['正在取消', 'Cancelling'],
  challenging: ['等待用途验证', 'Awaiting purpose verification'],
  authorized: ['用途验证已完成', 'Purpose verified'],
  denied: ['认证被拒绝', 'Authentication denied'],
  revoked: ['已撤销', 'Revoked'],
  superseded: ['已替代', 'Superseded'],
  registered: ['已登记', 'Registered'],
  cancelled: ['已取消', 'Cancelled'],
  expired: ['已过期', 'Expired'],
  bound: ['已绑定注册', 'Registration bound'],
  confirmed: ['已确认', 'Confirmed'],
  unconfirmed: ['尚未确认', 'Unconfirmed'],
  publishing: ['投递中', 'Publishing'],
  dead_letter: ['死信', 'Dead letter'],
  enabled: ['已启用', 'Enabled'],
  needs_verification: ['需重新核验', 'Needs verification'],
  unknown: ['未知', 'Unknown'],
  unconfigured: ['未配置', 'Unconfigured'],
  fault: ['故障', 'Fault'],
  ready: ['就绪', 'Ready'],
  allowed: ['允许新注册', 'New enrollment allowed'],
  paused: ['新注册已暂停', 'New enrollment paused'],
  known: ['已知', 'Known'],
  conflict: ['数据冲突', 'Conflicting observations'],
  missing: ['未上报', 'Missing'],
  unsupported: ['不支持', 'Unsupported'],
  deleted: ['已删除', 'Deleted'],
  null: ['空值', 'Null'],
  archived: ['已归档', 'Archived'],
  mdm: ['MDM', 'MDM'],
  agent: ['Agent', 'Agent'],
  windows: ['Windows', 'Windows'],
  macos: ['macOS', 'macOS'],
  unbound: ['未绑定', 'Unbound'],
  invalidated: ['绑定已失效', 'Binding invalidated'],
  unavailable: ['不可用', 'Unavailable'],
  available: ['可用', 'Available'],
  cleanup: ['清理中', 'Cleanup'],
  unenroll: ['原生退管', 'Native unenrollment'],
  revoke: ['撤销注册', 'Revoke registration'],
  complete: ['已完成', 'Complete'],
  blocked: ['受阻', 'Blocked'],
  normal: ['正常', 'Normal'],
  qualified: ['资格通过', 'Qualified'],
  rejected: ['已拒绝', 'Rejected'],
  requested: ['已请求', 'Requested'],
  preparing: ['准备中', 'Preparing'],
  committed: ['已提交切换', 'Cutover committed'],
  submitting: ['提交中', 'Submitting'],
  accepted: ['已接受', 'Accepted'],
  failed: ['失败', 'Failed'],
  succeeded: ['成功', 'Succeeded'],
  awaiting_certificate: ['等待证书', 'Awaiting certificate'],
  validated: ['已校验', 'Validated'],
  pending_application: ['等待应用', 'Awaiting application'],
  disabled: ['未启用', 'Disabled'],
  waiting: ['等待就绪', 'Waiting'],
  degraded: ['运行降级', 'Degraded'],
  verified: ['已验证', 'Verified'],
  unverified: ['未验证', 'Unverified'],
  invalid: ['无效', 'Invalid'],
  current: ['当前', 'Current'],
  running: ['运行中', 'Running'],
  completed: ['已完成', 'Completed'],
  evaluating: ['评估中', 'Evaluating'],
  queued: ['已排队', 'Queued'],
  published: ['已发布', 'Published'],
  projected: ['已投影', 'Projected'],
  pending_receipt: ['等待回执', 'Pending receipt'],
  snapshot: ['快照', 'Snapshot'],
  partial: ['部分结果', 'Partial result'],
  compliant: ['合规', 'Compliant'],
  non_compliant: ['不合规', 'Non-compliant'],
  not_applicable: ['不适用', 'Not applicable'],
  match: ['匹配', 'Match'],
  no_match: ['不匹配', 'No match'],
  success: ['成功', 'Success'],
}
export function statusText(locale: Locale, value: string): string {
  const name = names[value]
  return name ? labels(locale)(name[0], name[1]) : value
}
export function Status({ value, locale }: { value: string; locale: Locale }) {
  return (
    <Tag
      color={
        ['fault', 'conflict', 'blocked', 'revoked', 'expired'].includes(value)
          ? 'error'
          : ['pending', 'unknown', 'paused', 'needs_verification'].includes(value)
            ? 'warning'
            : 'default'
      }
    >
      {statusText(locale, value)}
    </Tag>
  )
}
export function timestamp(locale: Locale, value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : new Date(value * 1000).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
}
export function ScalarValue({ value }: { value: Scalar }) {
  if (value.kind === 'array')
    return (
      <ul className="device-values">
        {value.value.map((item, index) => (
          <li key={index}>
            <ScalarValue value={item} />
          </li>
        ))}
      </ul>
    )
  if (value.kind === 'object')
    return (
      <dl className="device-values">
        {Object.entries(value.value).map(([key, item]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <ScalarValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    )
  return <span>{String(value.value)}</span>
}
export function FieldValue({ value, locale }: { value: FieldState | undefined; locale: Locale }) {
  return value?.kind === 'known' ? (
    <ScalarValue value={value.value} />
  ) : (
    <Status value={value?.kind ?? 'missing'} locale={locale} />
  )
}
export function deviceName(value: FieldState | undefined, fallback: string): string {
  return value?.kind === 'known' && value.value.kind === 'string' ? value.value.value : fallback
}
