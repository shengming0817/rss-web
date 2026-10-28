import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { queryParameters, projectedRow, nextCursor, type DirectoryQuery } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import { profileJson, type ProfileJson } from '@rss/auth/profile-json'
import {
  enumeration,
  string,
  uuid,
  count,
  boolean,
  nullable,
  array,
} from '../../../services/decode'
export type ProfileSource = { kind: 'identity_local' } | { kind: 'idp'; provider: string }
export function source(value: unknown): ProfileSource {
  if (!wireSchemas.getApiV1UserProfilesMeResponse.validateProfileSource(value))
    throw new Error('Invalid contract value')

  const raw = value as Record<string, unknown>
  if (raw?.['kind'] === 'identity_local') {
    return { kind: 'identity_local' }
  }
  const v = value
  if (v['kind'] !== 'idp') throw new Error('Invalid profile source')
  return { kind: 'idp', provider: uuid(v['provider']) }
}
export const types = ['string', 'boolean', 'number', 'integer', 'array', 'object'] as const
export const visibility = ['self', 'profiles_read', 'both'] as const
export const uses = ['profile', 'summary', 'hidden'] as const
function finite(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (Number.isInteger(value) && !Number.isSafeInteger(value))
  )
    throw new Error('Invalid number')
  return value
}
export function definitionValue(value: unknown) {
  if (!wireSchemas.getApiV1UserAttributeDefinitionsResponse.validateDefinitionValue(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    key: string(v['key']),
    displayName: string(v['displayName']),
    source: source(v['source']),
    pointer: string(v['pointer']),
    valueType: v['valueType'],
    maxLength: nullable(v['maxLength'], count),
    maxItems: nullable(v['maxItems'], count),
    minimum: nullable(v['minimum'], finite),
    maximum: nullable(v['maximum'], finite),
    enabled: v['enabled'],
    sensitive: v['sensitive'],
    visibility: v['visibility'],
    displayUse: v['displayUse'],
    required: v['required'],
    useExistingObservation: v['useExistingObservation'],
  }
}
export type DefinitionValue = ReturnType<typeof definitionValue>
export function definition(value: unknown) {
  if (!wireSchemas.getApiV1UserAttributeDefinitionsByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  if (count(v['revision']) === 0) throw new Error('Invalid definition revision')
  return {
    fieldId: uuid(v['fieldId']),
    revision: count(v['revision']),
    collectedAfterMicros: count(v['collectedAfterMicros']),
    value: nullable(v['value'], definitionValue),
  }
}
export type Definition = ReturnType<typeof definition>
export function definitionReceipt(value: unknown, operationId: string, fieldId?: string) {
  if (!wireSchemas.getApiV1UserAttributeOperationsByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const d = definition(v['definition'])
  if (uuid(v['operationId']) !== operationId || (fieldId !== undefined && d.fieldId !== fieldId))
    throw new Error('Wrong operation receipt')
  return { operationId, definition: d }
}

export type Attribute<T> =
  | { status: 'available'; value: T }
  | Exclude<wireSchemas.getApiV1UserProfilesMeResponse.Attribute, { status: 'available' }>
function attribute<T>(
  value:
    | wireSchemas.getApiV1UserProfilesMeResponse.Attribute
    | wireSchemas.getApiV1UserProfilesMeResponse.Attribute2,
  decode: (v: unknown) => T,
): Attribute<T> {
  return value.status === 'available'
    ? { status: value.status, value: decode(value.value) }
    : { status: value.status }
}
function fixed(value: unknown) {
  if (!wireSchemas.getApiV1UserProfilesMeResponse.validateFixed(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    displayName: attribute(v['displayName'], string),
    username: attribute(v['username'], string),
    email: attribute(v['email'], string),
    emailVerified: attribute(v['emailVerified'], boolean),
  }
}
export function profile(value: unknown) {
  if (!wireSchemas.getApiV1UserProfilesMeResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const c = v['completeness']
  const completeness = {
    required: count(c['required']),
    complete: count(c['complete']),
    missing: count(c['missing']),
  }
  if (completeness.complete + completeness.missing !== completeness.required)
    throw new Error('Invalid completeness')
  return {
    principalId: uuid(v['principalId']),
    view: v['view'],
    completeness,
    profiles: array(v['profiles'], (item) => {
      const p = item
      if (p['status'] !== 'available' && p['fixed'] !== null)
        throw new Error('Unavailable profile contains values')
      return {
        source: nullable(p['source'], source),
        status: p['status'],
        snapshotId: nullable(p['snapshotId'], uuid),
        providerConfigVersion: nullable(p['providerConfigVersion'], count),
        sourceRevision: nullable(p['sourceRevision'], count),
        observedAt: nullable(p['observedAt'], count),
        collectedAtMicros: nullable(p['collectedAtMicros'], count),
        expiresAt: nullable(p['expiresAt'], count),
        fixed: nullable(p['fixed'], fixed),
      }
    }),
    fields: array(v['fields'], (item) => {
      const f = item
      if ((f['status'] === 'available') === (f['value'] === null))
        throw new Error('Profile value contradicts status')
      return {
        fieldId: uuid(f['fieldId']),
        revision: count(f['revision']),
        key: string(f['key']),
        displayName: string(f['displayName']),
        source: source(f['source']),
        valueType: f['valueType'],
        sensitive: f['sensitive'],
        displayUse: f['displayUse'],
        required: f['required'],
        status: f['status'],
        value: profileJson(f['value']),
      }
    }),
  }
}
export type Profile = ReturnType<typeof profile>
export type SourceMetadata = {
  source: ProfileSource
  providerConfigVersion: number | null
  extensionsRoot: string | null
  maxAgeSeconds: number
}
const definitionFields = {
  key: string,
  displayName: string,
  sourceKind: (v: unknown) => enumeration(v, ['identity_local', 'idp'] as const),
  provider: (v: unknown) => nullable(v, uuid),
  valueType: (v: unknown) => enumeration(v, types),
  enabled: boolean,
  sensitive: boolean,
  required: boolean,
  visibility: (v: unknown) => enumeration(v, visibility),
  displayUse: (v: unknown) => enumeration(v, uses),
  fieldId: uuid,
  revision: (value: unknown) => {
    const n = count(value)
    if (!n) throw new Error('Invalid definition revision')
    return n
  },
  collectedAfterMicros: count,
  value: (v: unknown) => nullable(v, definitionValue),
}
export function createProfilesClient(transport: HttpTransport) {
  return {
    definitions: <F extends keyof typeof definitionFields = keyof typeof definitionFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1UserAttributeDefinitions(
        transport,
        {
          query: queryParameters({
            limit: 20,
            ...query,
          }),
        },
        (value) => {
          const v = value
          return {
            items: array(v['items'], (row) => projectedRow(row, definitionFields, query.fields)),
            nextCursor: nextCursor(v['nextCursor']),
            sources: array(v['sources'], (item) => {
              const s = item
              return {
                source: source(s['source']),
                providerConfigVersion: nullable(s['providerConfigVersion'], count),
                extensionsRoot: nullable(s['extensionsRoot'], string),
                maxAgeSeconds: count(s['maxAgeSeconds']),
              }
            }),
          }
        },
      ),
    definition: (id: string) =>
      api.getApiV1UserAttributeDefinitionsById(
        transport,
        { pathParams: { id: uuid(id) } },
        definition,
      ),
    save: (
      id: string,
      operationId: string,
      expectedRevision: number,
      value: DefinitionValue | null,
    ) =>
      api.putApiV1UserAttributeDefinitionsById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: { operationId: uuid(operationId), expectedRevision, value },
        },
        (v) => definitionReceipt(v, operationId, id),
      ),
    operation: (id: string) =>
      api.getApiV1UserAttributeOperationsById(transport, { pathParams: { id: uuid(id) } }, (v) =>
        definitionReceipt(v, id),
      ),
    read: (principal: string | null, view: 'current' | 'latest' = 'current', preview = false) =>
      principal
        ? api.getApiV1UserProfilesById(
            transport,
            { pathParams: { id: uuid(principal) }, query: { view, preview } },
            profile,
          )
        : api.getApiV1UserProfilesMe(transport, { query: { view, preview } }, profile),
  }
}
export function sourceKey(value: ProfileSource) {
  return value.kind === 'identity_local' ? 'identity_local' : value.provider
}
export function jsonDisplay(value: ProfileJson) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
