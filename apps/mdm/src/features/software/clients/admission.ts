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
  string,
  uuid,
} from '../../../services/decode'
import { softwareSource } from '../../policies/clients/software-definition'
export function sourceDefinition(value: unknown) {
  const v = closed(value, ['id', 'revision', 'kind', 'location', 'publishers'])
  return {
    id: identifier(v['id']),
    revision: identifier(v['revision']),
    kind: enumeration(v['kind'], ['private', 'winget', 'brew'] as const),
    location: nullable(v['location'], string),
    publishers: array(v['publishers'], identifier),
  }
}
export type SourceDefinition = ReturnType<typeof sourceDefinition>
export function admission(value: unknown) {
  const v = closed(value, ['revision', 'state', 'operation', 'actor', 'evidence', 'at', 'digest'])
  return {
    revision: count(v['revision']),
    state: enumeration(v['state'], ['registered', 'approved', 'withdrawn'] as const),
    operation: uuid(v['operation']),
    actor: identifier(v['actor']),
    evidence: array(v['evidence'], identifier),
    at: integer(v['at']),
    digest: digest(v['digest']),
  }
}
export type AdmissionChange = { action: 'approve' | 'withdraw'; evidence: string[] }
export type SourceChange = { action: 'register'; definition: SourceDefinition } | AdmissionChange
export function sourceRead(value: unknown, id: string, revision: string) {
  const v = closed(value, ['source', 'snapshot', 'admission']),
    source = sourceDefinition(v['source']),
    snapshot = softwareSource(v['snapshot'])
  if (
    source.id !== id ||
    source.revision !== revision ||
    snapshot.id !== id ||
    snapshot.revision !== revision
  )
    throw new Error('Wrong source')
  return { source, snapshot, admission: admission(v['admission']) }
}
function versionReceipt(value: unknown, id: string, version: string) {
  const v = closed(value, ['resource', 'version', 'admission'])
  if (v['resource'] !== id || v['version'] !== version) throw new Error('Wrong software version')
  return { resource: id, version, admission: admission(v['admission']) }
}
function mutationReceipt<T extends { admission: ReturnType<typeof admission> }>(
  receipt: T,
  operationId: string,
): T {
  if (receipt.admission.operation !== operationId) throw new Error('Wrong admission operation')
  return receipt
}
export function createAdmissionClient(transport: HttpTransport) {
  return {
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
          const v = closed(value, ['resource', 'version', 'resourceDigest', 'admission'])
          if (v['resource'] !== id || v['version'] !== version)
            throw new Error('Wrong software version')
          return {
            resource: id,
            version,
            resourceDigest: digest(v['resourceDigest']),
            admission: nullable(v['admission'], admission),
          }
        },
      }),
    changeVersion: (id: string, version: string, body: Operation<AdmissionChange>) =>
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
