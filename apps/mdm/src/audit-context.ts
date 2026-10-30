import {
  validateActivityQuery,
  validateAuditQuery,
  type ActivityQuery,
  type AuditQuery,
} from '@rss/mdm-audit'

export type AuditView = 'audit' | 'timeline' | 'activities'
export interface AuditContext extends AuditQuery, ActivityQuery {
  readonly view: AuditView
  readonly activity?: string | undefined
}
const auditFields = [
  'targetId',
  'targetType',
  'device',
  'operationId',
  'actor',
  'action',
  'outcome',
  'from',
  'until',
  'limit',
  'cursor',
] as const
const activityFields = [
  'source',
  'kind',
  'status',
  'policy',
  'request',
  'batch',
  'task',
  'operation',
  'related',
  'from',
  'until',
  'limit',
  'cursor',
] as const
const publicFields: readonly string[] = [
  ...new Set([...auditFields, ...activityFields, 'view', 'activity']),
]
function selected(context: AuditContext, fields: readonly string[]) {
  return Object.fromEntries(
    Object.entries(context).filter(
      ([key, value]) => fields.includes(key) && value !== undefined && value !== '',
    ),
  )
}
export function factQuery(context: AuditContext): AuditQuery {
  const result = selected(context, auditFields) as AuditQuery
  validateAuditQuery(result)
  return result
}
export function activityQuery(context: AuditContext): ActivityQuery {
  const result = selected(context, activityFields) as ActivityQuery
  validateActivityQuery(result)
  return result
}
/** Public locators only. Values from the URL never establish authority. */
export function readAuditContext(
  params: URLSearchParams,
  fallback: AuditView = 'audit',
): AuditContext {
  const values: Record<string, string | number> = { view: fallback }
  for (const key of publicFields) {
    const value = params.get(key)
    if (value === null || value === '') continue
    if (['from', 'until', 'limit'].includes(key)) {
      const number = Number(value)
      if (!Number.isSafeInteger(number) || !/^\d+$/.test(value))
        throw new Error('Invalid audit query number')
      values[key] = number
    } else values[key] = value
  }
  if (!['audit', 'timeline', 'activities'].includes(String(values['view'])))
    throw new Error('Invalid audit view')
  const context = values as unknown as AuditContext
  factQuery(context)
  activityQuery(context)
  return context
}
export function auditHref(context: Partial<AuditContext> = {}): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(context))
    if (publicFields.includes(key) && value !== undefined && value !== '')
      query.set(key, String(value))
  const search = query.toString()
  return '/audit' + (search ? '?' + search : '')
}
export function auditFirstPage(context: AuditContext): AuditContext {
  const { cursor, activity, ...rest } = context
  void cursor
  void activity
  return rest
}
export function localDate(seconds: number | undefined): string {
  if (seconds === undefined) return ''
  const value = new Date(seconds * 1000),
    pad = (n: number) => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}
export function recordedTime(value: string | undefined): number | undefined {
  if (!value) return undefined
  const seconds = new Date(value).getTime() / 1000
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Invalid recording time')
  return seconds
}
