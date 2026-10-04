import { createUploadsClient } from './uploads'
import {
  decodeSoftwareDefinition,
  validateSoftwareTarget,
  type SoftwareDefinition,
} from './software-definition'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  record,
  unique,
} from '../../../services/decode'
export const platforms = ['windows', 'macos'] as const
export const architectures = ['x86_64', 'aarch64'] as const
export type Platform = (typeof platforms)[number]
export type Architecture = (typeof architectures)[number]
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
/** Field-specific JSON budgets; diagnostic text may contain line breaks. */
export function jsonValue(value: unknown, budget: number, depth = 0): Json {
  if (depth > 16) throw new Error('JSON too deep')
  let result: Json
  if (value === null || typeof value === 'string' || typeof value === 'boolean') result = value
  else if (typeof value === 'number' && Number.isFinite(value)) result = value
  else if (Array.isArray(value)) result = value.map((v) => jsonValue(v, budget, depth + 1))
  else
    result = Object.fromEntries(
      Object.entries(record(value)).map(([key, v]) => [key, jsonValue(v, budget, depth + 1)]),
    )
  if (depth === 0 && new TextEncoder().encode(JSON.stringify(result)).byteLength > budget)
    throw new Error('JSON too large')
  return result
}
function bounded(value: unknown, min: number, max: number) {
  const n = count(value)
  if (n < min || n > max) throw new Error('Out of range')
  return n
}
function schema(value: unknown): Record<string, Json> {
  const result = record(jsonValue(value, 16_384))
  let nodes = 0
  function check(value: unknown) {
    if (++nodes > 1024) throw new Error('Invalid schema')
    const s = record(value)
    for (const [key, item] of Object.entries(s)) {
      if (key === 'type')
        enumeration(item, ['object', 'array', 'string', 'integer', 'boolean', 'null'] as const)
      else if (key === 'properties')
        Object.entries(record(item)).forEach(([name, child]) => {
          if (!name || name.length > 128) throw new Error('Invalid property')
          check(child)
        })
      else if (key === 'items') check(item)
      else if (key === 'additionalProperties') {
        if (item !== false) throw new Error('Invalid schema')
      } else if (
        ![
          'required',
          'enum',
          'const',
          'minItems',
          'maxItems',
          'minLength',
          'maxLength',
          'minimum',
          'maximum',
          'title',
          'description',
        ].includes(key)
      )
        throw new Error('Unsupported schema keyword')
    }
  }
  check(result)
  return result as Record<string, Json>
}
export type Binding =
  | { kind: 'named' | 'environment'; name: string }
  | { kind: 'positional'; index: number }
export const collectionFields = [
  'custom.corporate_agent.version',
  'custom.corporate_agent.healthy',
  'custom.osquery.version',
] as const
export interface ScriptSpec {
  profile: 'power_shell7' | 'posix_sh' | 'bash' | 'osquery'
  sql: string | null
  runAs: 'system' | 'logged_in_user'
  encoding: 'utf8'
  parameters: Record<string, Json>
  bindings: Record<string, Binding>
  output: Record<string, Json>
  purpose:
    | { kind: 'action' }
    | { kind: 'collection'; mappings: Partial<Record<(typeof collectionFields)[number], string>> }
  timeoutSeconds: number
  outputBytes: number
  maxRows: number
}
export function decodeScriptSpec(value: unknown): ScriptSpec {
  const v = closed(value, [
    'profile',
    'sql',
    'runAs',
    'encoding',
    'parameters',
    'bindings',
    'output',
    'purpose',
    'timeoutSeconds',
    'outputBytes',
    'maxRows',
  ])
  const bindings = Object.fromEntries(
    Object.entries(record(v['bindings'])).map(([key, value]) => {
      const kind = enumeration(record(value)['kind'], [
        'named',
        'environment',
        'positional',
      ] as const)
      const b = closed(value, kind === 'positional' ? ['kind', 'index'] : ['kind', 'name'])
      return [
        identifier(key),
        kind === 'positional'
          ? { kind, index: bounded(b['index'], 0, 65535) }
          : { kind, name: identifier(b['name']) },
      ]
    }),
  ) as Record<string, Binding>
  const kind = enumeration(record(v['purpose'])['kind'], ['action', 'collection'] as const)
  const p = closed(v['purpose'], kind === 'action' ? ['kind'] : ['kind', 'mappings'])
  const purpose: ScriptSpec['purpose'] =
    kind === 'action'
      ? { kind }
      : {
          kind,
          mappings: Object.fromEntries(
            Object.entries(record(p['mappings'])).map(([key, value]) => [
              enumeration(key, collectionFields),
              identifier(value),
            ]),
          ),
        }
  const profile = enumeration(v['profile'], [
      'power_shell7',
      'posix_sh',
      'bash',
      'osquery',
    ] as const),
    sql = v['sql']
  if (
    !(
      sql === null ||
      (typeof sql === 'string' &&
        sql.trim() &&
        !sql.includes('\0') &&
        new TextEncoder().encode(sql).byteLength <= 65536)
    ) ||
    (profile === 'osquery' ? sql === null : sql !== null)
  )
    throw new Error('Invalid script SQL template')
  return {
    profile,
    sql: sql as string | null,
    runAs: enumeration(v['runAs'], ['system', 'logged_in_user'] as const),
    encoding: enumeration(v['encoding'], ['utf8'] as const),
    parameters: schema(v['parameters']),
    bindings,
    output: schema(v['output']),
    purpose,
    timeoutSeconds: bounded(v['timeoutSeconds'], 1, 3600),
    outputBytes: bounded(v['outputBytes'], 1, 1_048_576),
    maxRows: bounded(v['maxRows'], 1, 1000),
  }
}
export interface Artifact {
  reference: string
  length: number
  sha256: number[]
}
export type Declaration =
  | { kind: 'script'; artifact: Artifact; definition: ScriptSpec }
  | { kind: 'software'; definition: SoftwareDefinition }
  | {
      kind: 'configuration'
      artifact: Artifact
    }
