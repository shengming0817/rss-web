import { Tag } from 'antd'
import type { FieldState, Scalar } from '@rss/mdm-devices'
import type { Locale } from './i18n'
import { labels } from './AdminUi'
const names: Record<string, readonly [string, string]> = {
  active: ['有效', 'Active'],
  pending: ['待处理', 'Pending'],
  revoked: ['已撤销', 'Revoked'],
  superseded: ['已替代', 'Superseded'],
  registered: ['已登记', 'Registered'],
  cancelled: ['已取消', 'Cancelled'],
  expired: ['已过期', 'Expired'],
  bound: ['已绑定注册', 'Registration bound'],
  confirmed: ['已确认', 'Confirmed'],
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
