import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  nullable,
  record,
  string,
  uuid,
} from '../../../services/decode'
import {
  architectures,
  platforms,
  type Architecture,
  type Platform,
} from '../../policies/clients/resources'
import { softwareSource } from '../../policies/clients/software-definition'
import { candidate } from './candidate'
export interface ImportQuery {
  source: string
  revision: string
  package: string
  version: string
  platform: Platform
  architecture: Architecture
}
export function importResolution(value: unknown) {
  const v = closed(value, [
    'id',
    'source',
    'ecosystem',
    'package',
    'version',
    'platform',
    'architecture',
    'definitionDigest',
    'expiresAt',
  ])
  return {
    id: uuid(v['id']),
    source: softwareSource(v['source']),
    ecosystem: enumeration(v['ecosystem'], ['winget', 'brew'] as const),
    package: identifier(v['package']),
    version: identifier(v['version']),
    platform: enumeration(v['platform'], platforms),
    architecture: enumeration(v['architecture'], architectures),
    definitionDigest: digest(v['definitionDigest']),
    expiresAt: count(v['expiresAt']),
  }
}
export function importJob(value: unknown, id: string) {
  const v = closed(value, [
    'id',
    'revision',
    'operation',
    'resolution',
    'resource',
    'version',
    'status',
    'failure',
    'resourceRevision',
  ])
  if (uuid(v['id']) !== id) throw new Error('Wrong import job')
  const result = {
    id,
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    resolution: importResolution(v['resolution']),
    resource: identifier(v['resource']),
    version: identifier(v['version']),
    status: enumeration(v['status'], [
      'pending',
      'completed',
      'failed',
      'cancelled',
      'unknown',
    ] as const),
    failure: nullable(v['failure'], (v) =>
      enumeration(v, [
        'source_withdrawn',
        'resource_conflict',
        'content_invalid',
        'unsupported',
      ] as const),
    ),
    resourceRevision: nullable(v['resourceRevision'], count),
  }
  if (
    (result.status === 'completed') !== (result.resourceRevision !== null) ||
    (result.status === 'failed') !== (result.failure !== null)
  )
    throw new Error('Invalid import outcome')
  return result
}
export type ImportResolution = ReturnType<typeof importResolution>
export type ImportJob = ReturnType<typeof importJob>
export type ImportChange =
  | {
      action: 'start'
      resolution: string
      resource: string
      version: string
      expectedResourceRevision: number
    }
  | { action: 'cancel' | 'reconcile' }
export function createImportsClient(transport: HttpTransport, tenant: string, demo: boolean) {
  const envelope = (value: unknown, keys: string[]) => candidate(value, tenant, demo, keys)
  const read = (v: unknown, id: string) => importJob(envelope(v, ['job'])['job'], id)
  return {
    resolve: (query: ImportQuery) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/import-resolutions',
        query: { ...query },
        successStatus: 200,
        decode(value) {
          const v = importResolution(envelope(value, ['resolution'])['resolution'])
          if (
            v.source.id !== query.source ||
            v.source.revision !== query.revision ||
            v.package !== query.package ||
            v.version !== query.version ||
            v.platform !== query.platform ||
            v.architecture !== query.architecture
          )
            throw new Error('Wrong import resolution')
          return v
        },
      }),
    list: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/imports',
        query: { cursor, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = envelope(value, ['snapshot', 'items', 'nextCursor'])
          return {
            snapshot: uuid(v['snapshot']),
            items: array(v['items'], (v) => importJob(v, uuid(record(v)['id']))),
            nextCursor: nullable(v['nextCursor'], string),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/imports/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => read(v, id),
      }),
    change: (id: string, body: Operation<ImportChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/software/imports/{id}',
        pathParams: { id },
        body,
        successStatus: body.input.action === 'start' ? 202 : 200,
        decode(value) {
          const job = read(value, id)
          if (job.operation !== body.operationId) throw new Error('Wrong import receipt')
          return job
        },
      }),
  }
}
