import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  projectedPage,
  type DirectoryQuery,
} from '../../../services/directory-query'
import { calculationTask } from '../../devices/clients/calculation-task'
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

const scopeFields = {
  id: uuid,
  revision: count,
  deleted: boolean,
  calculationRevision: count,
  resolution: (v: unknown) => nullable(v, uuid),
  resolutionRevision: (v: unknown) => nullable(v, count),
}
export type ScopeQuery<F extends keyof typeof scopeFields = keyof typeof scopeFields> =
  DirectoryQuery<F>
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
  const v = closed(value, ['id', 'revision', 'definition', 'resolution', 'resolutionRevision'])
  if (uuid(v['id']) !== id) throw new Error('Wrong scope')
  return {
    id,
    revision: count(v['revision']),
    definition: scopeDefinition(v['definition']),
    resolution: nullable(v['resolution'], uuid),
    resolutionRevision: count(v['resolutionRevision']),
  }
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
    list: <F extends keyof typeof scopeFields = keyof typeof scopeFields>(
      query: ScopeQuery<F> = {},
    ) =>
      api.getApiV1Scopes(transport, { query: queryParameters({ limit: 20, ...query }) }, (value) =>
        projectedPage(value, scopeFields, query.fields, ['id']),
      ),
    read: (id: string) =>
      api.getApiV1ScopesById(transport, { pathParams: { id } }, (v) => decodeScope(v, id)),
    change: (id: string, body: Operation<ScopeChange>) =>
      api.postApiV1ScopesById(transport, { pathParams: { id }, body }, (value) => {
        const v = closed(value, ['id', 'revision', 'task'])
        if (uuid(v['id']) !== id) throw new Error('Wrong scope receipt')
        return { id, revision: count(v['revision']), task: nullable(v['task'], uuid) }
      }),
    status: (id: string, task: string) =>
      api.getApiV1ScopesByScopeTasksByTask(
        transport,
        { pathParams: { scope: id, task: task } },
        (value) => calculationTask(value, 'scope', id, task),
      ),
    page: (
      id: string,
      result: string,
      projection: ScopeProjection,
      channel: Channel,
      cursor?: string,
    ) =>
      api.getApiV1ScopesByScopeResultsByResultByKind(
        transport,
        {
          pathParams: { scope: id, result: result, kind: projection },
          query: { limit: 20, cursor, channel },
        },
        (v) => decodeScopePage(v, id, result, projection, channel),
      ),
  }
}
