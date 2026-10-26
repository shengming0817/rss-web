import { isRssApiError } from '@rss/api/identity'
import { CapabilityUnavailable } from '@rss/device-access/model'
export function errorMessage(e: unknown): string {
  if (e instanceof CapabilityUnavailable)
    return '当前能力尚未接入。演示入口提供明确标识的接口数据。'
  if (isRssApiError(e)) {
    if (e.status === 401) return '会话已失效，请重新登录。'
    if (e.code === 'reauthentication_required' || e.code === 'reauthentication_failed')
      return '需要重新认证。完成认证后请明确提交，不会自动重试。'
    if (e.status === 403) return '当前账号没有此操作权限。'
    if (e.status === 409) return '内容已变化，请读取当前值并重新核对。'
    if (e.status === 404) return '没有找到已授权的对象；这不能证明原写入失败。'
    if (e.status === 400) return '输入或当前操作条件不符合要求。'
    if (e.cause === 'aborted') return '操作已取消；已发出的写入结果仍需核对。'
  }
  if (e instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(e.name))
    return '浏览器认证已取消、拒绝或过期。'
  return '暂时无法确认结果。请重新读取；写操作不会自动重放。'
}
export function uncertain(e: unknown) {
  return !isRssApiError(e) || e.cause !== 'wire' || !e.status || e.status >= 500
}
export function needsProof(e: unknown) {
  return (
    isRssApiError(e) && ['reauthentication_required', 'reauthentication_failed'].includes(e.code)
  )
}
export function utc(v: number | null) {
  return v === null
    ? '未观察'
    : new Date(v * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
}
export function label(v: string | null) {
  if (v === null) return '未观察'
  const labels: Record<string, string> = {
    unknown: '未知',
    pending: '等待',
    accepted: '已受理',
    completed: '操作已完成',
    active: '活跃',
    revoked: '已撤销',
    applied: '已应用',
    unbound: '已解除',
    present: '已观察具备',
    absent: '已观察不具备',
    needs_administrator: '需要本机管理员',
    synced: '已同步',
    local_only: '仅本机',
    verified: '已核验',
    unverified: '待核验',
    superseded: '已替代',
    draft: '草稿',
    published: '已发布',
    standard: '普通用户',
    administrator: '管理员',
    preserve: '保持已有权限',
    native_key: '平台密钥',
    password: '密码',
    windows: 'Windows',
    macos: 'macOS',
    failed: '失败',
    registered: '已注册',
    cancelled: '已取消',
    expired: '已过期',
  }
  return labels[v] ?? v
}
