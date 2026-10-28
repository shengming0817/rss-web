import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  projectedPage,
  type DirectoryQuery,
} from '../../../services/directory-query'
import { jsonValue } from '../../../services/json'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import { boolean, count, digest, enumeration, identifier, nullable } from '../../../services/decode'

export function exportDocument(value: unknown) {
  if (!wireSchemas.postApiV1SoftwarePublicationsResponse.validateExportDocument(value))
    throw new Error('Invalid export document')
  if (value.kind === 'Winget') jsonValue(value.manifest, 8 * 1024 * 1024)
  return value
}
export type ExportDocument = ReturnType<typeof exportDocument>
export type Publish = {
  action: 'publish'
  resource: string
  version: string
  expectedResourceRevision: number
  resourceDigest: number[]
  target: string
  targetDigest: number[]
}
export type PublicationChange = Publish | { action: 'recover' | 'retry' | 'withdraw' }
export function decodePublication(value: unknown, expectedId?: string) {
  if (!wireSchemas.postApiV1SoftwarePublicationsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const id = identifier(v['id'])
  if (expectedId !== undefined && id !== expectedId) throw new Error('Wrong publication')
  const attempt = count(v['attempt'])
  if (attempt < 1) throw new Error('Invalid attempt')
  return {
    id,
    revision: count(v['revision']),
    target: identifier(v['target']),
    resource: identifier(v['resource']),
    version: identifier(v['version']),
    publication: digest(v['publication']),
    contentDigest: digest(v['contentDigest']),
    manifestDigest: digest(v['manifestDigest']),
    targetDigest: digest(v['targetDigest']),
    attempt,
    outcome: enumeration(v['outcome'], ['pending', 'unknown', 'not_applied', 'published'] as const),
    withdrawn: v['withdrawn'],
    withdrawal: nullable(v['withdrawal'], (v) =>
      enumeration(v, [
        'withdrawn',
        'not_published',
        'waiting_publication',
        'preflight_retryable',
        'unknown',
      ] as const),
    ),
    ...('document' in v ? { document: exportDocument(v['document']) } : {}),
  }
}
export type Publication = ReturnType<typeof decodePublication>
export function publicationTarget(value: unknown) {
  if (
    !wireSchemas.getApiV1SoftwarePublicationTargetsResponse.validateProjection_PublicTarget(value)
  )
    throw new Error('Invalid contract value')

  const v = value
  return {
    id: identifier(v['id']),
    digest: digest(v['digest']),
    protocol: enumeration(v['protocol'], ['winget', 'brew'] as const),
  }
}
export type PublicationTarget = ReturnType<typeof publicationTarget>
const publicationFields = {
  id: identifier,
  revision: count,
  target: identifier,
  resource: identifier,
  version: identifier,
  publication: digest,
  contentDigest: digest,
  manifestDigest: digest,
  targetDigest: digest,
  attempt: (v: unknown) => {
    const n = count(v)
    if (n < 1) throw new Error('Invalid attempt')
    return n
  },
  outcome: (v: unknown) =>
    enumeration(v, ['pending', 'unknown', 'not_applied', 'published'] as const),
  withdrawn: boolean,
  withdrawal: (v: unknown) =>
    nullable(v, (x) =>
      enumeration(x, [
        'withdrawn',
        'not_published',
        'waiting_publication',
        'preflight_retryable',
        'unknown',
      ] as const),
    ),
}
const targetFields = {
  id: identifier,
  digest,
  protocol: (v: unknown) => enumeration(v, ['winget', 'brew'] as const),
}
export type PublicationQuery<
  F extends keyof typeof publicationFields = keyof typeof publicationFields,
> = DirectoryQuery<F>
export function createPublicationClient(transport: HttpTransport) {
  return {
    targets: <F extends keyof typeof targetFields = keyof typeof targetFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1SoftwarePublicationTargets(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) => projectedPage(value, targetFields, query.fields),
      ),
    list: <F extends keyof typeof publicationFields = keyof typeof publicationFields>(
      query: PublicationQuery<F> = {},
    ) =>
      api.getApiV1SoftwarePublications(
        transport,
        { query: queryParameters({ limit: 20, ...query }) },
        (value) => projectedPage(value, publicationFields, query.fields),
      ),
    read: (id: string) =>
      api.getApiV1SoftwarePublicationsById(transport, { pathParams: { id } }, (v) =>
        decodePublication(v, id),
      ),
    publish: (body: Operation<Publish>) =>
      api.postApiV1SoftwarePublications(transport, { body }, (v) =>
        decodePublication(v, body.operationId),
      ),
    change: (id: string, body: Operation<Exclude<PublicationChange, Publish>>) =>
      api.postApiV1SoftwarePublicationsById(transport, { pathParams: { id }, body }, (v) =>
        decodePublication(v, id),
      ),
  }
}
