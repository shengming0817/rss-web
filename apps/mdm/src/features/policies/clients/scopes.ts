import * as wireSchemas from '@rss/api/mdm-schemas'
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
  if (!wireSchemas.getApiV1ScopesByIdResponse200.validateReference(value))
    throw new Error('Invalid contract value')

  const v = value
  const kind = v['kind']
  return { kind, id: kind === 'group' ? uuid(v['id']) : identifier(v['id']) }
}
function references(value: unknown) {
  return unique(array(value, reference), (v) => `${v.kind}:${v.id}`)
}
export function scopeDefinition(value: unknown): ScopeDefinition {
  if (!wireSchemas.getApiV1ScopesByIdResponse200.validateScopeDefinition(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    targets: references(v['targets']),
    limitations: nullable(v['limitations'], references),
    exclusions: references(v['exclusions']),
  }
}
export function decodeScope(value: unknown, id: string) {
  if (!wireSchemas.getApiV1ScopesByIdResponse200.validateScopeRead(value))
    throw new Error('Invalid contract value')

  const v = value

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
  if (!wireSchemas.getApiV1ScopesByIdResponse200.validateScopePage(value))
    throw new Error('Invalid contract value')

  const v = value
  const p = v['page']
  if (
    uuid(v['scope']) !== scope ||
    uuid(v['result']) !== result ||
    p['kind'] !== projection ||
    enumeration(v['channel'], channels) !== channel
  )
    throw new Error('Wrong scope result')
  const sources = (value: wireSchemas.getApiV1ScopesByIdResponse200.ScopeDecision['targets']) =>
    nullable(value, (v) =>
      array(v, (value) => {
        const s = value
        return { reference: reference(s['reference']), version: count(s['version']) }
      }),
    )
  const page =
    p.kind === 'members'
      ? { kind: 'members' as const, items: unique(array(p['items'], objectRef), objectKey) }
      : {
          kind: 'decisions' as const,
          items: unique(
            array(p['items'], (value) => {
              const d = value
              return {
                object: objectRef(d['object']),
                qualification: eligibility(d['qualification']),
                reasons: array(d['reasons'], (v) => v),
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
    current: v['current'],
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
        const v = value
        if (!('id' in v) || !('task' in v)) throw new Error('Wrong scope receipt')
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
