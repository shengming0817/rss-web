import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import type { Operation } from '../../../services/useOperation'
import { registration, enrollmentSources } from '../../devices/clients/enrollment'
import { resourceBinding } from './assignment-model'
import { candidate } from './candidate'
function source(value: unknown) {
  const v = closed(value, ['registrationId', 'generation', 'source'])
  return {
    registrationId: uuid(v['registrationId']),
    generation: count(v['generation']),
    source: enumeration(v['source'], enrollmentSources),
  }
}
function action(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['install_agent', 'request_mdm'] as const)
  if (kind === 'request_mdm') {
    const v = closed(value, ['kind', 'instructions']),
      instructions = v['instructions']
    if (
      typeof instructions !== 'string' ||
      !instructions.trim() ||
      instructions.length > 4096 ||
      [...instructions].some(
        (c) => (c.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(c)) || c.charCodeAt(0) === 127,
      )
    )
      throw new Error('Invalid instructions')
    return { kind, instructions }
  }
  const v = closed(value, ['kind', 'resource', 'admissionOperation', 'userAction'])
  return {
    kind,
    resource: resourceBinding(v['resource']),
    admissionOperation: uuid(v['admissionOperation']),
    userAction: enumeration(v['userAction'], ['required', 'silent'] as const),
  }
}
export function bootstrapDefinition(value: unknown) {
  const v = closed(value, ['title', 'scope', 'platform', 'enabled', 'action'])
  return {
    title: identifier(v['title']),
    scope: uuid(v['scope']),
    platform: enumeration(v['platform'], ['windows', 'macos'] as const),
    enabled: boolean(v['enabled']),
    action: action(v['action']),
  }
}
export type BootstrapDefinition = ReturnType<typeof bootstrapDefinition>
export function bootstrapAttempt(value: unknown) {
  const v = closed(value, [
    'id',
    'policyRevision',
    'kind',
    'source',
    'createdAt',
    'deadline',
    'phase',
    'delivery',
    'installation',
    'acknowledgedAt',
    'detectedAt',
    'code',
  ])
  const a = {
    id: uuid(v['id']),
    policyRevision: count(v['policyRevision']),
    kind: enumeration(v['kind'], ['install_agent', 'request_mdm'] as const),
    source: source(v['source']),
    createdAt: count(v['createdAt']),
    deadline: count(v['deadline']),
    phase: enumeration(v['phase'], [
      'queued',
      'waiting_user',
      'running',
      'acknowledged',
      'failed',
      'unknown',
      'reconciling',
      'cancelled',
    ] as const),
    delivery: enumeration(v['delivery'], ['queued', 'received', 'unknown'] as const),
    installation: enumeration(v['installation'], [
      'unverified',
      'present',
      'failed',
      'unknown',
      'not_applicable',
    ] as const),
    acknowledgedAt: nullable(v['acknowledgedAt'], count),
    detectedAt: nullable(v['detectedAt'], count),
    code: nullable(v['code'], identifier),
  }
  if (
    a.deadline <= a.createdAt ||
    (a.kind === 'install_agent' && a.source.source === 'agent.builtin') ||
    (a.kind === 'request_mdm' && a.source.source !== 'agent.builtin') ||
    (a.kind === 'request_mdm' && a.installation !== 'not_applicable') ||
    (a.kind === 'install_agent' && a.installation === 'not_applicable') ||
    (a.installation === 'present' && a.detectedAt === null) ||
    (a.phase === 'acknowledged' && a.acknowledgedAt === null)
  )
    throw new Error('Invalid bootstrap evidence')
  return a
}
export type BootstrapAttempt = ReturnType<typeof bootstrapAttempt>
export function bootstrapTarget(value: unknown) {
  const v = closed(value, ['device', 'source', 'admission', 'attempt', 'target', 'binding'])
  return {
    device: identifier(v['device']),
    source: nullable(v['source'], source),
    admission: enumeration(v['admission'], [
      'eligible',
      'paused',
      'scope_pending',
      'outside_scope',
      'unsupported',
      'missing_source',
      'ambiguous_source',
      'already_registered',
      'ambiguous_target',
      'package_unapproved',
    ] as const),
    attempt: nullable(v['attempt'], bootstrapAttempt),
    target: nullable(v['target'], registration),
    binding: enumeration(v['binding'], [
      'missing',
      'unsupported',
      'ready',
      'not_applicable',
      'ambiguous',
    ] as const),
  }
}
export type BootstrapTarget = ReturnType<typeof bootstrapTarget>
export function bootstrapPolicy(value: unknown, id?: string) {
  const v = closed(value, ['id', 'revision', 'operation', 'definition', 'scopeRevision', 'targets'])
  const p = {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    definition: bootstrapDefinition(v['definition']),
    scopeRevision: nullable(v['scopeRevision'], count),
    targets: unique(array(v['targets'], bootstrapTarget), (r) => r.device),
  }
  if (id && p.id !== id) throw new Error('Wrong source policy')
  return p
}
export type BootstrapPolicy = ReturnType<typeof bootstrapPolicy>
export type BootstrapChange =
  | { action: 'put'; definition: BootstrapDefinition }
  | { action: 'evaluate' | 'dispatch' | 'pause' | 'resume' }
  | { action: 'retry' | 'reconcile'; device: string }
export function createBootstrapClient(transport: HttpTransport, tenant: string, demo: boolean) {
  const envelope = (v: unknown, keys: string[]) => candidate(v, tenant, demo, keys)
  return {
    attempt: (id: string, attempt: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/software/bootstrap/{id}/attempts/{attempt}',
        pathParams: { id, attempt },
        successStatus: 200,
        decode: (v) => {
          const a = bootstrapAttempt(envelope(v, ['attempt'])['attempt'])
          if (a.id !== attempt) throw new Error('Wrong source attempt')
          return a
        },
      }),
    list: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/software/bootstrap',
        query: { cursor, limit: 20 },
        successStatus: 200,
        decode: (v) => {
          const p = envelope(v, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(p['snapshot']),
            items: array(p['items'], (v) => bootstrapPolicy(v)),
            nextCursor: nullable(p['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/software/bootstrap/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => bootstrapPolicy(envelope(v, ['policy'])['policy'], id),
      }),
    change: (id: string, body: Operation<BootstrapChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/mdm-candidate/software/bootstrap/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => {
          const p = bootstrapPolicy(envelope(v, ['policy'])['policy'], id)
          if (p.operation !== body.operationId) throw new Error('Wrong source policy receipt')
          return p
        },
      }),
  }
}
