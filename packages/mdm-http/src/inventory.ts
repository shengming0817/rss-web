import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type {
  FieldDescriptor,
  InventoryPort,
  QueryDefinition,
  SavedQuery,
  SavedQueryRow,
} from '@rss/mdm-inventory'
import { operators } from '@rss/mdm-inventory'
import { referenceKey } from '@rss/mdm-devices'
import { boolean, count, enumeration, list, nullable, text, uuid } from './decode'
import { viewSummary } from './devices'
import {
  conditionContext,
  assetCut,
  distinct,
  evidence,
  fieldDefinition,
  fieldDescriptor,
  integer,
  inventoryView,
  qualityRun,
  requestInput,
  scalar,
  scope,
  sourceFact,
  state,
  summary,
  viewListState,
  windowQuery,
} from './inventory-values'

type Asset =
  | schema.getApiV1DevicesByIdInventoryResponse200.Root['asset']
  | schema.getApiV1DevicesByIdInventoryResponse202.Root['asset']
function asset<K extends Asset['kind']>(
  value: unknown,
  tenant: string,
  kind: K,
): Extract<Asset, { kind: K }> {
  if (
    !schema.getApiV1DevicesByIdInventoryResponse200.validateRoot(value) &&
    !schema.getApiV1DevicesByIdInventoryResponse202.validateRoot(value)
  )
    throw new Error('Invalid inventory envelope')
  if (value.tenantId !== tenant || value.asset.kind !== kind)
    throw new Error('Wrong inventory binding')
  return value.asset as Extract<Asset, { kind: K }>
}
function cursor(value: unknown): string | null {
  if (value === null) return null
  const token = text(value)
  if (!token || token.length > 262144 || /\p{Cc}/u.test(token))
    throw new Error('Invalid opaque cursor')
  return token
}
function definition(value: unknown): QueryDefinition {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateQueryInput(value))
    throw new Error('Invalid saved asset definition')
  return {
    filter: value.filter,
    scope: conditionContext(value.scope),
    fields: [...value.fields],
    sort: value.sort.map((sort) => ({ ...sort })),
  }
}
function savedDefinition(value: unknown): NonNullable<SavedQuery['definition']> {
  if (!schema.getApiV1SavedQueriesByIdResponse200.validateSavedDefinition(value))
    throw new Error('Invalid saved query definition')
  return { name: value.name, query: definition(value.query) }
}
const savedFields = {
  id: uuid,
  revision: count,
  name: (value: unknown) => nullable(value, text),
  deleted: boolean,
  definition: (value: unknown) => nullable(value, savedDefinition),
}
const fieldFields = {
  key: text,
  version: count,
  nullable: boolean,
  manual: boolean,
  searchable: boolean,
  sensitivity: (value: unknown) => enumeration(value, ['standard', 'sensitive', 'secret'] as const),
  valueType: (value: unknown): FieldDescriptor['valueType'] => {
    if (!schema.getApiV1AssetFieldsResponse200.validateValueType2(value))
      throw new Error('Invalid field type')
    return value
  },
  sources: (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid field sources')
    return Object.fromEntries(
      Object.entries(value).map(([key, priority]) => [key, count(priority)]),
    )
  },
  platforms: (value: unknown) =>
    list(value, (platform) => enumeration(platform, ['windows', 'macos'] as const)),
  unit: (value: unknown) => nullable(value, text),
  itemKey: (value: unknown) => nullable(value, text),
  timeSeries: (value: unknown): FieldDescriptor['timeSeries'] => {
    if (value === null) return null
    if (!schema.getApiV1AssetFieldsResponse200.validateTimeSeriesBinding(value))
      throw new Error('Invalid time series field binding')
    return value
  },
  operations: (value: unknown) => list(value, (operation) => enumeration(operation, operators)),
}
/** Current formal asset operations over the application's existing session-bound executor. */
export function createInventoryAdapter(transport: HttpTransport, tenant: string): InventoryPort {
  uuid(tenant)
  const accepted = (value: unknown, operationId: string) => {
      const result = asset(value, tenant, 'accepted')
      if (
        result.task !== operationId ||
        result.statusUrl !== api.getApiV1DeviceQueriesById.url({ id: operationId })
      )
        throw new Error('Wrong query operation receipt')
      return { task: uuid(result.task), statusUrl: result.statusUrl }
    },
    saved = (value: unknown, id: string): SavedQuery => {
      const result = asset(value, tenant, 'saved').query
      if (result.id !== id) throw new Error('Wrong saved query')
      return {
        id: uuid(result.id),
        revision: count(result.revision),
        definition: nullable(result.definition, savedDefinition),
      }
    }
  return {
    fields: (query = {}) => {
      if (query.fields && !query.fields.includes('key')) throw new Error('Field identity required')
      return api.getApiV1AssetFields(
        transport,
        { query: queryParameters({ limit: 50, ...query }) },
        (value) => {
          const result = asset(value, tenant, 'field_list')
          return {
            dictionary: result.dictionary,
            ...projectedPage(
              { items: result.items, nextCursor: result.nextCursor },
              fieldFields,
              query.fields,
              ['key'],
            ),
          }
        },
      )
    },
    field: (field) =>
      api.getApiV1AssetFieldsByField(transport, { pathParams: { field } }, (value) => {
        const result = asset(value, tenant, 'field_descriptor')
        const descriptor = fieldDescriptor(result.field)
        if (descriptor.key !== field) throw new Error('Wrong field detail')
        return {
          field,
          version: descriptor.version,
          definition: fieldDefinition(
            Object.fromEntries(Object.entries(descriptor).filter(([key]) => key !== 'operations')),
          ),
        }
      }),
    references: (field, query = {}) =>
      api.getApiV1AssetFieldsByFieldReferences(
        transport,
        { pathParams: { field }, query: windowQuery(query) },
        (value) => {
          return {
            items: value.items.map((item) => ({
              ...item,
              source:
                item.source.kind === 'resource_version'
                  ? { ...item.source, id: text(item.source.id), version: text(item.source.version) }
                  : {
                      ...item.source,
                      id: uuid(item.source.id),
                      revision: count(item.source.revision),
                      ...(item.source.kind === 'saved_query'
                        ? { instance: uuid(item.source.instance), owner: uuid(item.source.owner) }
                        : {}),
                    },
            })),
            nextCursor: nextCursor(value.nextCursor),
          }
        },
      ),
    putField: (field, change) =>
      api.putApiV1AssetFieldsByField(
        transport,
        {
          pathParams: { field },
          body: requestInput(change, schema.putApiV1AssetFieldsByFieldBody.validateRoot),
        },
        (value) => {
          const result = asset(value, tenant, 'field')
          if (result.field !== field || result.version !== change.expectedRevision + 1)
            throw new Error('Wrong field write receipt')
          return {
            field,
            version: count(result.version),
            definition: nullable(result.definition, fieldDefinition),
          }
        },
      ),
    layout: () =>
      api.getApiV1AssetFieldLayout(transport, {}, (value) => {
        const result = asset(value, tenant, 'field_layout')
        return {
          revision: count(result.revision),
          editable: result.editable,
          groups: result.groups.map((group) => ({
            ...group,
            id: uuid(group.id),
            fields: [...group.fields],
          })),
        }
      }),
    putLayout: (change) =>
      api.putApiV1AssetFieldLayout(
        transport,
        { body: requestInput(change, schema.putApiV1AssetFieldLayoutBody.validateRoot) },
        (value) => ({ revision: count(asset(value, tenant, 'field_layout_written').revision) }),
      ),
    query: (operationId, input) =>
      api.postApiV1DeviceQueries(
        transport,
        {
          body: requestInput(
            { operationId, expectedRevision: 0, input },
            schema.postApiV1DeviceQueriesBody.validateRoot,
          ),
        },
        (value) => accepted(value, operationId),
      ),
    queryStatus: (id) =>
      api.getApiV1DeviceQueriesById(transport, { pathParams: { id: uuid(id) } }, (value) => {
        const result = asset(value, tenant, 'query_status')
        if (
          result.task !== id ||
          (result.resultUrl !== null &&
            result.resultUrl !== api.getApiV1DeviceQueriesByIdItems.url({ id }))
        )
          throw new Error('Wrong fixed query coordinates')
        return {
          ...result,
          status: enumeration(result.status, [
            'pending',
            'running',
            'completed',
            'failed',
          ] as const),
          summary: summary(result.summary),
        }
      }),
    queryItems: (id, query = {}) =>
      api.getApiV1DeviceQueriesByIdItems(
        transport,
        { pathParams: { id: uuid(id) }, query: windowQuery(query) },
        (value) => {
          const result = asset(value, tenant, 'page')
          if (result.snapshot !== id) throw new Error('Wrong fixed query snapshot')
          return {
            snapshot: id,
            summary: summary(result.summary),
            items: distinct(result.items.map(inventoryView), (item) =>
              JSON.stringify([item.device, item.collectionScope]),
            ),
            nextCursor: cursor(result.nextCursor),
          }
        },
      ),
    facets: (id, facet, query = {}) =>
      api.getApiV1DeviceQueriesByIdFacetsByFacet(
        transport,
        { pathParams: { id: uuid(id), facet }, query: windowQuery(query) },
        (value) => {
          const result = asset(value, tenant, 'facets')
          if (result.task !== id || result.facet !== facet)
            throw new Error('Wrong fixed query facet')
          return {
            items: result.items.map((item) => ({ label: item.label, total: count(item.total) })),
            nextCursor: cursor(result.nextCursor),
          }
        },
      ),
    savedQueries: (query = {}) => {
      if (query.fields && !query.fields.includes('id'))
        throw new Error('Saved query identity required')
      return api.getApiV1SavedQueries(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) => {
          const result = asset(value, tenant, 'saved_list')
          return projectedPage(
            { items: result.items, nextCursor: result.nextCursor },
            savedFields,
            query.fields,
            ['id'],
          ) as { items: SavedQueryRow[]; nextCursor: string | null }
        },
      )
    },
    savedQuery: (id) =>
      api.getApiV1SavedQueriesById(transport, { pathParams: { id: uuid(id) } }, (value) =>
        saved(value, id),
      ),
    putSavedQuery: (id, change) =>
      api.putApiV1SavedQueriesById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.putApiV1SavedQueriesByIdBody.validateRoot),
        },
        (value) => saved(value, id),
      ),
    executeSavedQuery: (id, change) =>
      api.postApiV1SavedQueriesByIdExecute(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.postApiV1SavedQueriesByIdExecuteBody.validateRoot),
        },
        (value) => accepted(value, change.operationId),
      ),
    inventory: (id, namespace) =>
      api.getApiV1DevicesByIdInventory(
        transport,
        { pathParams: { id }, query: { scope: JSON.stringify(scope(namespace)) } },
        (value) => {
          const result = inventoryView(asset(value, tenant, 'detail').device)
          if (
            result.device !== id ||
            JSON.stringify(result.collectionScope) !== JSON.stringify(scope(namespace))
          )
            throw new Error('Wrong live inventory namespace')
          return result
        },
      ),
    scopes: (id, query = {}) =>
      api.postApiV1DevicesByIdInventoryScopes(
        transport,
        { pathParams: { id }, body: { limit: query.limit ?? 20, cursor: query.cursor } },
        (value) => {
          const result = asset(value, tenant, 'inventory_scopes')
          if (result.device !== id) throw new Error('Wrong namespace directory')
          return {
            device: id,
            assetCut: assetCut(result.assetCut),
            items: distinct(
              result.items.map((item) => ({ scope: scope(item.scope) })),
              (item) => JSON.stringify(item.scope),
            ),
            nextCursor: cursor(result.nextCursor),
          }
        },
      ),
    view: (reference) =>
      api.getApiV1DeviceViewsByKindById(transport, { pathParams: { ...reference } }, (value) => {
        const identity = viewSummary(value, tenant)
        if (referenceKey(identity.reference) !== referenceKey(reference))
          throw new Error('Wrong asset view')
        const endpoint = (id: string) => {
          if (!identity.endpoints.some((item) => item.id === id))
            throw new Error('Wrong asset source endpoint')
          return id
        }
        return {
          ...identity,
          fields: Object.fromEntries(
            Object.entries(value.fields).map(([key, field]) => {
              if (field.field !== key) throw new Error('Wrong view field')
              return [
                key,
                {
                  field: key,
                  state: state(field.state),
                  sources: field.sources.map((source) => ({
                    endpoint: endpoint(source.endpoint),
                    fact: sourceFact(source.fact),
                  })),
                },
              ]
            }),
          ),
          lists: Object.fromEntries(
            Object.entries(value.lists).map(([key, field]) => [
              key,
              {
                state: viewListState(field.state),
                itemKey: field.itemKey,
                sources: field.sources.map((source) => ({
                  ...source,
                  endpoint: endpoint(source.endpoint),
                  state: viewListState(source.state),
                  evidence: evidence(source.evidence),
                  lastKnown:
                    source.lastKnown === null
                      ? null
                      : {
                          state: viewListState(source.lastKnown.state),
                          evidence: evidence(source.lastKnown.evidence),
                        },
                })),
              },
            ]),
          ),
          inventorySources: value.inventorySources.map((source) => ({
            endpoint: endpoint(source.endpoint),
            quality: source.quality.map(qualityRun),
            revisions: Object.fromEntries(
              Object.entries(source.revisions).map(([key, revision]) => [key, count(revision)]),
            ),
          })),
        }
      }),
    list: (query) =>
      query.reference.kind === 'association'
        ? api.getApiV1DeviceViewsByKindByIdInventoryListsByField(
            transport,
            {
              pathParams: { ...query.reference, field: query.field },
              query: { cursor: query.cursor, limit: query.limit ?? 50 },
            },
            (value) => {
              if (
                referenceKey(value.reference) !== referenceKey(query.reference) ||
                value.endpoint !== query.endpoint ||
                value.field !== query.field ||
                JSON.stringify(scope(value.source.scope)) !== JSON.stringify(scope(query.scope))
              )
                throw new Error('Wrong associated list binding')
              return {
                reference: query.reference,
                endpoint: value.endpoint,
                source: evidence(value.source),
                field: query.field,
                items: value.items.map(scalar),
                total: count(value.total),
                assetCut: null,
                nextCursor: cursor(value.nextCursor),
              }
            },
          )
        : api.postApiV1DevicesByIdInventoryListsByField(
            transport,
            {
              pathParams: { id: query.endpoint, field: query.field },
              body: {
                scope: requestInput(
                  scope(query.scope),
                  schema.postApiV1DevicesByIdInventoryListsByFieldBody.validateCollectionScope,
                ),
                cursor: query.cursor,
                limit: query.limit ?? 50,
              },
            },
            (value) => {
              const result = asset(value, tenant, 'list_items')
              if (result.device !== query.endpoint || result.field !== query.field)
                throw new Error('Wrong endpoint list binding')
              return {
                reference: query.reference,
                endpoint: result.device,
                source: null,
                field: result.field,
                items: result.items.map(scalar),
                total: count(result.total),
                assetCut: assetCut(result.assetCut),
                nextCursor: cursor(result.nextCursor),
              }
            },
          ),
    collection: (id, run, namespace) =>
      api.getApiV1DevicesByIdCollectionsByRun(
        transport,
        { pathParams: { id, run }, query: { scope: JSON.stringify(scope(namespace)) } },
        (value) => {
          const result = asset(value, tenant, 'collection_run').run
          if (result.id !== run) throw new Error('Wrong collection run')
          return {
            ...result,
            registration: uuid(result.registration),
            generation: count(result.generation),
            sequence: integer(result.sequence),
            startedAt: integer(result.startedAt),
            finishedAt: nullable(result.finishedAt, integer),
            fields: result.fields.map((field) => ({
              ...field,
              scope: scope(field.scope),
              itemCount: count(field.itemCount),
              invalidItems: count(field.invalidItems),
            })),
            delivery: structuredClone(result.delivery),
          }
        },
      ),
    collectionItems: (id, run, field, namespace, query = {}) =>
      api.getApiV1DevicesByIdCollectionsByRunFieldsByFieldItems(
        transport,
        {
          pathParams: { id, run, field },
          query: { ...windowQuery(query), scope: JSON.stringify(scope(namespace)) },
        },
        (value) => {
          const result = asset(value, tenant, 'collection_items')
          if (result.run !== run || result.field !== field)
            throw new Error('Wrong collection item quality')
          return {
            run,
            field,
            items: result.items.map((item) => ({
              index: count(item.index),
              quality: item.quality,
              value: nullable(item.value, scalar),
            })),
            nextCursor: cursor(result.nextCursor),
          }
        },
      ),
    assign: (id, field, change) =>
      api.putApiV1DevicesByIdManualFieldsByField(
        transport,
        {
          pathParams: { id, field },
          body: requestInput(
            change,
            schema.putApiV1DevicesByIdManualFieldsByFieldBody.validateRoot,
          ),
        },
        (value) => {
          const result = asset(value, tenant, 'assignment')
          if (result.device !== id || result.field !== field)
            throw new Error('Wrong manual assignment')
          return { device: id, field, revision: count(result.revision) }
        },
      ),
  }
}
