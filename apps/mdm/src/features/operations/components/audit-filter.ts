import { auditQuery, type AuditQuery } from '../clients/audit'
export interface AuditDraft {
  actor: string
  action: string
  targetId: string
  targetType: string
  device: string
  operationId: string
  outcome: NonNullable<AuditQuery['outcome']> | ''
  bounded: boolean
  from: number
  until: number
}
export function auditDraft(query: Record<string, unknown> = {}): AuditDraft {
  const text = (key: string) => (typeof query[key] === 'string' ? query[key] : '')
  return {
    actor: text('actor'),
    action: text('action'),
    targetId: text('targetId'),
    targetType: text('targetType'),
    device: text('device'),
    operationId: text('operationId'),
    outcome: '',
    bounded: false,
    from: Math.floor(Date.now() / 1000) - 86400,
    until: Math.floor(Date.now() / 1000),
  }
}
export function auditFilter(draft: AuditDraft, deviceTimeline = false): AuditQuery {
  return auditQuery({
    ...(draft.actor ? { actor: draft.actor } : {}),
    ...(draft.action ? { action: draft.action } : {}),
    ...(draft.targetId ? { targetId: draft.targetId } : {}),
    ...(draft.targetType ? { targetType: draft.targetType } : {}),
    ...(!deviceTimeline && draft.device ? { device: draft.device } : {}),
    ...(draft.operationId ? { operationId: draft.operationId } : {}),
    ...(draft.outcome ? { outcome: draft.outcome } : {}),
    ...(draft.bounded ? { from: draft.from, until: draft.until } : {}),
  })
}
