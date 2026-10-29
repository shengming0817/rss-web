// Locator only. Native registration and authorization belong to the Agent.
import { closed, enumeration, identifier, uuid } from './decode'
import { toolName } from '../features/policies/clients/addressing'
import { policyName } from '../features/policies/clients/model'
interface Context {
  instance: string
  tenant: string
}
export type DeepLink = Context &
  (
    | ({ kind: 'policy' } & ({ id: string } | { toolName: string } | { alias: string }))
    | { kind: 'event'; event: string; device?: string }
    | { kind: 'batch'; device: string; batch: string }
    | { kind: 'task'; device: string; task: string }
    | { kind: 'step'; device: string; task: string; attempt: string; step: string; version: string }
  )
function locator(value: unknown) {
  const text = identifier(value)
  if (text.length > 256 || /[\s/\\:#?@]/u.test(text)) throw new Error('Invalid locator')
  return text
}
function fields(value: unknown) {
  const raw = value as Record<string, unknown>
  const kind = enumeration(raw['kind'], ['policy', 'event', 'batch', 'task', 'step'] as const)
  const result: Record<string, string> = {
    instance: uuid(raw['instance']),
    tenant: uuid(raw['tenant']),
  }
  if (kind === 'policy') {
    const selector = ['id', 'toolName', 'alias'].filter((key) => key in raw)
    if (selector.length !== 1) throw new Error('Ambiguous Policy locator')
    closed(raw, ['kind', 'instance', 'tenant', selector[0]!])
    const key = selector[0]!
    result[key] =
      key === 'id' ? uuid(raw[key]) : key === 'toolName' ? toolName(raw[key]) : policyName(raw[key])
  } else if (kind === 'event') {
    closed(raw, ['kind', 'instance', 'tenant', 'event'], ['device'])
    result['event'] = policyName(raw['event'])
    if ('device' in raw) result['device'] = locator(raw['device'])
  } else {
    const keys =
      kind === 'batch'
        ? ['batch']
        : kind === 'task'
          ? ['task']
          : ['task', 'attempt', 'step', 'version']
    closed(raw, ['kind', 'instance', 'tenant', 'device', ...keys])
    result['device'] = locator(raw['device'])
    for (const key of keys) result[key] = key === 'step' ? locator(raw[key]) : uuid(raw[key])
  }
  return { kind, result }
}
export function deepLink(value: DeepLink): string {
  const { kind, result } = fields(value)
  const url = new URL(`rssmdm://open/v1/${kind}`)
  url.search = new URLSearchParams(result).toString()
  if (url.href.length > 4096) throw new Error('Link too long')
  return url.href
}
export function parseDeepLink(text: string): DeepLink {
  if (text.length > 4096 || /\s/u.test(text) || /%(?![a-fA-F0-9]{2})/u.test(text))
    throw new Error('Invalid link')
  const url = new URL(text)
  if (url.protocol !== 'rssmdm:' || url.host !== 'open' || url.username || url.password || url.hash)
    throw new Error('Invalid link origin')
  if (!/^\/v1\/(policy|event|batch|task|step)$/.test(url.pathname))
    throw new Error('Invalid link path')
  // Reject malformed UTF-8 instead of URLSearchParams' replacement-character repair.
  decodeURIComponent(url.search.replaceAll('+', '%20'))
  const raw: Record<string, string> = { kind: url.pathname.slice(4) }
  for (const [key, value] of url.searchParams) {
    if (key in raw) throw new Error('Repeated link field')
    raw[key] = value
  }
  const { kind, result } = fields(raw)
  return { kind, ...result } as DeepLink
}
