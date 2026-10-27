import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  projectedPage,
  type DirectoryQuery,
} from '../../../services/directory-query'
import { jsonValue } from '../../../services/json'
import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  boolean,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  nullable,
  record,
  string,
} from '../../../services/decode'

function publicArtifact(value: unknown) {
  const v = closed(value, ['key', 'url', 'length', 'sha256'])
  return {
    key: identifier(v['key']),
    url: string(v['url']),
    length: count(v['length']),
    sha256: digest(v['sha256']),
  }
}
function caskInstall(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['App', 'Pkg'] as const)
  const v = closed(value, kind === 'App' ? ['kind', 'path'] : ['kind', 'path', 'receipts'])
  return kind === 'App'
    ? { kind, path: identifier(v['path']) }
    : { kind, path: identifier(v['path']), receipts: array(v['receipts'], identifier) }
}
function brewPayload(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['Cask', 'Formula'] as const)
  const v = closed(
    value,
    kind === 'Cask'
      ? ['kind', 'artifacts', 'install']
      : ['kind', 'source', 'executable', 'bottles', 'dependencies'],
  )
  if (kind === 'Cask')
    return {
      kind,
      artifacts: array(v['artifacts'], (value) => {
        const a = closed(value, ['architecture', 'artifact'])
        return {
          architecture: enumeration(a['architecture'], ['aarch64', 'x86_64'] as const),
          artifact: publicArtifact(a['artifact']),
        }
      }),
      install: caskInstall(v['install']),
    }
  return {
    kind,
    source: publicArtifact(v['source']),
    executable: identifier(v['executable']),
    bottles: array(v['bottles'], (value) => {
      const b = closed(value, ['tag', 'rootUrl', 'artifact'])
      return {
        tag: identifier(b['tag']),
        rootUrl: string(b['rootUrl']),
        artifact: publicArtifact(b['artifact']),
      }
    }),
    dependencies: array(v['dependencies'], (value) => {
      const d = closed(value, ['tap', 'name', 'snapshot', 'artifacts'])
      return {
        tap: identifier(d['tap']),
        name: identifier(d['name']),
        snapshot: digest(d['snapshot']),
        artifacts: array(d['artifacts'], publicArtifact),
      }
    }),
  }
}
export function exportDocument(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['Winget', 'Brew'] as const)
  const v = closed(value, kind === 'Winget' ? ['kind', 'manifest'] : ['kind', 'recipe'])
  if (kind === 'Winget') return { kind, manifest: jsonValue(v['manifest'], 8 * 1024 * 1024) }
  const r = closed(v['recipe'], [
    'package',
    'version',
    'name',
    'description',
    'homepage',
    'payload',
  ])
  return {
    kind,
    recipe: {
      package: identifier(r['package']),
      version: identifier(r['version']),
      name: identifier(r['name']),
      description: string(r['description']),
      homepage: string(r['homepage']),
      payload: brewPayload(r['payload']),
    },
  }
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
  const v = closed(
    value,
    [
      'id',
      'revision',
      'target',
      'resource',
      'version',
      'publication',
      'contentDigest',
      'manifestDigest',
      'targetDigest',
      'attempt',
      'outcome',
      'withdrawn',
      'withdrawal',
    ],
    ['document'],
  )
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
    withdrawn: boolean(v['withdrawn']),
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
  const v = closed(value, ['id', 'digest', 'protocol'])
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
