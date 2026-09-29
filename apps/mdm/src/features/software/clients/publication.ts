import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
} from '../../../services/decode'
import { jsonValue } from '../../policies/clients/resources'
export const rings = ['test', 'pilot', 'production'] as const
export type Ring = (typeof rings)[number]
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
export function submission(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['Winget', 'Brew'] as const)
  const v = closed(value, kind === 'Winget' ? ['kind', 'manifest'] : ['kind', 'recipe'])
  if (kind === 'Winget') return { kind, manifest: jsonValue(v['manifest'], 16_384) }
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
export type Submission = ReturnType<typeof submission>
export type PublicationChange =
  | {
      action: 'candidate'
      resource: string
      version: string
      expectedResourceRevision: number
      submission: Submission
    }
  | { action: 'validate' | 'authorize' | 'withdraw'; ring: Ring }
  | { action: 'approve'; ring: Ring; publisherSubject: string }
  | { action: 'publish' | 'recover'; ring: Ring; publication: number[]; attempt: number }
  | { action: 'retry'; ring: Ring; attempt: number }
export function decodePublication(value: unknown, id: string) {
  const v = closed(
    value,
    ['id', 'revision', 'contentDigest', 'disposition', 'manifestDigest', 'sourceSnapshot', 'rings'],
    ['submission'],
  )
  if (identifier(v['id']) !== id) throw new Error('Wrong publication')
  const states = unique(
    array(v['rings'], (value) => {
      const r = closed(value, ['ring', 'state', 'publication', 'approval'])
      const result = {
        ring: enumeration(r['ring'], rings),
        state: enumeration(r['state'], [
          'candidate',
          'validated',
          'approved',
          'publication',
        ] as const),
        publication: nullable(r['publication'], (value) => {
          const p = closed(value, ['id', 'attempt', 'outcome'])
          return {
            id: digest(p['id']),
            attempt: count(p['attempt']),
            outcome: enumeration(p['outcome'], ['published', 'not_applied', 'unknown'] as const),
          }
        }),
        approval: nullable(r['approval'], (value) => {
          const a = closed(value, ['approver', 'publisher', 'at', 'digest'])
          return {
            approver: identifier(a['approver']),
            publisher: identifier(a['publisher']),
            at: integer(a['at']),
            digest: digest(a['digest']),
          }
        }),
      }
      if (
        (result.state === 'publication') !== (result.publication !== null) ||
        ['approved', 'publication'].includes(result.state) !== (result.approval !== null)
      )
        throw new Error('Invalid publication state')
      return result
    }),
    (r) => r.ring,
  )
  if (states.length !== rings.length) throw new Error('Incomplete publication rings')
  return {
    id,
    revision: count(v['revision']),
    contentDigest: digest(v['contentDigest']),
    disposition: enumeration(v['disposition'], ['active', 'quarantined', 'deprecated'] as const),
    manifestDigest: digest(v['manifestDigest']),
    sourceSnapshot: digest(v['sourceSnapshot']),
    rings: states,
    ...('submission' in v ? { submission: submission(v['submission']) } : {}),
  }
}
export type Publication = ReturnType<typeof decodePublication>
export function createPublicationClient(transport: HttpTransport) {
  return {
    read: (source: string, id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/software-sources/{source}/candidates/{id}',
        pathParams: { source, id },
        successStatus: 200,
        decode: (v) => decodePublication(v, id),
      }),
    change: (source: string, id: string, body: Operation<PublicationChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/software-sources/{source}/candidates/{id}',
        pathParams: { source, id },
        body,
        successStatus: 200,
        decode: (v) => decodePublication(v, id),
      }),
  }
}
