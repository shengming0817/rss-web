import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import { jsonObject } from '../../../services/json'
import type { Operation } from '../../../services/useOperation'
import {
  count,
  enumeration,
  digest,
  identifier,
  integer,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
import { softwareSource } from '../../policies/clients/software-definition'
export function sourceDefinition(value: unknown) {
  if (!wireSchemas.getApiV1SoftwareSourcesResponse.validateSourceDefinition(value))
    throw new Error('Invalid contract value')

  const v = value,
    raw = v['protocol'],
    kind = raw['kind']
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
    protocol = { kind }
  } else if (kind === 'winget_rest') {
    protocol = { kind, location: url(raw['location']), identifier: identifier(raw['identifier']) }
  } else if (kind === 'winget_community') {
    protocol = { kind, repository: url(raw['repository']), commit: commit(raw['commit']) }
  } else {
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
  if (!wireSchemas.getApiV1SoftwareSourcesResponse.validateLifecycle(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    revision: count(v['revision']),
    state: v['state'],
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
  if (!wireSchemas.getApiV1AgentPackagesOperationsByIdResponse.validateSourceView(value))
    throw new Error('Invalid contract value')

  const v = value,
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
  if (!wireSchemas.getApiV1AgentPackagesOperationsByIdResponse.validateVersionReceipt(value))
    throw new Error('Invalid contract value')

  const v = value
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
      api.getApiV1SoftwareSources(
        transport,
        {
          query: queryParameters({
            limit: 20,
            ...query,
          }),
        },
        (value) => {
          const page = projectedPage(value, sourceFields, query.fields)
          if (!query.fields)
            page.items.forEach((item) => {
              if (
                'source' in item &&
                'snapshot' in item &&
                'lifecycle' in item &&
                item.source &&
                item.snapshot
              ) {
                const source = item.source as SourceDefinition
                sourceRead(
                  { source: item.source, snapshot: item.snapshot, lifecycle: item.lifecycle },
                  source.id,
                  source.revision,
                )
              }
            })
          return page
        },
      ),
    source: (id: string, revision: string) =>
      api.getApiV1SoftwareSourcesByIdRevisionsByRevision(
        transport,
        { pathParams: { id, revision } },
        (v) => sourceRead(v, id, revision),
      ),
    changeSource: (id: string, revision: string, body: Operation<SourceChange>) =>
      api.postApiV1SoftwareSourcesByIdRevisionsByRevision(
        transport,
        { pathParams: { id, revision }, body },
        (v) => mutationReceipt(sourceRead(v, id, revision), body.operationId),
      ),
    version: (id: string, version: string) =>
      api.getApiV1SoftwareResourcesByIdVersionsByVersion(
        transport,
        { pathParams: { id, version } },
        (value) => {
          const v = value
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
      ),
    changeVersion: (id: string, version: string, body: Operation<VersionChange>) =>
      api.postApiV1SoftwareResourcesByIdVersionsByVersion(
        transport,
        { pathParams: { id, version }, body },
        (v) => mutationReceipt(versionReceipt(v, id, version), body.operationId),
      ),
  }
}
