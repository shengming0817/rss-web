import type { HttpTransport } from '@rss/api/mdm'
import { profileJson, type ProfileJson } from '@rss/auth'
import {
  closed,
  string,
  uuid,
  count,
  boolean,
  enumeration,
  nullable,
  array,
} from '../../../services/decode'
export type ProfileSource = { kind: 'identity_local' } | { kind: 'idp'; provider: string }
export function source(value: unknown): ProfileSource {
  const raw = value as Record<string, unknown>
  if (raw?.['kind'] === 'identity_local') {
    closed(value, ['kind'])
    return { kind: 'identity_local' }
  }
  const v = closed(value, ['kind', 'provider'])
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
  const v = closed(value, [
    'key',
    'displayName',
    'source',
    'pointer',
    'valueType',
    'maxLength',
    'maxItems',
    'minimum',
    'maximum',
    'enabled',
    'sensitive',
    'visibility',
    'displayUse',
    'required',
    'useExistingObservation',
  ])
  return {
    key: string(v['key']),
    displayName: string(v['displayName']),
    source: source(v['source']),
    pointer: string(v['pointer']),
    valueType: enumeration(v['valueType'], types),
    maxLength: nullable(v['maxLength'], count),
    maxItems: nullable(v['maxItems'], count),
    minimum: nullable(v['minimum'], finite),
    maximum: nullable(v['maximum'], finite),
    enabled: boolean(v['enabled']),
    sensitive: boolean(v['sensitive']),
    visibility: enumeration(v['visibility'], visibility),
    displayUse: enumeration(v['displayUse'], uses),
    required: boolean(v['required']),
    useExistingObservation: boolean(v['useExistingObservation']),
  }
}
export type DefinitionValue = ReturnType<typeof definitionValue>
export function definition(value: unknown) {
  const v = closed(value, ['fieldId', 'revision', 'collectedAfterMicros', 'value'])
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
  const v = closed(value, ['operationId', 'definition'])
  const d = definition(v['definition'])
  if (uuid(v['operationId']) !== operationId || (fieldId !== undefined && d.fieldId !== fieldId))
    throw new Error('Wrong operation receipt')
  return { operationId, definition: d }
}
const states = [
  'available',
  'missing',
  'invalid',
  'not_configured',
  'expired',
  'unavailable',
  'pending_login',
  'redacted',
] as const
export type Attribute<T> =
  | { status: 'available'; value: T }
  | { status: 'missing' | 'invalid' | 'not_configured' }
function attribute<T>(value: unknown, decode: (v: unknown) => T): Attribute<T> {
  const raw = value as Record<string, unknown>
  if (raw?.['status'] === 'available') {
    const v = closed(value, ['status', 'value'])
    return { status: 'available', value: decode(v['value']) }
  }
  const v = closed(value, ['status'])
  return { status: enumeration(v['status'], ['missing', 'invalid', 'not_configured'] as const) }
}
function fixed(value: unknown) {
  const v = closed(value, ['displayName', 'username', 'email', 'emailVerified'])
  return {
    displayName: attribute(v['displayName'], string),
    username: attribute(v['username'], string),
    email: attribute(v['email'], string),
    emailVerified: attribute(v['emailVerified'], boolean),
  }
}
export function profile(value: unknown) {
  const v = closed(value, ['principalId', 'view', 'profiles', 'fields', 'completeness'])
  const c = closed(v['completeness'], ['required', 'complete', 'missing'])
  const completeness = {
    required: count(c['required']),
    complete: count(c['complete']),
    missing: count(c['missing']),
  }
  if (completeness.complete + completeness.missing !== completeness.required)
    throw new Error('Invalid completeness')
  return {
    principalId: uuid(v['principalId']),
    view: enumeration(v['view'], ['current', 'latest'] as const),
    completeness,
    profiles: array(v['profiles'], (item) => {
      const p = closed(item, [
        'source',
        'status',
        'snapshotId',
        'providerConfigVersion',
        'sourceRevision',
        'observedAt',
        'collectedAtMicros',
        'expiresAt',
        'fixed',
      ])
      if (p['status'] !== 'available' && p['fixed'] !== null)
        throw new Error('Unavailable profile contains values')
      return {
        source: nullable(p['source'], source),
        status: enumeration(p['status'], [
          'available',
          'missing',
          'expired',
          'unavailable',
        ] as const),
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
      const f = closed(item, [
        'fieldId',
        'revision',
        'key',
        'displayName',
        'source',
        'valueType',
        'sensitive',
        'displayUse',
        'required',
        'status',
        'value',
      ])
      if ((f['status'] === 'available') === (f['value'] === null))
        throw new Error('Profile value contradicts status')
      return {
        fieldId: uuid(f['fieldId']),
        revision: count(f['revision']),
        key: string(f['key']),
        displayName: string(f['displayName']),
        source: source(f['source']),
        valueType: enumeration(f['valueType'], types),
        sensitive: boolean(f['sensitive']),
        displayUse: enumeration(f['displayUse'], uses),
        required: boolean(f['required']),
        status: enumeration(f['status'], states),
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
export function createProfilesClient(transport: HttpTransport) {
  return {
    definitions: (after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/user-attribute-definitions',
        ...(after ? { query: { after: uuid(after) } } : {}),
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['definitions', 'nextCursor', 'sources'])
          return {
            definitions: array(v['definitions'], definition),
            nextCursor: nullable(v['nextCursor'], uuid),
            sources: array(v['sources'], (item) => {
              const s = closed(item, [
                'source',
                'providerConfigVersion',
                'extensionsRoot',
                'maxAgeSeconds',
              ])
              return {
                source: source(s['source']),
                providerConfigVersion: nullable(s['providerConfigVersion'], count),
                extensionsRoot: nullable(s['extensionsRoot'], string),
                maxAgeSeconds: count(s['maxAgeSeconds']),
              }
            }),
          }
        },
      }),
    definition: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/user-attribute-definitions/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: definition,
      }),
    save: (
      id: string,
      operationId: string,
      expectedRevision: number,
      value: DefinitionValue | null,
    ) =>
      transport.request({
        method: 'PUT',
        path: '/api/v1/user-attribute-definitions/{id}',
        pathParams: { id: uuid(id) },
        body: { operationId: uuid(operationId), expectedRevision, value },
        successStatus: 200,
        decode: (v) => definitionReceipt(v, operationId, id),
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/user-attribute-operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: (v) => definitionReceipt(v, id),
      }),
    read: (principal: string | null, view: 'current' | 'latest' = 'current', preview = false) =>
      transport.request({
        method: 'GET',
        path: principal ? '/api/v1/user-profiles/{id}' : '/api/v1/user-profiles/me',
        ...(principal ? { pathParams: { id: uuid(principal) } } : {}),
        query: { view, preview: String(preview) },
        successStatus: 200,
        decode: profile,
      }),
  }
}
export function sourceKey(value: ProfileSource) {
  return value.kind === 'identity_local' ? 'identity_local' : value.provider
}
export function jsonDisplay(value: ProfileJson) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
