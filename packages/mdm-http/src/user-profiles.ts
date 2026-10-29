import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { queryParameters, projectedRow, nextCursor } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  valueTypes,
  type ProfilesPort,
  type Profile,
  type ProfileSource,
  type Definition,
  type DefinitionValue,
  type Json,
} from '@rss/mdm-user-profiles'
import { uuid, text, count, positive, nullable, boolean, enumeration } from './decode'
function source(value: unknown): ProfileSource {
  if (!schema.getApiV1UserProfilesMeResponse.validateProfileSource(value))
    throw new Error('Invalid profile source')
  if (value.kind === 'idp') uuid(value.provider)
  return value
}
function definitionValue(value: unknown): DefinitionValue {
  if (!schema.getApiV1UserAttributeDefinitionsResponse.validateDefinitionValue(value))
    throw new Error('Invalid definition contract')
  source(value.source)
  return value
}
function definition(value: unknown): Definition {
  if (!schema.getApiV1UserAttributeDefinitionsByIdResponse.validateRoot(value))
    throw new Error('Invalid definition contract')
  uuid(value.fieldId)
  positive(value.revision)
  count(value.collectedAfterMicros)
  if (value.value !== null) definitionValue(value.value)
  return value
}
function json(value: unknown): Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value))
  )
    return value
  if (Array.isArray(value)) return value.map(json)
  if (typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, json(value)]))
  throw new Error('Invalid profile JSON')
}
function profile(value: unknown): Profile {
  if (!schema.getApiV1UserProfilesMeResponse.validateRoot(value))
    throw new Error('Invalid profile contract')
  uuid(value.principalId)
  const c = value.completeness
  if (c.complete + c.missing !== c.required) throw new Error('Invalid completeness')
  const profileSources = value.profiles.map((p) => {
    if (p.source !== null) source(p.source)
    if (p.status !== 'available' && p.fixed !== null)
      throw new Error('Unavailable profile contains values')
    if (p.expiresAt !== null && p.observedAt !== null && p.expiresAt < p.observedAt)
      throw new Error('Invalid profile observation')
    return p
  })
  const fields = value.fields.map((f) => {
    uuid(f.fieldId)
    positive(f.revision)
    source(f.source)
    if ((f.status === 'available') === (f.value === null))
      throw new Error('Value contradicts profile status')
    return { ...f, value: json(f.value) }
  })
  if (new Set(fields.map((f) => f.fieldId)).size !== fields.length)
    throw new Error('Duplicate profile field')
  return { ...value, profiles: profileSources, fields }
}
const definitionFields = {
  fieldId: uuid,
  revision: positive,
  collectedAfterMicros: count,
  value: (v: unknown) => nullable(v, definitionValue),
  key: text,
  displayName: text,
  sourceKind: (v: unknown) => enumeration(v, ['identity_local', 'idp'] as const),
  provider: (v: unknown) => nullable(v, uuid),
  valueType: (v: unknown) => enumeration(v, valueTypes),
  enabled: boolean,
  sensitive: boolean,
  required: boolean,
  visibility: (v: unknown) => enumeration(v, ['self', 'profiles_read', 'both'] as const),
  displayUse: (v: unknown) => enumeration(v, ['profile', 'summary', 'hidden'] as const),
}
export function createProfilesAdapter(transport: HttpTransport): ProfilesPort {
  return {
    definitions: (query = {}) =>
      api.getApiV1UserAttributeDefinitions(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (v) => {
          const items = v.items.map((item) => projectedRow(item, definitionFields, query.fields))
          if (!query.fields || query.fields.includes('fieldId' as never)) {
            const ids = items.map((item) => Reflect.get(item, 'fieldId'))
            if (new Set(ids).size !== ids.length) throw new Error('Duplicate field definition')
          }
          return {
            items,
            nextCursor: nextCursor(v.nextCursor),
            sources: v.sources.map((s) => ({
              source: source(s.source),
              providerConfigVersion: nullable(s.providerConfigVersion, positive),
              extensionsRoot: nullable(s.extensionsRoot, text),
              maxAgeSeconds: positive(s.maxAgeSeconds),
            })),
          }
        },
      ),
    definition: (id) =>
      api.getApiV1UserAttributeDefinitionsById(transport, { pathParams: { id: uuid(id) } }, (v) => {
        const result = definition(v)
        if (result.fieldId !== id) throw new Error('Wrong field definition')
        return result
      }),
    save: (change) =>
      api.putApiV1UserAttributeDefinitionsById(
        transport,
        {
          pathParams: { id: uuid(change.fieldId) },
          body: {
            operationId: uuid(change.operationId),
            expectedRevision: change.expectedRevision,
            value: change.value,
          },
        },
        (v) => {
          const result = definition(v.definition)
          if (
            v.operationId !== change.operationId ||
            result.fieldId !== change.fieldId ||
            result.revision !== change.expectedRevision + 1 ||
            (result.value === null) !== (change.value === null)
          )
            throw new Error('Wrong field receipt')
          return { operationId: v.operationId, definition: result }
        },
      ),
    operation: (id) =>
      api.getApiV1UserAttributeOperationsById(transport, { pathParams: { id: uuid(id) } }, (v) => {
        if (v.operationId !== id) throw new Error('Wrong field operation')
        return { operationId: id, definition: definition(v.definition) }
      }),
    self: (view, preview) =>
      api.getApiV1UserProfilesMe(transport, { query: { view, preview } }, (v) => {
        const result = profile(v)
        if (result.view !== view) throw new Error('Wrong profile view')
        return result
      }),
    other: (principal, preview) =>
      api.getApiV1UserProfilesById(
        transport,
        { pathParams: { id: uuid(principal) }, query: { view: 'latest', preview } },
        (v) => {
          const result = profile(v)
          if (result.principalId !== principal || result.view !== 'latest')
            throw new Error('Wrong profile principal or view')
          return result
        },
      ),
  }
}
