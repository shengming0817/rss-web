export type * from './model'
export { operators } from './model'
export {
  fieldKey,
  freeze,
  identifier,
  operation,
  reference,
  revision,
  uuid,
  validateContext,
  validateCriteria,
  validateField,
  validateLayout,
  validateQuery,
  validateScalar,
  validateValueType,
} from './authoring'
import type { DeviceRef, DirectoryQuery, WindowQuery } from '@rss/mdm-devices'
import type {
  CollectionScope,
  DisplayGroup,
  FieldChange,
  FieldDescriptor,
  InventoryPort,
  ListRead,
  ManualChange,
  Operation,
  QueryDefinition,
  SavedQueryRow,
  SavedQueryChange,
} from './model'
import {
  fieldKey,
  freeze,
  identifier,
  operation,
  reference,
  revision,
  uuid,
  validateField,
  validateLayout,
  validateQuery,
  validateScalar,
} from './authoring'

/** Explicit asset use cases. Server authorization, resolution and evaluation remain authoritative. */
export function createInventory(port: InventoryPort) {
  return Object.freeze({
    fields: (query: DirectoryQuery<keyof FieldDescriptor> = {}) => port.fields(query),
    field: (key: string) => port.field(fieldKey(key)),
    references: (key: string, query: WindowQuery = {}) => port.references(fieldKey(key), query),
    async putField(key: string, change: Operation<FieldChange>) {
      fieldKey(key)
      operation(change)
      if (change.input.action === 'put') {
        validateField(change.input.definition, change.expectedRevision)
        if (change.input.definition.key !== key) throw new Error('Wrong field input')
      }
      const result = await port.putField(key, freeze(change))
      if (
        result.field !== key ||
        result.version !== change.expectedRevision + 1 ||
        (change.input.action === 'delete') !== (result.definition === null)
      )
        throw new Error('Wrong field receipt')
      return result
    },
    layout: () => port.layout(),
    async putLayout(change: Operation<{ readonly groups: readonly DisplayGroup[] }>) {
      operation(change)
      validateLayout(change.input.groups)
      const result = await port.putLayout(freeze(change))
      if (result.revision !== change.expectedRevision + 1) throw new Error('Wrong layout receipt')
      return result
    },
    async query(operationId: string, definition: QueryDefinition) {
      uuid(operationId)
      validateQuery(definition)
      const result = await port.query(operationId, freeze(definition))
      if (result.task !== operationId) throw new Error('Wrong query receipt')
      return result
    },
    async queryStatus(task: string) {
      const result = await port.queryStatus(uuid(task))
      if (result.task !== task) throw new Error('Wrong query status')
      return result
    },
    async queryItems(task: string, query: WindowQuery = {}) {
      const result = await port.queryItems(uuid(task), query)
      if (result.snapshot !== task) throw new Error('Wrong fixed result')
      return result
    },
    facets: (
      task: string,
      facet: 'os_versions' | 'channels' | 'asset_states',
      query: WindowQuery = {},
    ) => port.facets(uuid(task), facet, query),
    savedQueries: (query: DirectoryQuery<keyof SavedQueryRow> = {}) => port.savedQueries(query),
    savedQuery: (id: string) => port.savedQuery(uuid(id)),
    async putSavedQuery(id: string, change: Operation<SavedQueryChange>) {
      uuid(id)
      operation(change)
      if (change.input.action === 'put') {
        identifier(change.input.definition.name, 512)
        validateQuery(change.input.definition.query)
      }
      const result = await port.putSavedQuery(id, freeze(change))
      if (
        result.id !== id ||
        result.revision !== change.expectedRevision + 1 ||
        (change.input.action === 'delete') !== (result.definition === null)
      )
        throw new Error('Wrong saved query receipt')
      return result
    },
    async executeSavedQuery(id: string, change: Operation<Record<string, never>>) {
      uuid(id)
      operation(change)
      if (!change.expectedRevision || Object.keys(change.input).length)
        throw new Error('Saved query revision required')
      const result = await port.executeSavedQuery(id, freeze(change))
      if (result.task !== change.operationId) throw new Error('Wrong saved query execution')
      return result
    },
    inventory: (device: string, scope: CollectionScope = { kind: 'device' }) =>
      port.inventory(identifier(device), scope),
    view: (target: DeviceRef) => {
      reference(target)
      return port.view(target)
    },
    scopes: (device: string, query: WindowQuery = {}) => port.scopes(identifier(device), query),
    list: (query: ListRead) => {
      reference(query.reference)
      identifier(query.endpoint)
      fieldKey(query.field)
      identifier(query.cursor, 16384)
      const limit = query.limit ?? 50
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
        throw new Error('Invalid page size')
      if (query.reference.kind === 'endpoint' && query.reference.id !== query.endpoint)
        throw new Error('Wrong list endpoint')
      return port.list(freeze({ ...query, limit }))
    },
    collection: (device: string, run: string, namespace: CollectionScope = { kind: 'device' }) =>
      port.collection(identifier(device), uuid(run), namespace),
    collectionItems: (
      device: string,
      run: string,
      field: string,
      namespace: CollectionScope,
      query: WindowQuery = {},
    ) => port.collectionItems(identifier(device), uuid(run), fieldKey(field), namespace, query),
    async assign(device: string, field: string, change: Operation<ManualChange>) {
      identifier(device)
      fieldKey(field)
      operation(change)
      if (change.input.action === 'set') validateScalar(change.input.value)
      const result = await port.assign(device, field, freeze(change))
      if (
        result.device !== device ||
        result.field !== field ||
        result.revision !== revision(change.expectedRevision) + 1
      )
        throw new Error('Wrong manual assignment receipt')
      return result
    },
  })
}