export interface Variant {
  platform: Platform
  architecture: Architecture
  key: string
  declaration: Declaration
}
export type ResourceKind = Declaration['kind']
export type ResourceChange =
  | { action: 'create'; kind: ResourceKind }
  | { action: 'version'; version: string; kind: ResourceKind; variants: Variant[] }
  | { action: 'activate' | 'deprecate' | 'archive'; version: string }
function artifact(value: unknown): Artifact {
  const v = closed(value, ['reference', 'length', 'sha256'])
  return {
    reference: identifier(v['reference']),
    length: count(v['length']),
    sha256: digest(v['sha256']),
  }
}
function declaration(value: unknown): Declaration {
  const kind = enumeration(record(value)['kind'], ['script', 'software', 'configuration'] as const)
  const v = closed(
    value,
    kind === 'script'
      ? ['kind', 'artifact', 'definition']
      : kind === 'software'
        ? ['kind', 'definition']
        : ['kind', 'artifact'],
  )
  if (kind === 'software') return { kind, definition: decodeSoftwareDefinition(v['definition']) }
  const a = artifact(v['artifact'])
  if (kind === 'script') return { kind, artifact: a, definition: decodeScriptSpec(v['definition']) }
  return {
    kind,
    artifact: a,
  }
}
function variant(value: unknown): Variant {
  const v = closed(value, ['platform', 'architecture', 'key', 'declaration'])
  const result = {
    platform: enumeration(v['platform'], platforms),
    architecture: enumeration(v['architecture'], architectures),
    key: identifier(v['key']),
    declaration: declaration(v['declaration']),
  }
  if (result.declaration.kind === 'software')
    validateSoftwareTarget(result.declaration.definition, result.platform, result.architecture)
  return result
}
export function decodeResource(value: unknown, id: string) {
  const v = closed(value, ['id', 'revision', 'kind', 'versions'])
  if (identifier(v['id']) !== id) throw new Error('Wrong resource')
  const kind = enumeration(v['kind'], ['script', 'software', 'configuration'] as const)
  return {
    id,
    revision: count(v['revision']),
    kind,
    versions: unique(
      array(v['versions'], (value) => {
        const version = closed(value, ['id', 'digest', 'state', 'variants'])
        const variants = unique(
          array(version['variants'], variant),
          (v) => `${v.platform}/${v.architecture}/${v.key}`,
        )
        if (variants.some((v) => v.declaration.kind !== kind)) throw new Error('Wrong declaration')
        return {
          id: identifier(version['id']),
          digest: digest(version['digest']),
          state: enumeration(version['state'], [
            'frozen',
            'active',
            'deprecated',
            'archived',
          ] as const),
          variants,
        }
      }),
      (v) => v.id,
    ),
  }
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
        body,
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['resource', 'request', 'storageRevision'])
          if (v['resource'] !== id || v['request'] !== body.operationId)
            throw new Error('Wrong resource receipt')
          return {
            resource: id,
            request: body.operationId,
            storageRevision: count(v['storageRevision']),
          }
        },
      }),
    uploads: createUploadsClient(transport),
  }
}

/** Every artifact is Resource-owned; software may carry auxiliary scripts as well as its installer. */
export function declarationArtifacts(declaration: Declaration): Artifact[] {
  return declaration.kind === 'software'
    ? Object.values(declaration.definition.artifacts)
    : [declaration.artifact]
}
