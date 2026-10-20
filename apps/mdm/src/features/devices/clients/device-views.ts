import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  identifier,
  nullable,
  record,
  unique,
} from '../../../services/decode'
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
export interface ViewQuery {
  cursor?: string | undefined
  status?: string | undefined
  channel?: string | undefined
  source?: string | undefined
  descending?: boolean
}
function matches(a: ObjectRef, b: ObjectRef) {
  return objectKey(a) === objectKey(b)
}
function summary(value: unknown, detail = false) {
  const v = closed(
      value,
      ['reference', 'association', 'endpoints'],
      detail ? ['fields', 'lists', 'inventorySources'] : [],
    ),
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
function fields(value: unknown, endpoints: ViewEndpoint[]) {
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, x]) => {
      fieldKey(key)
      const f = closed(x, ['field', 'state', 'sources'])
      if (f['field'] !== key) throw new Error('Wrong field key')
      const sources = unique(
        array(f['sources'], (x) => {
          const s = closed(x, ['endpoint', 'fact']),
            id = identifier(s['endpoint'])
          if (!endpoints.some((e) => e.id === id)) throw new Error('Source outside view')
          return { endpoint: id, fact: sourceFact(s['fact']) }
        }),
        (s) => `${s.endpoint}:${sourceIdentity(s.fact.evidence)}`,
      )
      return [key, { field: key, state: assetState(f['state']), sources }]
    }),
  )
}
export function decodeView(value: unknown, expected: ObjectRef) {
  const v = closed(value, [
      'reference',
      'association',
      'endpoints',
      'fields',
      'lists',
      'inventorySources',
    ]),
    s = summary(v, true)
  if (!matches(s.reference, expected)) throw new Error('Wrong device view')
  return {
    ...s,
    fields: fields(v['fields'], s.endpoints),
    lists: Object.fromEntries(
      Object.entries(record(v['lists'])).map(([key, x]) => {
        fieldKey(key)
        const l = closed(x, ['state', 'sources', 'itemKey'])
        return [
          key,
          {
            state: listState(l['state']),
            itemKey: nullable(l['itemKey'], identifier),
            sources: unique(
              array(l['sources'], (x) => {
                const source = closed(x, ['endpoint', 'evidence', 'state', 'lastKnown', 'cursor']),
                  id = identifier(source['endpoint'])
                if (!s.endpoints.some((e) => e.id === id))
                  throw new Error('List source outside view')
                return {
                  endpoint: id,
                  evidence: evidence(source['evidence']),
                  state: listState(source['state']),
                  lastKnown: nullable(source['lastKnown'], (x) => {
                    const last = closed(x, ['state', 'evidence'])
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
        const p = closed(x, ['endpoint', 'quality', 'revisions']),
          id = identifier(p['endpoint'])
        if (!s.endpoints.some((e) => e.id === id)) throw new Error('Inventory outside view')
        return {
          endpoint: id,
          quality: array(p['quality'], qualityRun),
          revisions: Object.fromEntries(
            Object.entries(record(p['revisions'])).map(([k, v]) => [fieldKey(k), count(v)]),
          ),
        }
      }),
      (s) => s.endpoint,
    ),
  }
}
export type DeviceView = ReturnType<typeof decodeView>
export function decodeViews(value: unknown) {
  const v = closed(value, ['items', 'statistics', 'nextCursor']),
    s = closed(v['statistics'], ['endpointCount', 'deviceViewCount'])
  return {
    items: unique(
      array(v['items'], (x) => summary(x)),
      (s) => objectKey(s.reference),
    ),
    statistics: {
      endpointCount: count(s['endpointCount']),
      deviceViewCount: count(s['deviceViewCount']),
    },
    nextCursor: cursor(v['nextCursor']),
  }
}
export function createDeviceViewsClient(transport: HttpTransport) {
  return {
    list: (query: ViewQuery = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-views',
        query: { limit: 20, ...query },
        successStatus: 200,
        decode: decodeViews,
      }),
    detail: (ref: ObjectRef) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-views/{kind}/{id}',
        pathParams: { ...ref },
        successStatus: 200,
        decode: (v) => decodeView(v, ref),
      }),
    items: (
      ref: ObjectRef,
      field: string,
      source: DeviceView['lists'][string]['sources'][number],
      token = source.cursor,
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-views/{kind}/{id}/inventory-lists/{field}',
        pathParams: { ...ref, field },
        query: { cursor: token, limit: 20 },
        successStatus: 200,
        decode: (value) => {
          const v = closed(value, [
              'reference',
              'field',
              'source',
              'endpoint',
              'total',
              'items',
              'nextCursor',
            ]),
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
      }),
  }
}
