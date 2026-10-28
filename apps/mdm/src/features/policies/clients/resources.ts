import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import { attachment } from '../../enrollment/clients/binary'
import { jsonValue, jsonObject } from '../../../services/json'
import { createUploadsClient } from './uploads'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  count,
  nullable,
  enumeration,
  identifier,
  record,
} from '../../../services/decode'
import { checked } from '../../../contracts/collection/check'
import {
  validateResourceWrite,
  validateResourceResponse,
  validateScriptDefinition,
} from '../../../contracts/collection/generated/validators'
import type {
  Change,
  Kind,
  Platform,
  Architecture,
  Declaration,
  Artifact,
  ScriptDefinition,
} from '../../../contracts/collection/generated/ResourceWrite'
export type {
  Platform,
  Architecture,
  Variant,
  Declaration,
  Artifact,
} from '../../../contracts/collection/generated/ResourceWrite'
export type ResourceKind = Kind
export type ResourceChange = Change
export type ScriptSpec = ScriptDefinition
export type Binding = ScriptDefinition['bindings'][string]
export function decodeScriptSpec(value: unknown): ScriptDefinition {
  return checked(validateScriptDefinition, value)
}
const resourceFields = {
  id: identifier,
  revision: count,
  kind: (v: unknown) =>
    enumeration(v, [
      'software',
      'script',
      'configuration',
      'native_collection',
      'agent_collection',
      'telemetry_profile',
    ] as const),
  activeVersion: (v: unknown) => nullable(v, identifier),
  presentation: (v: unknown) => jsonObject(v, 65536),
}
export type ResourceDirectoryField = keyof typeof resourceFields
export const platforms = ['windows', 'macos'] as const
export const architectures = ['x86_64', 'aarch64'] as const
export function decodeResource(value: unknown, id: string) {
  const response = checked(validateResourceResponse, value)
  if (!('versions' in response) || response.id !== id) throw new Error('Wrong resource')
  const kind = enumeration(response.kind, [
    'software',
    'script',
    'configuration',
    'native_collection',
    'agent_collection',
    'telemetry_profile',
  ] as const)
  if (response.versions.some((v) => v.variants.some((item) => item.declaration.kind !== kind)))
    throw new Error('Wrong resource declaration')
  // A read is never re-created from a list projection. Preserve presentation extensions.
  jsonObject(response.presentation, 65536)
  return { ...response, kind }
}
export type ResourceRead = ReturnType<typeof decodeResource>
export interface UploadTarget {
  version: string
  variant: string
  platform: Platform
  architecture: Architecture
  artifact?: string
}
export function createResourcesClient(transport: HttpTransport) {
  return {
    script: (
      id: string,
      version: string,
      selection: {
        platform: 'windows' | 'macos'
        architecture: 'x86_64' | 'aarch64'
        variant: string
      },
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/resources/{id}/versions/{version}/script',
        pathParams: { id, version },
        query: { ...selection },
        responseType: 'arraybuffer',
        successStatus: 200,
        decode: (v) => attachment(v, 'application/octet-stream', 'script.txt', 32 * 1024 * 1024),
      }),
    blueprints: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/collection-blueprints',
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['categories', 'items'])
          return {
            categories: array(v['categories'], identifier),
            items: array(v['items'], (value) => {
              const b = closed(value, ['id', 'version', 'presentation', 'platform', 'definition']),
                d = record(b['definition']),
                kind = enumeration(d['kind'], [
                  'native_collection',
                  'agent_collection',
                  'configuration',
                ] as const)
              closed(d, kind === 'configuration' ? ['kind', 'content'] : ['kind', 'template'])
              return {
                id: identifier(b['id']),
                version: identifier(b['version']),
                presentation: jsonObject(b['presentation'], 65536),
                category: identifier(record(b['presentation'])['category']),
                platform: enumeration(b['platform'], platforms),
                definition: { kind, ...record(jsonValue(d, 8 * 1024 * 1024)) },
              }
            }),
          }
        },
      }),
    list: <F extends ResourceDirectoryField = ResourceDirectoryField>(
      query: DirectoryQuery<F> = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/resources',
        query: queryParameters({ limit: 20, ...query }),
        successStatus: 200,
        decode: (value) => projectedPage(value, resourceFields, query.fields, ['id']),
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/resources/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeResource(v, id),
      }),
    change: (id: string, body: Operation<ResourceChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/resources/{id}',
        pathParams: { id },
        body: checked(validateResourceWrite, body),
        successStatus: 200,
        decode(value) {
          if (body.input.action === 'instantiate') return decodeResource(value, id)
          const v = checked(validateResourceResponse, value)
          if (!('resource' in v)) throw new Error('Wrong resource response')
          if (v.resource !== id || v.request !== body.operationId)
            throw new Error('Wrong resource receipt')
          return {
            resource: id,
            request: body.operationId,
            storageRevision: count(v.storageRevision),
          }
        },
      }),
    uploads: createUploadsClient(transport),
  }
}

/** Every artifact is Resource-owned; software may carry auxiliary scripts as well as its installer. */
export function declarationArtifacts(
  declaration: Declaration,
): (Artifact & { origin?: string | null })[] {
  return declaration.kind === 'software'
    ? [
        ...Object.values(declaration.definition.artifacts),
        ...(declaration.definition.provenance.kind === 'imported'
          ? declaration.definition.provenance.files.map((file) => file.content)
          : []),
      ].filter(
        (artifact, index, all) =>
          all.findIndex((a) => a.reference === artifact.reference) === index,
      )
    : [declaration.artifact]
}
