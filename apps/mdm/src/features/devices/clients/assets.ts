import type { Operation } from '../../../services/useOperation'
/** Published rss-mdm v2 asset contract; candidate directory is a separate projection. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import {
  assetEnvelope,
  cursor,
  fieldDefinition,
  fieldKey,
  inventory,
  savedQuery,
  summary,
  type ManualChange,
  type Query,
} from './asset-model'
export * from './asset-model'
export function decodeInventory(value: unknown, tenant: string) {
  return inventory(assetEnvelope(value, tenant, 'detail', ['device'])['device'])
}
export function decodeCatalog(value: unknown, tenant: string) {
  const v = assetEnvelope(value, tenant, 'fields', ['dictionary', 'fields'])
  if (v['dictionary'] !== 'assets-v1') throw new Error('Unknown asset dictionary')
  return {
    dictionary: 'assets-v1',
    fields: unique(array(v['fields'], fieldDefinition), (f) => f.key),
  }
}
export function decodeAssetPage(value: unknown, tenant: string) {
  const v = assetEnvelope(value, tenant, 'page', ['items', 'nextCursor', 'snapshot', 'summary'])
  return {
    kind: 'page' as const,
    items: unique(array(v['items'], inventory), (d) => d.device),
    nextCursor: cursor(v['nextCursor']),
    snapshot: uuid(v['snapshot']),
    summary: summary(v['summary']),
  }
}
export function createAssetsClient(transport: HttpTransport, tenant: string) {
  const accepted = (value: unknown, operation: string) => {
    const v = assetEnvelope(value, tenant, 'accepted', ['task', 'statusUrl'])
    const task = uuid(v['task'])
    if (task !== operation || v['statusUrl'] !== `/api/v1/device-queries/${task}`)
      throw new Error('Wrong status URL')
    return { task, statusUrl: string(v['statusUrl']) }
  }
  const saved = (value: unknown, id: string) => {
    const result = savedQuery(assetEnvelope(value, tenant, 'saved', ['query'])['query'])
    if (result.id !== id) throw new Error('Wrong saved query')
    return result
  }
  return {
    catalog: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/asset-fields',
        successStatus: 200,
        decode: (v) => decodeCatalog(v, tenant),
      }),
    inventory: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/inventory',
        pathParams: { device },
        successStatus: 200,
        decode: (v) => {
          const result = decodeInventory(v, tenant)
          if (result.device !== device) throw new Error('Wrong inventory device')
          return result
        },
      }),
    search: (body: Operation<Query>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/device-queries',
        body,
        successStatus: 202,
        decode: (v) => accepted(v, body.operationId),
      }),
    status: (task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-queries/{task}',
        pathParams: { task },
        successStatus: 200,
        decode: (value) => {
          const v = assetEnvelope(value, tenant, 'query_status', [
            'task',
            'status',
            'summary',
            'failure',
            'resultUrl',
          ])
          if (uuid(v['task']) !== task) throw new Error('Wrong task')
          const resultUrl = cursor(v['resultUrl'])
          if (resultUrl !== null && resultUrl !== `/api/v1/device-queries/${task}/items`)
            throw new Error('Wrong result URL')
          return {
            task,
            status: enumeration(v['status'], [
              'pending',
              'running',
              'completed',
              'failed',
            ] as const),
            summary: summary(v['summary']),
            failure: nullable(v['failure'], identifier),
            resultUrl,
          }
        },
      }),
    items: (task: string, next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-queries/{task}/items',
        pathParams: { task },
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (v) => {
          const result = decodeAssetPage(v, tenant)
          if (result.snapshot !== task) throw new Error('Wrong search snapshot')
          return result
        },
      }),
    facets: (task: string, facet: 'os_versions' | 'channels' | 'asset_states', next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/device-queries/{task}/facets/{facet}',
        pathParams: { task, facet },
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (value) => {
          const v = assetEnvelope(value, tenant, 'facets', ['task', 'facet', 'items', 'nextCursor'])
          if (uuid(v['task']) !== task || v['facet'] !== facet) throw new Error('Wrong facet')
          return {
            task,
            facet,
            items: array(v['items'], (item) => {
              const i = closed(item, ['label', 'total'])
              return { label: string(i['label']), total: count(i['total']) }
            }),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      }),
    assign: (device: string, field: string, body: Operation<ManualChange>) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/devices/{device}/manual-fields/{field}',
        pathParams: { device, field },
        body,
        successStatus: 200,
        decode: (value) => {
          const v = assetEnvelope(value, tenant, 'assignment', ['device', 'field', 'revision'])
          if (identifier(v['device']) !== device || fieldKey(v['field']) !== field)
            throw new Error('Wrong assignment')
          return { device, field, revision: count(v['revision']) }
        },
      }),
    saved: (after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/saved-queries',
        query: { after },
        successStatus: 200,
        decode: (value) => {
          const v = assetEnvelope(value, tenant, 'saved_list', ['items', 'next'])
          return { items: array(v['items'], savedQuery), next: nullable(v['next'], uuid) }
        },
      }),
    readSaved: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/saved-queries/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => saved(v, id),
      }),
    save: (
      id: string,
      body: Operation<
        { action: 'put'; definition: { name: string; query: Query } } | { action: 'delete' }
      >,
    ) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/saved-queries/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => saved(v, id),
      }),
    executeSaved: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/saved-queries/{id}/execute',
        pathParams: { id },
        body,
        successStatus: 202,
        decode: (v) => accepted(v, body.operationId),
      }),
  }
}
