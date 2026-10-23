import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { positive, sha256 } from './value'
export function taskTrust(value: unknown, tenant: string) {
  const v = closed(value, ['version', 'service_id', 'tenant', 'revision', 'keys'])
  if (v['version'] !== 1 || uuid(v['tenant']) !== tenant)
    throw new Error('Wrong task trust binding')
  const keys = unique(
    array(v['keys'], (value) => {
      const k = closed(value, ['id', 'public_key', 'state']),
        publicKey = string(k['public_key'])
      if (
        !/^[A-Za-z0-9_-]{43}$/.test(publicKey) ||
        btoa(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='))
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_') !== publicKey
      )
        throw new Error('Invalid task public key')
      return {
        id: identifier(k['id']),
        public_key: publicKey,
        state: enumeration(k['state'], ['prepared', 'active', 'verify_only'] as const),
      }
    }),
    (k) => k.id,
  )
  if (
    !keys.length ||
    keys.length > 16 ||
    keys.filter((k) => k.state === 'active').length !== 1 ||
    new Set(keys.map((k) => k.public_key)).size !== keys.length ||
    keys.some((k, i) => i > 0 && keys[i - 1]!.id >= k.id)
  )
    throw new Error('Invalid task key set')
  return {
    version: 1 as const,
    service_id: uuid(v['service_id']),
    tenant,
    revision: positive(v['revision']),
    keys,
  }
}
export function installationObservation(value: unknown) {
  return nullable(value, (value) => {
    const v = closed(value, ['observation', 'received_at']),
      o = closed(v['observation'], [
        'operation',
        'version',
        'registration',
        'generation',
        'sequence',
        'target_revision',
        'target_digest',
        'actual_revision',
        'actual_digest',
        'state',
        'reason',
        'observed_at',
      ])
    if (o['version'] !== 1) throw new Error('Unsupported observation')
    const result = {
      operation: uuid(o['operation']),
      version: 1 as const,
      registration: uuid(o['registration']),
      generation: positive(o['generation']),
      sequence: positive(o['sequence']),
      target_revision: nullable(o['target_revision'], positive),
      target_digest: nullable(o['target_digest'], sha256),
      actual_revision: nullable(o['actual_revision'], positive),
      actual_digest: nullable(o['actual_digest'], sha256),
      state: enumeration(o['state'], ['received', 'applied', 'failed', 'unknown'] as const),
      reason: nullable(o['reason'], (v) =>
        enumeration(v, [
          'transport',
          'validation',
          'storage',
          'credential',
          'installation',
          'restart',
        ] as const),
      ),
      observed_at: count(o['observed_at']),
    }
    if (
      (result.target_revision === null) !== (result.target_digest === null) ||
      (result.actual_revision === null) !== (result.actual_digest === null)
    )
      throw new Error('Unpaired observation')
    return { observation: result, received_at: count(v['received_at']) }
  })
}
export type TaskTrust = ReturnType<typeof taskTrust>
export type TaskChange =
  | { action: 'prepare'; expectedRevision: number }
  | { action: 'activate' | 'retire'; expectedRevision: number; keyId: string }
export function createTaskTrustClient(transport: HttpTransport, tenant: string) {
  const decode = (v: unknown) => taskTrust(v, tenant)
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/task-signing/trust',
        successStatus: 200,
        decode,
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/task-signing/operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode,
      }),
    change: (id: string, body: TaskChange) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/task-signing/trust',
        headers: { 'Idempotency-Key': uuid(id) },
        body,
        successStatus: 200,
        decode,
      }),
    observation: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/task-signing/trust/devices/{device}/observation',
        pathParams: { device: identifier(device) },
        successStatus: 200,
        decode: installationObservation,
      }),
  }
}
