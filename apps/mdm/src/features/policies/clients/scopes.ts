import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export type Reference = { kind: 'device' | 'group'; id: string }
export interface ScopeDefinition {
  targets: Reference[]
  limitations: Reference[] | null
  exclusions: Reference[]
}
export type ScopeChange = { action: 'put'; definition: ScopeDefinition } | { action: 'delete' }
export type ScopeProjection = 'members' | 'decisions'
export function reference(value: unknown): Reference {
  const v = closed(value, ['kind', 'id'])
  const kind = enumeration(v['kind'], ['device', 'group'] as const)
  return { kind, id: kind === 'group' ? uuid(v['id']) : identifier(v['id']) }
}
function references(value: unknown) {
  return unique(array(value, reference), (v) => `${v.kind}:${v.id}`)
}
export function scopeDefinition(value: unknown): ScopeDefinition {
  const v = closed(value, ['targets', 'limitations', 'exclusions'])
  return {
    targets: references(v['targets']),
    limitations: nullable(v['limitations'], references),
    exclusions: references(v['exclusions']),
  }
}
export function decodeScope(value: unknown, id: string) {
  const v = closed(value, ['id', 'revision', 'definition'])
  if (uuid(v['id']) !== id) throw new Error('Wrong scope')
  return { id, revision: count(v['revision']), definition: scopeDefinition(v['definition']) }
}
export type ScopeRead = ReturnType<typeof decodeScope>
export function decodeScopePage(
  value: unknown,
  scope: string,
  result: string,
  projection: ScopeProjection,
) {
  const v = closed(value, [
    'result',
    'scope',
    'current',
    'totalObjects',
    'totalMembers',
    'sources',
    'page',
    'nextCursor',
  ])
  const p = closed(v['page'], ['kind', 'items'])
  if (uuid(v['scope']) !== scope || uuid(v['result']) !== result || p['kind'] !== projection)
    throw new Error('Wrong scope result')
  const sources = array(v['sources'], (value) => {
    const s = closed(value, [
      'reference',
      'memberSet',
      'memberVersion',
      'definitionVersion',
      'authorityVersion',
    ])
    return {
      reference: reference(s['reference']),
      memberSet: nullable(s['memberSet'], uuid),
      memberVersion: count(s['memberVersion']),
      definitionVersion: count(s['definitionVersion']),
      authorityVersion: count(s['authorityVersion']),
    }
  })
  const page =
    projection === 'members'
      ? { kind: 'members' as const, items: unique(array(p['items'], identifier), (v) => v) }
      : {
          kind: 'decisions' as const,
          items: unique(
            array(p['items'], (value) => {
              const d = closed(value, ['device', 'identity', 'reasons', 'sources'])
              return {
                device: identifier(d['device']),
                identity: enumeration(d['identity'], ['active', 'inactive'] as const),
                reasons: array(d['reasons'], (v) =>
                  enumeration(v, ['missing_limitation_match', 'explicit_exclusion'] as const),
                ),
                sources: array(d['sources'], (value) => {
                  const index = count(value)
                  if (index >= sources.length) throw new Error('Wrong source index')
                  return index
                }),
              }
            }),
            (d) => d.device,
          ),
        }
  return {
    result,
    scope,
    current: boolean(v['current']),
    totalObjects: count(v['totalObjects']),
    totalMembers: count(v['totalMembers']),
    sources,
    page,
    nextCursor: nullable(v['nextCursor'], string),
  }
}
export function createScopesClient(transport: HttpTransport) {
  return {
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/scopes/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeScope(v, id),
      }),
    change: (id: string, body: Operation<ScopeChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/scopes/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['id', 'revision', 'task'])
          if (uuid(v['id']) !== id) throw new Error('Wrong scope receipt')
          return { id, revision: count(v['revision']), task: nullable(v['task'], uuid) }
        },
      }),
    status: (id: string, task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/scopes/{id}/tasks/{task}',
        pathParams: { id, task },
        successStatus: 200,
        decode(value) {
          const v = closed(value, [
            'task',
            'kind',
            'target',
            'status',
            'processed',
            'members',
            'plan',
            'failure',
            'failureDetail',
            'execution',
            'policyRevision',
          ])
          if (
            uuid(v['task']) !== task ||
            v['kind'] !== 'scope' ||
            v['target'] !== id ||
            v['plan'] !== null ||
            v['execution'] !== null ||
            v['policyRevision'] !== null
          )
            throw new Error('Wrong scope task')
          return {
            task,
            status: enumeration(v['status'], [
              'pending',
              'running',
              'completed',
              'failed',
              'superseded',
            ] as const),
            processed: count(v['processed']),
            members: count(v['members']),
            failure: nullable(v['failure'], identifier),
            failureDetail: nullable(v['failureDetail'], (value) => {
              const f = closed(value, ['reason', 'device', 'stage'])
              return {
                reason: enumeration(f['reason'], [
                  'capability_unknown',
                  'platform_unsupported',
                  'stale_plan',
                  'owner_conflict',
                ] as const),
                device: nullable(f['device'], identifier),
                stage: enumeration(f['stage'], ['preview', 'save', 'execute'] as const),
              }
            }),
          }
        },
      }),
    page: (id: string, result: string, projection: ScopeProjection, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/scopes/{id}/results/{result}/{projection}',
        pathParams: { id, result, projection },
        query: { limit: 20, cursor },
        successStatus: 200,
        decode: (v) => decodeScopePage(v, id, result, projection),
      }),
  }
}
