import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, identifier, integer, nullable, unique } from '../../../services/decode'
import { association } from './associations'
import { viewEndpoint, type ViewEndpoint } from './endpoint-model'
import {
  cursor,
  pageToken,
  fieldKey,
  qualityRun,
  evidence,
  listState,
  readScalar,
  assetState,
  sourceFact,
  sourceIdentity,
} from './asset-model'
import { objectRef, objectKey, type ObjectRef } from './objects'
const viewFields = {
  key: identifier,
  reference: objectRef,
  association: (v: unknown) => nullable(v, association),
  endpoints: (v: unknown) => unique(array(v, viewEndpoint), (e) => e.id),
}
export type ViewQuery<F extends keyof typeof viewFields = keyof typeof viewFields> =
  DirectoryQuery<F>
function matches(a: ObjectRef, b: ObjectRef) {
  return objectKey(a) === objectKey(b)
}
function summary(value: unknown, detail = false) {
  if (detail) {
    if (!wireSchemas.getApiV1DeviceViewsByKindByIdResponse.validateRoot(value))
      throw new Error('Invalid contract value')
  } else if (!wireSchemas.getApiV1DeviceViewsResponse.validateProjection_DirectoryRow(value))
    throw new Error('Invalid contract value')

  const v = value,
    ref = objectRef(v['reference']),
    a = nullable(v['association'], association),
    endpoints = unique(array(v['endpoints'], viewEndpoint), (e) => e.id)
  if (
    ref.kind === 'endpoint' &&
    (a !== null || endpoints.length !== 1 || endpoints[0]?.id !== ref.id)
  )
    throw new Error('Wrong endpoint view')
  if (
    ref.kind === 'association' &&
    (!a ||
      a.id !== ref.id ||
      a.state === 'revoked' ||
      endpoints.length !== 2 ||
      a.members.some((m) => !endpoints.some((e) => e.id === m.device)))
  )
    throw new Error('Wrong association view')
  return { reference: ref, association: a, endpoints }
}
function fields(
  value: Record<string, wireSchemas.getApiV1DeviceViewsByKindByIdResponse.ResolvedDeviceField>,
  endpoints: ViewEndpoint[],
) {
  return Object.fromEntries(
    Object.entries(value).map(([key, x]) => {
      fieldKey(key)
      const f = x
      if (f['field'] !== key) throw new Error('Wrong field key')
      const sources = unique(
        array(f['sources'], (x) => {
          const s = x,
            id = identifier(s['endpoint'])
          if (!endpoints.some((e) => e.id === id)) throw new Error('Source outside view')
          const fact = sourceFact(s['fact'])
          if (
            fact.evidence.scope.kind !== 'device' ||
            (fact.lastKnown && fact.lastKnown.evidence.scope.kind !== 'device')
          )
            throw new Error('Wrong view namespace')
          return { endpoint: id, fact }
        }),
        (s) => `${s.endpoint}:${sourceIdentity(s.fact.evidence)}`,
      )
      return [key, { field: key, state: assetState(f['state']), sources }]
    }),
  )
}
export function decodeView(value: unknown, expected: ObjectRef) {
  if (!wireSchemas.getApiV1DeviceViewsByKindByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value,
    s = summary(v, true)
  if (!matches(s.reference, expected)) throw new Error('Wrong device view')
  return {
    ...s,
    fields: fields(v['fields'], s.endpoints),
    lists: Object.fromEntries(
      Object.entries(v['lists']).map(([key, x]) => {
        fieldKey(key)
        const l = x
        return [
          key,
          {
            state: listState(l['state']),
            itemKey: nullable(l['itemKey'], identifier),
            sources: unique(
              array(l['sources'], (x) => {
                const source = x,
                  id = identifier(source['endpoint'])
                if (!s.endpoints.some((e) => e.id === id))
                  throw new Error('List source outside view')
                return {
                  endpoint: id,
                  evidence: evidence(source['evidence']),
                  state: listState(source['state']),
                  lastKnown: nullable(source['lastKnown'], (x) => {
                    const last = x
                    return {
                      state: nullable(last['state'], listState),
                      evidence: evidence(last['evidence']),
                    }
                  }),
                  cursor: pageToken(source['cursor']),
                }
              }),
              (s) => `${s.endpoint}:${sourceIdentity(s.evidence)}`,
            ),
          },
        ]
      }),
    ),
    inventorySources: unique(
      array(v['inventorySources'], (x) => {
        const p = x,
          id = identifier(p['endpoint'])
        if (!s.endpoints.some((e) => e.id === id)) throw new Error('Inventory outside view')
        return {
          endpoint: id,
          quality: array(p['quality'], qualityRun),
          revisions: Object.fromEntries(
            Object.entries(p['revisions']).map(([k, v]) => [fieldKey(k), count(v)]),
          ),
        }
      }),
      (s) => s.endpoint,
    ),
  }
}
export type DeviceView = ReturnType<typeof decodeView>
export function decodeViews<F extends keyof typeof viewFields = keyof typeof viewFields>(
  value: unknown,
  fields?: readonly F[],
) {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const page = projectedPage(value, viewFields, fields, ['key'])
  for (const row of page.items) {
    if (['reference', 'association', 'endpoints'].every((key) => key in row)) {
      const { key, ...item } = row as {
        key?: string
        reference: ObjectRef
        association: unknown
        endpoints: ViewEndpoint[]
      }
      const view = summary(item)
      if (key !== undefined && key !== objectKey(view.reference)) throw new Error('Wrong view key')
    }
  }
  return page
}
export function createDeviceViewsClient(transport: HttpTransport, tenant: string) {
  function bound<T extends { endpoints: ViewEndpoint[] }>(value: T): T {
    for (const e of value.endpoints)
      for (const u of [e.registrationUser?.user, e.currentUser?.user])
        if (u && u.tenantId !== tenant) throw new Error('Wrong personnel tenant')
    return value
  }
  return {
    list: <F extends keyof typeof viewFields = keyof typeof viewFields>(query: ViewQuery<F> = {}) =>
      api.getApiV1DeviceViews(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (v) => {
          const page = decodeViews(v, query.fields)
          for (const item of page.items)
            if ('endpoints' in item) bound(item as { endpoints: ViewEndpoint[] })
          return page
        },
      ),
    statistics: (filter?: string) =>
      api.getApiV1DeviceViewsStatistics(
        transport,
        { query: queryParameters({ filter }) },
        (value) => {
          const v = value,
            stats = v['statistics']
          return {
            statistics: {
              endpointCount: count(stats['endpointCount']),
              deviceViewCount: count(stats['deviceViewCount']),
            },
            asOf: integer(v['asOf']),
          }
        },
      ),
    detail: (ref: ObjectRef) =>
      api.getApiV1DeviceViewsByKindById(transport, { pathParams: { ...ref } }, (v) =>
        bound(decodeView(v, ref)),
      ),
    items: (
      ref: ObjectRef,
      field: string,
      source: DeviceView['lists'][string]['sources'][number],
      token = source.cursor,
    ) =>
      api.getApiV1DeviceViewsByKindByIdInventoryListsByField(
        transport,
        { pathParams: { ...ref, field }, query: { cursor: token, limit: 20 } },
        (value) => {
          const v = value,
            e = evidence(v['source'])
          if (
            !matches(objectRef(v['reference']), ref) ||
            v['field'] !== field ||
            v['endpoint'] !== source.endpoint ||
            JSON.stringify(e) !== JSON.stringify(source.evidence)
          )
            throw new Error('Wrong list source')
          return {
            reference: ref,
            field,
            source: e,
            endpoint: source.endpoint,
            total: count(v['total']),
            items: array(v['items'], readScalar),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      ),
  }
}
