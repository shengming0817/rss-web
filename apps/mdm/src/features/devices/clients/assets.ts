import type { Operation } from '../../../services/useOperation'
/** Current rss-mdm asset contract. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import {
  assetEnvelope,
  cursor,
  fieldDefinition,
  fieldKey,
  type fieldInput,
  inventory,
  savedQuery,
  query,
  summary,
  qualityRun,
  sourceIds,
  collectionScope,
  readScalar,
  type CollectionScope,
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
export interface FieldDisplayGroup {
  id: string
  name: string
  fields: string[]
}
export interface FieldLayout {
  revision: number
  editable: boolean
  groups: FieldDisplayGroup[]
}
export function decodeFieldLayout(value: unknown, tenant: string): FieldLayout {
  const v = assetEnvelope(value, tenant, 'field_layout', ['revision', 'editable', 'groups'])
  return {
    revision: count(v['revision']),
    editable: boolean(v['editable']),
    groups: unique(
      array(v['groups'], (value) => {
        const g = closed(value, ['id', 'name', 'fields'])
        const fields = unique(array(g['fields'], fieldKey), (x) => x)
        if (fields.some((x) => !x.startsWith('custom.'))) throw new Error('Invalid display field')
        return { id: uuid(g['id']), name: identifier(g['name']), fields }
      }),
      (g) => g.id,
    ),
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
export function decodeCollectionRun(value: unknown, tenant: string, id: string) {
  const v = closed(assetEnvelope(value, tenant, 'collection_run', ['run'])['run'], [
    'id',
    'registration',
    'generation',
    'source',
    'epoch',
    'delivery',
    'fingerprint',
    'coverage',
    'complete',
    'dataset',
    'templateVersion',
    'sequence',
    'startedAt',
    'finishedAt',
    'result',
    'reason',
    'deliveryPending',
    'fields',
  ])
  if (uuid(v['id']) !== id || count(v['generation']) < 1) throw new Error('Wrong collection run')
  const source = enumeration(v['source'], sourceIds)
  const quality = qualityRun(
    Object.fromEntries(
      [
        'dataset',
        'templateVersion',
        'fingerprint',
        'coverage',
        'complete',
        'source',
        'epoch',
        'sequence',
        'result',
        'deliveryPending',
        'fields',
      ]
        .map((k) => [k, v[k]])
        .concat([
          ['runId', id],
          ['registration', v['registration']],
          ['registrationGeneration', v['generation']],
          ['channel', source.startsWith('agent.') ? 'agent' : 'mdm'],
        ]),
    ),
  )
  const delivery = closed(v['delivery'], ['receipt', 'projection'])
  return {
    id,
    quality,
    delivery: {
      projection: enumeration(delivery['projection'], [
        'projected',
        'pending',
        'pending_receipt',
        'not_applicable',
      ] as const),
      receipt: nullable(delivery['receipt'], (x) => {
        const r = closed(x, ['batch_id', 'received_at', 'decision'])
        return {
          batchId: identifier(r['batch_id']),
          receivedAt: count(r['received_at']),
          decision: r['decision'],
        }
      }),
    },
    startedAt: integer(v['startedAt']),
    finishedAt: nullable(v['finishedAt'], integer),
    reason: nullable(v['reason'], identifier),
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
    fieldLayout: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/asset-field-layout',
        successStatus: 200,
        decode: (v) => decodeFieldLayout(v, tenant),
      }),
    saveFieldLayout: (body: Operation<{ groups: FieldDisplayGroup[] }>) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/asset-field-layout',
        body,
        successStatus: 200,
        decode: (value) => {
          const v = assetEnvelope(value, tenant, 'field_layout_written', ['revision'])
          return { revision: count(v['revision']) }
        },
      }),
    catalog: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/asset-fields',
        successStatus: 200,
        decode: (v) => decodeCatalog(v, tenant),
      }),
    writeField: (
      field: string,
      body: Operation<{ action: 'put'; definition: ReturnType<typeof fieldInput> }>,
    ) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/asset-fields/{field}',
        pathParams: { field },
        body,
        successStatus: 200,
        decode(value) {
          const v = assetEnvelope(value, tenant, 'field', ['field', 'version', 'definition'])
          if (v['field'] !== field || v['version'] !== body.expectedRevision + 1)
            throw new Error('Wrong field receipt')
          if (v['definition'] !== null)
            fieldDefinition({ ...record(v['definition']), operations: [] })
          return { version: count(v['version']) }
        },
      }),
    fieldReferences: (field: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/asset-fields/{field}/references',
        pathParams: { field },
        successStatus: 200,
        decode(value) {
          const v = assetEnvelope(value, tenant, 'field_references', ['field', 'impact'])
          if (v['field'] !== field) throw new Error('Wrong reference field')
          const i = closed(v['impact'], [
            'groups',
            'templates',
            'telemetryProfiles',
            'archivedResourceVersions',
            'compliance',
            'savedQueries',
          ])
          return Object.fromEntries(Object.entries(i).map(([k, v]) => [k, count(v)]))
        },
      }),
    retention: (key: string, revision: number) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/asset-retention-policies/{key}/{revision}',
        pathParams: { key, revision: String(revision) },
        successStatus: 200,
        decode(value) {
          const v = assetEnvelope(value, tenant, 'retention_policy', ['policy'])
          const p = nullable(v['policy'], retentionPolicy)
          if (p && (p.key !== key || p.revision !== revision))
            throw new Error('Wrong retention version')
          return p
        },
      }),
    writeRetention: (body: Operation<ReturnType<typeof retentionPolicy>>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/asset-retention-policies',
        body,
        successStatus: 200,
        decode(value) {
          const v = assetEnvelope(value, tenant, 'retention_policy', ['policy']),
            p = retentionPolicy(v['policy'])
          if (p.key !== body.input.key || p.revision !== body.expectedRevision + 1)
            throw new Error('Wrong retention receipt')
          return p
        },
      }),
    inventory: (device: string, scope: CollectionScope = { kind: 'device' }) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/inventory',
        pathParams: { device },
        query: { scope: JSON.stringify(collectionScope(scope)) },
        successStatus: 200,
        decode: (v) => {
          const result = decodeInventory(v, tenant)
          if (
            result.device !== device ||
            JSON.stringify(result.collectionScope) !== JSON.stringify(collectionScope(scope))
          )
            throw new Error('Wrong inventory scope')
          return result
        },
      }),
    collectionRun: (device: string, id: string, scope: CollectionScope = { kind: 'device' }) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/collections/{run}',
        pathParams: { device, run: uuid(id) },
        query: { scope: JSON.stringify(collectionScope(scope)) },
        successStatus: 200,
        decode: (v) => decodeCollectionRun(v, tenant, id),
      }),
    scopes: (device: string, next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/inventory-scopes',
        pathParams: { device },
        query: { cursor: next, limit: 20 },
        successStatus: 200,
        decode: (value) => {
          const v = assetEnvelope(value, tenant, 'inventory_scopes', [
            'device',
            'watermark',
            'items',
            'nextCursor',
          ])
          if (v['device'] !== device) throw new Error('Wrong scope directory device')
          return {
            device,
            watermark: count(v['watermark']),
            items: unique(
              array(v['items'], (x) => {
                const item = closed(x, ['scope'])
                const scope = collectionScope(item['scope'])
                if (scope.kind === 'device') throw new Error('Device scope is implicit')
                return scope
              }),
              (x) => JSON.stringify(x),
            ),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      }),
    listItems: (device: string, field: string, scope: CollectionScope, next: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/inventory-lists/{field}',
        pathParams: { device, field },
        query: { scope: JSON.stringify(collectionScope(scope)), cursor: next, limit: 20 },
        successStatus: 200,
        decode: (value) => {
          const v = assetEnvelope(value, tenant, 'list_items', [
            'device',
            'field',
            'watermark',
            'total',
            'items',
            'nextCursor',
          ])
          if (v['device'] !== device || v['field'] !== field) throw new Error('Wrong list page')
          return {
            items: array(v['items'], readScalar),
            total: count(v['total']),
            watermark: count(v['watermark']),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      }),
    collectionItems: (
      device: string,
      id: string,
      field: string,
      scope: CollectionScope,
      offset = 0,
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/collections/{run}/fields/{field}/items',
        pathParams: { device, run: uuid(id), field },
        query: { scope: JSON.stringify(collectionScope(scope)), offset, limit: 100 },
        successStatus: 200,
        decode: (value) => {
          const v = assetEnvelope(value, tenant, 'collection_items', [
            'run',
            'field',
            'items',
            'nextOffset',
          ])
          if (v['run'] !== id || v['field'] !== field) throw new Error('Wrong item quality')
          return {
            items: array(v['items'], (x) => {
              const item = closed(x, ['index', 'quality'])
              return {
                index: count(item['index']),
                quality: enumeration(item['quality'], [
                  'pending',
                  'success',
                  'unsupported',
                  'failed',
                  'invalid',
                  'missing',
                  'unknown',
                  'deleted',
                ] as const),
              }
            }),
            nextOffset: nullable(v['nextOffset'], count),
          }
        },
      }),
    search: (body: Operation<Query>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/device-queries',
        body: { ...body, input: query(body.input) },
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

export function retentionPolicy(value: unknown) {
  const p = closed(value, ['key', 'revision', 'rawSeconds', 'summarySeconds', 'restoreSeconds'])
  const result = {
    key: identifier(p['key']),
    revision: count(p['revision']),
    rawSeconds: count(p['rawSeconds']),
    summarySeconds: count(p['summarySeconds']),
    restoreSeconds: count(p['restoreSeconds']),
  }
  if (
    !result.revision ||
    !result.rawSeconds ||
    result.summarySeconds < result.rawSeconds ||
    result.restoreSeconds > result.rawSeconds
  )
    throw new Error('Invalid retention policy')
  return result
}
