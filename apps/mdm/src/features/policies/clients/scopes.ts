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
import { channels, objectRef, objectKey, type Channel } from '../../devices/clients/objects'
import { eligibility } from './model'

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
  channel: Channel,
) {
  const v = closed(value, ['result', 'scope', 'current', 'channel', 'page', 'nextCursor'])
  const p = closed(v['page'], ['kind', 'items'])
  if (
    uuid(v['scope']) !== scope ||
    uuid(v['result']) !== result ||
    p['kind'] !== projection ||
    enumeration(v['channel'], channels) !== channel
  )
    throw new Error('Wrong scope result')
  const sources = (value: unknown) =>
    nullable(value, (v) =>
      array(v, (value) => {
        const s = closed(value, ['reference', 'version'])
        return { reference: reference(s['reference']), version: count(s['version']) }
      }),
    )
  const page =
    projection === 'members'
      ? { kind: 'members' as const, items: unique(array(p['items'], objectRef), objectKey) }
      : {
          kind: 'decisions' as const,
          items: unique(
            array(p['items'], (value) => {
              const d = closed(value, [
                'object',
                'qualification',
                'reasons',
                'targets',
                'limitations',
                'exclusions',
              ])
              return {
                object: objectRef(d['object']),
                qualification: eligibility(d['qualification']),
                reasons: array(d['reasons'], (v) =>
                  enumeration(v, [
                    'missing_limitation_match',
                    'explicit_exclusion',
                    'unknown_target',
                    'unknown_limitation',
                    'unknown_exclusion',
                  ] as const),
                ),
                targets: sources(d['targets']),
                limitations: sources(d['limitations']),
                exclusions: sources(d['exclusions']),
              }
            }),
            (d) => objectKey(d.object),
          ),
        }
  return {
    result,
    scope,
    current: boolean(v['current']),
    channel,
    page,
    nextCursor: nullable(v['nextCursor'], string),
  }
}
export function createScopesClient(transport: HttpTransport) {
  return {
    list: (after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/scopes',
        query: { after, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], (value) => {
              const i = closed(value, [
                'id',
                'revision',
                'deleted',
                'calculationRevision',
                'resolution',
                'resolutionRevision',
              ])
              return {
                id: uuid(i['id']),
                revision: count(i['revision']),
                deleted: boolean(i['deleted']),
                calculationRevision: count(i['calculationRevision']),
                resolution: nullable(i['resolution'], uuid),
                resolutionRevision: nullable(i['resolutionRevision'], count),
              }
            }),
            nextCursor: nullable(v['nextCursor'], uuid),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/scopes/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeScope(v, id),
      }),
    change: (id: string, body: Operation<ScopeChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/scopes/{id}',
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
        path: '/api/v1/scopes/{id}/tasks/{task}',
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
    page: (
      id: string,
      result: string,
      projection: ScopeProjection,
      channel: Channel,
      cursor?: string,
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/scopes/{id}/results/{result}/{projection}',
        pathParams: { id, result, projection },
        query: { limit: 20, cursor, channel },
        successStatus: 200,
        decode: (v) => decodeScopePage(v, id, result, projection, channel),
      }),
  }
}
