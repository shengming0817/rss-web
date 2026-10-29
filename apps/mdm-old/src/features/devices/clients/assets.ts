import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { checked } from '../../../contracts/collection/check'
import {
  validateFieldWrite,
  validateFieldImpact,
  validateFieldMappingReference,
  validateFieldReferenceQuery,
} from '@rss/api/mdm-validators'
import type { FieldWrite } from '@rss/api/mdm-types'
import { queryParameters, nextCursor, projectedRow, type DirectoryQuery } from '@rss/api/mdm-query'
import type { Operation } from '../../../services/useOperation'
/** Current rss-mdm asset contract. */
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import {
  assetEnvelope,
  cursor,
  fieldDefinition,
  assetFieldCodecs,
  fieldKey,
  inventory,
  savedQuery,
  savedDefinition,
  queryInput,
  summary,
  qualityRun,
  sourceIds,
  collectionScope,
  readScalar,
  retentionKey,
  type CollectionScope,
  type ManualChange,
  type QueryInput,
} from './asset-model'
export * from './asset-model'
export function decodeInventory(value: unknown, tenant: string) {
  return inventory(assetEnvelope(value, tenant, 'detail')['device'])
}
export function decodeCatalog(value: unknown, tenant: string) {
  const v = assetEnvelope(value, tenant, 'field_list')
  if (v['dictionary'] !== 'assets-v1') throw new Error('Unknown asset dictionary')
  return {
    dictionary: 'assets-v1',
    items: unique(array(v['items'], fieldDefinition), (f) => f.key),
    nextCursor: nextCursor(v['nextCursor']),
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
  const v = assetEnvelope(value, tenant, 'field_layout')
  return {
    revision: count(v['revision']),
    editable: v['editable'],
    groups: unique(
      array(v['groups'], (value) => {
        const g = value
        const fields = unique(array(g['fields'], fieldKey), (x) => x)
        if (fields.some((x) => !x.startsWith('custom.'))) throw new Error('Invalid display field')
        return { id: uuid(g['id']), name: identifier(g['name']), fields }
      }),
      (g) => g.id,
    ),
  }
}
export function decodeAssetPage(value: unknown, tenant: string) {
  const v = assetEnvelope(value, tenant, 'page')
  return {
    kind: 'page' as const,
    items: unique(array(v['items'], inventory), (d) => d.device),
    nextCursor: cursor(v['nextCursor']),
    snapshot: uuid(v['snapshot']),
    summary: summary(v['summary']),
  }
}
export function decodeCollectionRun(value: unknown, tenant: string, id: string) {
  const v = assetEnvelope(value, tenant, 'collection_run')['run']
  if (uuid(v['id']) !== id || count(v['generation']) < 1) throw new Error('Wrong collection run')
  const source = enumeration(v['source'], sourceIds)
  const quality = qualityRun(
    Object.fromEntries(
      (
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
        ] as const
      )
        .map((k) => [k, v[k]])
        .concat([
          ['runId', id],
          ['registration', v['registration']],
          ['registrationGeneration', v['generation']],
          ['channel', source.startsWith('agent.') ? 'agent' : 'mdm'],
        ]),
    ),
  )
  const delivery = v['delivery']
  return {
    id,
    quality,
    delivery: {
      projection: delivery['projection'],
      receipt: nullable(delivery['receipt'], (x) => {
        const r = x
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
const savedFields = {
  id: uuid,
  revision: count,
  definition: (v: unknown) => nullable(v, savedDefinition),
  name: (v: unknown) => nullable(v, string),
  deleted: boolean,
}
export function createAssetsClient(transport: HttpTransport, tenant: string) {
  const accepted = (value: unknown, operation: string) => {
    const v = assetEnvelope(value, tenant, 'accepted')
    const task = uuid(v['task'])
    if (task !== operation || v['statusUrl'] !== api.getApiV1DeviceQueriesById.url({ id: task }))
      throw new Error('Wrong status URL')
    return { task, statusUrl: string(v['statusUrl']) }
  }
  const saved = (value: unknown, id: string) => {
    const result = savedQuery(assetEnvelope(value, tenant, 'saved')['query'])
    if (result.id !== id) throw new Error('Wrong saved query')
    return result
  }
  function fieldRequest<T>(
    query: DirectoryQuery<keyof typeof assetFieldCodecs>,
    decode: (value: unknown) => T,
  ) {
    return api.getApiV1AssetFields(transport, { query: queryParameters(query) }, decode)
  }

  return {
    fieldLayout: () =>
      api.getApiV1AssetFieldLayout(transport, {}, (v) => decodeFieldLayout(v, tenant)),
    saveFieldLayout: (body: Operation<{ groups: FieldDisplayGroup[] }>) =>
      api.putApiV1AssetFieldLayout(transport, { body }, (value) => {
        const v = assetEnvelope(value, tenant, 'field_layout_written')
        return { revision: count(v['revision']) }
      }),
    fields: <F extends keyof typeof assetFieldCodecs = keyof typeof assetFieldCodecs>(
      query: DirectoryQuery<F> = {},
    ) =>
      fieldRequest({ limit: 50, ...query }, (value) => {
        const page = assetEnvelope(value, tenant, 'field_list')
        if (page['dictionary'] !== 'assets-v1') throw new Error('Wrong asset dictionary')
        return {
          items: array(page['items'], (item) => projectedRow(item, assetFieldCodecs, query.fields)),
          nextCursor: nextCursor(page['nextCursor']),
        }
      }),
    field: (key: string) =>
      api.getApiV1AssetFieldsByField(
        transport,
        { pathParams: { field: fieldKey(key) } },
        (value) => {
          const row = fieldDefinition(assetEnvelope(value, tenant, 'field_descriptor')['field'])
          if (row.key !== key) throw new Error('Wrong field')
          return row
        },
      ),
    async catalog() {
      const fields: ReturnType<typeof fieldDefinition>[] = [],
        seen = new Set<string>()
      let cursor: string | undefined
      do {
        const page = await fieldRequest({ limit: 100, cursor }, (value) =>
          decodeCatalog(value, tenant),
        )
        fields.push(...page.items)
        if (fields.length > 1024) throw new Error('Invalid field catalog budget')
        if (page.nextCursor !== null && seen.has(page.nextCursor))
          throw new Error('Repeated catalog cursor')
        if (page.nextCursor !== null) seen.add(page.nextCursor)
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      return { dictionary: 'assets-v1', fields: unique(fields, (field) => field.key) }
    },
    writeField: (field: string, body: FieldWrite) =>
      api.putApiV1AssetFieldsByField(
        transport,
        { pathParams: { field }, body: checked(validateFieldWrite, body) },
        (value) => {
          const v = assetEnvelope(value, tenant, 'field')
          if (v['field'] !== field || v['version'] !== body.expectedRevision + 1)
            throw new Error('Wrong field receipt')
          if (v['definition'] !== null) fieldDefinition({ ...v['definition'], operations: [] })
          return { version: count(v['version']) }
        },
      ),
    fieldReferences: (field: string, cursor?: string) =>
      api.getApiV1AssetFieldsByFieldReferences(
        transport,
        {
          pathParams: { field },
          query: {
            ...checked(validateFieldReferenceQuery, {
              ...(cursor === undefined ? {} : { cursor }),
              limit: 64,
            }),
            cursor,
          },
        },
        (value) => {
          const v = assetEnvelope(value, tenant, 'field_references')
          if (v['field'] !== field) throw new Error('Wrong reference field')
          return {
            impact: checked(validateFieldImpact, v['impact']),
            mappings: array(v['mappings'], (mapping) =>
              checked(validateFieldMappingReference, mapping),
            ),
            nextCursor: nextCursor(v['nextCursor']),
          }
        },
      ),
    retention: (key: string, revision: number) =>
      api.getApiV1AssetRetentionPoliciesByKeyByRevision(
        transport,
        { pathParams: { key, revision } },
        (value) => {
          const v = assetEnvelope(value, tenant, 'retention_policy')
          const p = nullable(v['policy'], retentionPolicy)
          if (p && (p.key !== key || p.revision !== revision))
            throw new Error('Wrong retention version')
          return p
        },
      ),
    writeRetention: (body: Operation<ReturnType<typeof retentionPolicy>>) =>
      api.postApiV1AssetRetentionPolicies(transport, { body }, (value) => {
        const v = assetEnvelope(value, tenant, 'retention_policy'),
          p = retentionPolicy(v['policy'])
        if (p.key !== body.input.key || p.revision !== body.expectedRevision + 1)
          throw new Error('Wrong retention receipt')
        return p
      }),
    inventory: (device: string, scope: CollectionScope = { kind: 'device' }) =>
      api.getApiV1DevicesByIdInventory(
        transport,
        { pathParams: { id: device }, query: { scope: JSON.stringify(collectionScope(scope)) } },
        (v) => {
          const result = decodeInventory(v, tenant)
          if (
            result.device !== device ||
            JSON.stringify(result.collectionScope) !== JSON.stringify(collectionScope(scope))
          )
            throw new Error('Wrong inventory scope')
          return result
        },
      ),
    collectionRun: (device: string, id: string, scope: CollectionScope = { kind: 'device' }) =>
      api.getApiV1DevicesByIdCollectionsByRun(
        transport,
        {
          pathParams: { id: device, run: uuid(id) },
          query: { scope: JSON.stringify(collectionScope(scope)) },
        },
        (v) => decodeCollectionRun(v, tenant, id),
      ),
    scopes: (device: string, next?: string) =>
      api.getApiV1DevicesByIdInventoryScopes(
        transport,
        { pathParams: { id: device }, query: { cursor: next, limit: 20 } },
        (value) => {
          const v = assetEnvelope(value, tenant, 'inventory_scopes')
          if (v['device'] !== device) throw new Error('Wrong scope directory device')
          return {
            device,
            watermark: count(v['watermark']),
            items: unique(
              array(v['items'], (x) => {
                const item = x
                const scope = collectionScope(item['scope'])
                if (scope.kind === 'device') throw new Error('Device scope is implicit')
                return scope
              }),
              (x) => JSON.stringify(x),
            ),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      ),
    listItems: (device: string, field: string, scope: CollectionScope, next: string) =>
      api.getApiV1DevicesByIdInventoryListsByField(
        transport,
        {
          pathParams: { id: device, field: field },
          query: { scope: JSON.stringify(collectionScope(scope)), cursor: next, limit: 20 },
        },
        (value) => {
          const v = assetEnvelope(value, tenant, 'list_items')
          if (v['device'] !== device || v['field'] !== field) throw new Error('Wrong list page')
          return {
            items: array(v['items'], readScalar),
            total: count(v['total']),
            watermark: count(v['watermark']),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      ),
    collectionItems: (
      device: string,
      id: string,
      field: string,
      scope: CollectionScope,
      next?: string,
    ) =>
      api.getApiV1DevicesByIdCollectionsByRunFieldsByFieldItems(
        transport,
        {
          pathParams: { id: device, run: uuid(id), field: field },
          query: { scope: JSON.stringify(collectionScope(scope)), cursor: next, limit: 100 },
        },
        (value) => {
          const v = assetEnvelope(value, tenant, 'collection_items')
          if (v['run'] !== id || v['field'] !== field) throw new Error('Wrong item quality')
          return {
            items: array(v['items'], (x) => {
              const item = x
              return {
                index: count(item['index']),
                value: nullable(item['value'], readScalar),
                quality: item['quality'],
              }
            }),
            nextCursor: nextCursor(v['nextCursor']),
          }
        },
      ),
    search: (body: Operation<QueryInput>) =>
      api.postApiV1DeviceQueries(
        transport,
        { body: { ...body, input: queryInput(body.input) } },
        (v) => accepted(v, body.operationId),
      ),
    status: (task: string) =>
      api.getApiV1DeviceQueriesById(transport, { pathParams: { id: task } }, (value) => {
        const v = assetEnvelope(value, tenant, 'query_status')
        if (uuid(v['task']) !== task) throw new Error('Wrong task')
        const resultUrl = cursor(v['resultUrl'])
        if (
          resultUrl !== null &&
          resultUrl !== api.getApiV1DeviceQueriesByIdItems.url({ id: task })
        )
          throw new Error('Wrong result URL')
        return {
          task,
          status: enumeration(v['status'], ['pending', 'running', 'completed', 'failed'] as const),
          summary: summary(v['summary']),
          failure: nullable(v['failure'], identifier),
          resultUrl,
        }
      }),
    items: (task: string, next?: string) =>
      api.getApiV1DeviceQueriesByIdItems(
        transport,
        { pathParams: { id: task }, query: { limit: 20, cursor: next } },
        (v) => {
          const result = decodeAssetPage(v, tenant)
          if (result.snapshot !== task) throw new Error('Wrong search snapshot')
          return result
        },
      ),
    facets: (task: string, facet: 'os_versions' | 'channels' | 'asset_states', next?: string) =>
      api.getApiV1DeviceQueriesByIdFacetsByFacet(
        transport,
        { pathParams: { id: task, facet: facet }, query: { limit: 20, cursor: next } },
        (value) => {
          const v = assetEnvelope(value, tenant, 'facets')
          if (uuid(v['task']) !== task || v['facet'] !== facet) throw new Error('Wrong facet')
          return {
            task,
            facet,
            items: array(v['items'], (item) => {
              const i = item
              return { label: string(i['label']), total: count(i['total']) }
            }),
            nextCursor: cursor(v['nextCursor']),
          }
        },
      ),
    assign: (device: string, field: string, body: Operation<ManualChange>) =>
      api.putApiV1DevicesByIdManualFieldsByField(
        transport,
        { pathParams: { id: device, field: field }, body },
        (value) => {
          const v = assetEnvelope(value, tenant, 'assignment')
          if (identifier(v['device']) !== device || fieldKey(v['field']) !== field)
            throw new Error('Wrong assignment')
          return { device, field, revision: count(v['revision']) }
        },
      ),
    saved: <F extends keyof typeof savedFields = keyof typeof savedFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1SavedQueries(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) => {
          const v = assetEnvelope(value, tenant, 'saved_list')
          return {
            items: array(v['items'], (item) => {
              const row = projectedRow(item, savedFields, query.fields)
              if (
                'deleted' in row &&
                'definition' in row &&
                row.deleted !== (row.definition === null)
              )
                throw new Error('Wrong saved query state')
              return row
            }),
            nextCursor: nextCursor(v['nextCursor']),
          }
        },
      ),
    readSaved: (id: string) =>
      api.getApiV1SavedQueriesById(transport, { pathParams: { id } }, (v) => saved(v, id)),
    save: (
      id: string,
      body: Operation<
        { action: 'put'; definition: { name: string; query: QueryInput } } | { action: 'delete' }
      >,
    ) => api.putApiV1SavedQueriesById(transport, { pathParams: { id }, body }, (v) => saved(v, id)),
    executeSaved: (id: string, body: Operation<Record<string, never>>) =>
      api.postApiV1SavedQueriesByIdExecute(transport, { pathParams: { id }, body }, (v) =>
        accepted(v, body.operationId),
      ),
  }
}

export function retentionPolicy(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateRetentionPolicy(value))
    throw new Error('Invalid contract value')

  const p = value
  const result = {
    key: retentionKey(p['key']),
    revision: count(p['revision']),
    rawSeconds: count(p['rawSeconds']),
    summarySeconds: count(p['summarySeconds']),
    restoreSeconds: count(p['restoreSeconds']),
  }
  if (
    !result.revision ||
    !result.rawSeconds ||
    result.rawSeconds > 0xffffffff ||
    result.summarySeconds > 0xffffffff ||
    result.restoreSeconds > 0xffffffff ||
    result.summarySeconds < result.rawSeconds ||
    result.restoreSeconds > result.rawSeconds
  )
    throw new Error('Invalid retention policy')
  return result
}
