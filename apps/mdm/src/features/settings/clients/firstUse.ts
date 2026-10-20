import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { decodeCatalog } from './catalog'
import { operationReceipt, positive } from './value'

export const channels = ['agent', 'windows_mdm', 'macos_mdm'] as const
export const capabilities = [
  'agent_package',
  'task_signing',
  'windows_push',
  'apple_ade',
  'apple_account',
  'oidc',
  'smtp',
  's3',
  'webhook',
  'recovery_credentials',
] as const
export type Channel = (typeof channels)[number]
export type Capability = (typeof capabilities)[number]
export type Decision = { kind: 'configure' } | { kind: 'skip'; reason: string }
export interface FirstUseIntent {
  channels: Channel[]
  capabilities: Partial<Record<Capability, Decision>>
  completionRequested: boolean
}
const capabilityChannel: Partial<Record<Capability, Channel>> = {
  agent_package: 'agent',
  task_signing: 'agent',
  windows_push: 'windows_mdm',
  apple_ade: 'macos_mdm',
  apple_account: 'macos_mdm',
}
export function decodeIntent(value: unknown): FirstUseIntent {
  const v = closed(value, ['channels', 'capabilities', 'completionRequested'])
  const selected = unique(
    array(v['channels'], (x) => enumeration(x, channels)),
    (x) => x,
  )
  const decisions: FirstUseIntent['capabilities'] = {}
  for (const [name, value] of Object.entries(record(v['capabilities']))) {
    const key = enumeration(name, capabilities),
      kind = enumeration(record(value)['kind'], ['configure', 'skip'] as const)
    if (kind === 'configure') {
      closed(value, ['kind'])
      if (capabilityChannel[key] && !selected.includes(capabilityChannel[key]))
        throw new Error('Capability requires its channel')
      decisions[key] = { kind }
    } else {
      const d = closed(value, ['kind', 'reason']),
        reason = string(d['reason'])
      if (!reason.trim() || new TextEncoder().encode(reason).length > 1024)
        throw new Error('Invalid skip reason')
      decisions[key] = { kind, reason }
    }
  }
  return {
    channels: selected,
    capabilities: decisions,
    completionRequested: boolean(v['completionRequested']),
  }
}
function saved(value: unknown) {
  const v = closed(value, ['revision', 'intent'])
  return { revision: count(v['revision']), intent: decodeIntent(v['intent']) }
}
export function decodeFirstUse(value: unknown, tenant: string) {
  const v = closed(value, ['tenantId', 'saved', 'steps', 'canComplete', 'complete'])
  if (uuid(v['tenantId']) !== tenant) throw new Error('Wrong first-use tenant')
  return {
    tenantId: tenant,
    saved: saved(v['saved']),
    steps: unique(
      array(v['steps'], (value) => {
        const s = closed(value, ['id', 'status', 'reason', 'evidence'])
        return {
          id: enumeration(s['id'], [
            ...channels,
            'agent_registration',
            'apple_materials',
            ...capabilities,
          ] as const),
          status: enumeration(s['status'], [
            'ready',
            'unconfigured',
            'pending',
            'unknown',
            'unavailable',
            'forbidden',
            'skipped',
          ] as const),
          reason: nullable(s['reason'], string),
          evidence: decodeCatalog({ items: s['evidence'], domains: [] }, 'tenant').items,
        }
      }),
      (s) => s.id,
    ),
    canComplete: boolean(v['canComplete']),
    complete: boolean(v['complete']),
  }
}
export type FirstUseProgress = ReturnType<typeof decodeFirstUse>
function receipt(value: unknown) {
  const v = closed(value, ['operationId', 'saved']),
    result = saved(v['saved'])
  positive(result.revision)
  return { operationId: uuid(v['operationId']), saved: result }
}
export function createFirstUseClient(transport: HttpTransport, tenant: string) {
  const path = '/api/v1/settings/first-use'
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path,
        successStatus: 200,
        decode: (v) => decodeFirstUse(v, tenant),
      }),
    update: (id: string, expectedRevision: number, intent: FirstUseIntent) => {
      const body = { expectedRevision: count(expectedRevision), intent: decodeIntent(intent) }
      if (new TextEncoder().encode(JSON.stringify(body)).length > 16384)
        throw new Error('First-use input too large')
      return transport.request({
        method: 'PUT',
        path,
        headers: { 'Idempotency-Key': uuid(id) },
        body,
        successStatus: 200,
        decode: operationReceipt(id, receipt),
      })
    },
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: path + '/operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: operationReceipt(id, receipt),
      }),
  }
}
