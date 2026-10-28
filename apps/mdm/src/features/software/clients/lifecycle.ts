import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import { jsonObject } from '../../../services/json'
import type { Operation } from '../../../services/useOperation'
import {
  closed,
  count,
  digest,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  uuid,
} from '../../../services/decode'
import { softwareSource } from '../../policies/clients/software-definition'
export function sourceDefinition(value: unknown) {
  const v = closed(value, ['id', 'revision', 'protocol']),
    raw = record(v['protocol']),
    kind = enumeration(raw['kind'], [
      'private',
      'winget_rest',
      'winget_community',
      'brew_tap',
    ] as const)
  function url(value: unknown) {
    const text = string(value),
      u = new URL(text)
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      text.length > 2048
    )
      throw new Error('Invalid source URL')
    return text
  }
  function commit(value: unknown) {
    const text = string(value)
    if (!/^[0-9a-f]{40}$/.test(text)) throw new Error('Invalid source commit')
    return text
  }
  let protocol
  if (kind === 'private') {
    closed(raw, ['kind'])
    protocol = { kind }
  } else if (kind === 'winget_rest') {
    closed(raw, ['kind', 'location', 'identifier'])
    protocol = { kind, location: url(raw['location']), identifier: identifier(raw['identifier']) }
  } else if (kind === 'winget_community') {
    closed(raw, ['kind', 'repository', 'commit'])
    protocol = { kind, repository: url(raw['repository']), commit: commit(raw['commit']) }
  } else {
    closed(raw, ['kind', 'repository', 'tap', 'commit'])
    const tap = string(raw['tap'])
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(tap) ||
      tap.split('/').some((s) => s === '.' || s === '..' || s.startsWith('-'))
    )
      throw new Error('Invalid tap')
    protocol = { kind, repository: url(raw['repository']), tap, commit: commit(raw['commit']) }
  }
  return { id: identifier(v['id']), revision: identifier(v['revision']), protocol }
}
export type SourceDefinition = ReturnType<typeof sourceDefinition>
export function lifecycle(value: unknown) {
  const v = closed(value, ['revision', 'state', 'operation', 'actor', 'at', 'digest'])
  return {
    revision: count(v['revision']),
    state: enumeration(v['state'], ['enabled', 'disabled', 'withdrawn'] as const),
    operation: uuid(v['operation']),
    actor: identifier(v['actor']),
    at: integer(v['at']),
    digest: digest(v['digest']),
  }
}
export type VersionChange = { action: 'enable' | 'withdraw' }
export type SourceChange =
  | { action: 'register'; definition: SourceDefinition }
  | { action: 'enable' | 'disable' }
export function sourceRead(value: unknown, id: string, revision: string) {
  const v = closed(value, ['source', 'snapshot', 'lifecycle']),
    source = sourceDefinition(v['source']),
    snapshot = softwareSource(v['snapshot'])
  if (
    source.id !== id ||
    source.revision !== revision ||
    snapshot.id !== id ||
    snapshot.revision !== revision
  )
    throw new Error('Wrong source')
  return { source, snapshot, lifecycle: lifecycle(v['lifecycle']) }
}
function versionReceipt(value: unknown, id: string, version: string) {
  const v = closed(value, ['resource', 'version', 'lifecycle'])
  if (v['resource'] !== id || v['version'] !== version) throw new Error('Wrong software version')
  return { resource: id, version, lifecycle: lifecycle(v['lifecycle']) }
}
function mutationReceipt<T extends { lifecycle: ReturnType<typeof lifecycle> }>(
  receipt: T,
  operation: string,
): T {
  if (receipt.lifecycle.operation !== operation) throw new Error('Wrong lifecycle receipt')
  return receipt
}
const sourceFields = {
  id: identifier,
  revision: identifier,
  protocol: (v: unknown) =>
    enumeration(v, ['private', 'winget_rest', 'winget_community', 'brew_tap'] as const),
  state: (v: unknown) => enumeration(v, ['enabled', 'disabled'] as const),
  source: sourceDefinition,
  snapshot: softwareSource,
  lifecycle,
}
export function createLifecycleClient(transport: HttpTransport) {
  return {
    sources: <F extends keyof typeof sourceFields = keyof typeof sourceFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/software/sources',
        query: queryParameters({
          limit: 20,
          ...query,
        }),
        successStatus: 200,
        decode(value) {
          const page = projectedPage(value, sourceFields, query.fields)
          if (!query.fields)
            page.items.forEach((item) => {
              if ('source' in item && 'snapshot' in item && item.source && item.snapshot) {
                const source = item.source as SourceDefinition
                sourceRead(item, source.id, source.revision)
              }
            })
          return page
        },
      }),
    source: (id: string, revision: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/software/sources/{id}/revisions/{revision}',
        pathParams: { id, revision },
        successStatus: 200,
        decode: (v) => sourceRead(v, id, revision),
      }),
    changeSource: (id: string, revision: string, body: Operation<SourceChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/software/sources/{id}/revisions/{revision}',
        pathParams: { id, revision },
        body,
        successStatus: 200,
        decode: (v) => mutationReceipt(sourceRead(v, id, revision), body.operationId),
      }),
    version: (id: string, version: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/software/resources/{id}/versions/{version}',
        pathParams: { id, version },
        successStatus: 200,
        decode(value) {
          const v = closed(value, [
            'resource',
            'version',
            'resourceDigest',
            'resourceRevision',
            'presentation',
            'lifecycle',
          ])
          if (v['resource'] !== id || v['version'] !== version)
            throw new Error('Wrong software version')
          return {
            resource: id,
            version,
            resourceDigest: digest(v['resourceDigest']),
            resourceRevision: count(v['resourceRevision']),
            presentation: jsonObject(v['presentation'], 65536),
            lifecycle: nullable(v['lifecycle'], lifecycle),
          }
        },
      }),
    changeVersion: (id: string, version: string, body: Operation<VersionChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/software/resources/{id}/versions/{version}',
        pathParams: { id, version },
        body,
        successStatus: 200,
        decode: (v) => mutationReceipt(versionReceipt(v, id, version), body.operationId),
      }),
  }
}
