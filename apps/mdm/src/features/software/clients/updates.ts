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
import { nativeSchedule, resourceBinding } from './assignment-model'
import { candidate } from './candidate'
export function updateTarget(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['os', 'third_party'] as const)
  if (kind === 'os') {
    const v = closed(value, ['kind', 'release'])
    return { kind, release: identifier(v['release']) }
  }
  const v = closed(value, ['kind', 'resource', 'admissionOperation'])
  return {
    kind,
    resource: resourceBinding(v['resource']),
    admissionOperation: uuid(v['admissionOperation']),
  }
}
export function updateDefinition(value: unknown) {
  const v = closed(value, [
    'title',
    'scope',
    'platform',
    'enabled',
    'target',
    'deferDays',
    'deadline',
    'notifyMinutes',
    'reboot',
    'window',
  ])
  const d = {
    title: identifier(v['title']),
    scope: uuid(v['scope']),
    platform: enumeration(v['platform'], ['windows', 'macos'] as const),
    enabled: boolean(v['enabled']),
    target: updateTarget(v['target']),
    deferDays: count(v['deferDays']),
    deadline: count(v['deadline']),
    notifyMinutes: count(v['notifyMinutes']),
    reboot: enumeration(v['reboot'], ['user', 'maintenance'] as const),
    window: nativeSchedule({
      trigger: { kind: 'check_in', minimumSeconds: 60 },
      misfire: { kind: 'coalesce_one' },
      notBefore: 0,
      until: null,
      jitterSeconds: 0,
      window: v['window'],
    }).window,
  }
  if (
    d.deferDays > 365 ||
    d.deadline < 1 ||
    d.deadline > 253402300799 ||
    d.notifyMinutes > 10080 ||
    (d.reboot === 'maintenance' && !d.window) ||
    (d.target.kind === 'third_party' && (d.notifyMinutes !== 0 || d.reboot !== 'user'))
  )
    throw new Error('Invalid update policy')
  return d
}
export type UpdateDefinition = ReturnType<typeof updateDefinition>
export const updatePhases = [
  'idle',
  'scanning',
  'unsupported',
  'queued',
  'downloading',
  'installing',
  'waiting_reboot',
  'verified',
  'failed',
  'unknown',
  'reconciling',
  'cancel_requested',
  'cancelled',
] as const
export function updateDevice(value: unknown) {
  const v = closed(value, [
    'device',
    'registration',
    'gap',
    'observedAt',
    'source',
    'phase',
    'effect',
    'attempt',
    'execution',
    'notifiedAt',
    'rebootRequestedAt',
    'code',
    'waiting',
  ])
  const d = {
    device: identifier(v['device']),
    registration: nullable(v['registration'], (value) => {
      const r = closed(value, ['id', 'generation', 'source'])
      return {
        id: uuid(r['id']),
        generation: count(r['generation']),
        source: enumeration(r['source'], ['mdm.windows', 'mdm.apple', 'agent.builtin'] as const),
      }
    }),
    gap: enumeration(v['gap'], ['unknown', 'missing', 'installed', 'not_applicable'] as const),
    observedAt: nullable(v['observedAt'], count),
    source: enumeration(v['source'], ['unavailable', 'update_report'] as const),
    phase: enumeration(v['phase'], updatePhases),
    effect: enumeration(v['effect'], ['unverified', 'verified', 'unknown'] as const),
    attempt: nullable(v['attempt'], uuid),
    execution: nullable(v['execution'], uuid),
    notifiedAt: nullable(v['notifiedAt'], count),
    rebootRequestedAt: nullable(v['rebootRequestedAt'], count),
    code: nullable(v['code'], identifier),
    waiting: nullable(v['waiting'], (value) =>
      enumeration(value, [
        'notification',
        'deferral',
        'maintenance',
        'deadline',
        'offline',
        'user',
        'report',
        'authorization',
      ] as const),
    ),
  }
  if (
    (d.source === 'unavailable' && (d.observedAt !== null || d.gap !== 'unknown')) ||
    (d.source === 'update_report' && (d.observedAt === null || !d.registration)) ||
    (d.effect === 'verified' && (d.phase !== 'verified' || d.gap !== 'installed')) ||
    (d.phase === 'verified' && (d.effect !== 'verified' || d.source !== 'update_report')) ||
    (d.phase === 'unknown' && d.effect !== 'unknown')
  )
    throw new Error('Invalid update evidence')
  return d
}
export type UpdateDevice = ReturnType<typeof updateDevice>
export function updateRing(value: unknown, id?: string) {
  const v = closed(value, [
    'id',
    'revision',
    'operation',
    'definition',
    'scopeRevision',
    'devices',
    'policy',
  ])
  const r = {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    definition: updateDefinition(v['definition']),
    scopeRevision: nullable(v['scopeRevision'], count),
    devices: unique(array(v['devices'], updateDevice), (d) => d.device),
    policy: nullable(v['policy'], (value) => {
      const p = closed(value, ['id', 'versionId'])
      return { id: uuid(p['id']), versionId: uuid(p['versionId']) }
    }),
  }
  if (id && r.id !== id) throw new Error('Wrong update ring')
  if (r.definition.target.kind === 'os' && r.policy)
    throw new Error('OS update cannot use software Policy')
  return r
}
export type UpdateRing = ReturnType<typeof updateRing>
export type UpdateChange =
  | { action: 'put'; definition: UpdateDefinition }
  | { action: 'scan' | 'install' | 'pause' | 'resume' }
  | { action: 'retry' | 'reconcile'; device: string }
export function updateRelease(value: unknown) {
  const v = closed(value, ['id', 'platform', 'title', 'version', 'releasedAt', 'source'])
  return {
    id: identifier(v['id']),
    platform: enumeration(v['platform'], ['windows', 'macos'] as const),
    title: identifier(v['title']),
    version: identifier(v['version']),
    releasedAt: count(v['releasedAt']),
    source: identifier(v['source']),
  }
}
export function createUpdatesClient(transport: HttpTransport, tenant: string, demo: boolean) {
  const envelope = (v: unknown, keys: string[]) => candidate(v, tenant, demo, keys)
  return {
    releases: () =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/updates/releases',
        successStatus: 200,
        decode: (v) => unique(array(envelope(v, ['items'])['items'], updateRelease), (r) => r.id),
      }),
    list: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/updates',
        query: { cursor, limit: 20 },
        successStatus: 200,
        decode: (v) => {
          const p = envelope(v, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(p['snapshot']),
            items: array(p['items'], (v) => updateRing(v)),
            nextCursor: nullable(p['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/updates/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => updateRing(envelope(v, ['ring'])['ring'], id),
      }),
    change: (id: string, body: Operation<UpdateChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/software/updates/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => {
          const r = updateRing(envelope(v, ['ring'])['ring'], id)
          if (r.operation !== body.operationId) throw new Error('Wrong update receipt')
          return r
        },
      }),
  }
}
