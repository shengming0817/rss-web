import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
  enumeration,
  identifier,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { origin, positive, publicText, sha256 } from './value'
import { installationObservation } from './trust'
export const pkiPurposes = ['windows', 'apple', 'agent'] as const
export type PkiPurpose = (typeof pkiPurposes)[number]
export function encoded(value: unknown, max = 24 * 1024 * 1024) {
  const s = publicText(value, max)
  if (!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s))
    throw new Error('Invalid encoded public material')
  return s
}
export function pkiTrust(value: unknown, tenant: string, purpose: PkiPurpose) {
  const v = closed(value, ['version', 'origin', 'tenant', 'purpose', 'revision', 'issuers'])
  if (v['version'] !== 1 || v['tenant'] !== tenant || v['purpose'] !== purpose)
    throw new Error('Wrong PKI trust binding')
  const issuers = unique(
    array(v['issuers'], (value) => {
      const i = closed(value, [
        'digest',
        'mode',
        'certificate',
        'root',
        'crl',
        'root_crl',
        'provisioner',
        'kid',
      ])
      return {
        digest: sha256(i['digest']),
        mode: enumeration(i['mode'], ['prepared', 'active', 'verify_only'] as const),
        certificate: encoded(i['certificate'], 45000),
        root: encoded(i['root'], 45000),
        crl: encoded(i['crl']),
        root_crl: encoded(i['root_crl']),
        provisioner: identifier(i['provisioner']),
        kid: string(i['kid']),
      }
    }),
    (i) => i.digest,
  )
  if (
    !issuers.length ||
    issuers.length > 16 ||
    issuers.filter((i) => i.mode === 'active').length !== 1
  )
    throw new Error('Invalid issuer set')
  return {
    version: 1 as const,
    origin: origin(v['origin']),
    tenant: uuid(tenant),
    purpose,
    revision: positive(v['revision']),
    issuers,
  }
}
export type PkiTrust = ReturnType<typeof pkiTrust>
export function pkiReceipt(value: unknown) {
  const v = closed(value, ['operation', 'revision', 'state'])
  return {
    operation: uuid(v['operation']),
    revision: positive(v['revision']),
    state: enumeration(v['state'], ['distributing', 'activated', 'retired'] as const),
  }
}
export interface Publication {
  issuer: string
  crl: string
  root_crl: string
}
export function createPkiClient(transport: HttpTransport, tenant: string) {
  return {
    read: (purpose: PkiPurpose) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/pki/{purpose}/trust',
        pathParams: { purpose: enumeration(purpose, pkiPurposes) },
        successStatus: 200,
        decode: (v) => pkiTrust(v, tenant, purpose),
      }),
    prepare: (id: string, purpose: PkiPurpose, expectedRevision: number, candidate: PkiTrust) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/pki/rotations',
        body: {
          id: uuid(id),
          purpose: enumeration(purpose, pkiPurposes),
          expected_revision: positive(expectedRevision),
          candidate: pkiTrust(candidate, tenant, purpose),
        },
        successStatus: 200,
        decode(value) {
          const result = pkiReceipt(value)
          if (result.operation !== id || result.state !== 'distributing')
            throw new Error('Wrong original rotation')
          return result
        },
      }),
    transition: (
      id: string,
      purpose: PkiPurpose,
      expectedRevision: number,
      action: 'activate' | 'retire',
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/pki/{purpose}/rotations',
        pathParams: { purpose: enumeration(purpose, pkiPurposes) },
        body: { id: uuid(id), expected_revision: positive(expectedRevision), action },
        successStatus: 200,
        decode(value) {
          const result = pkiReceipt(value)
          if (
            result.operation !== id ||
            result.state !== (action === 'activate' ? 'activated' : 'retired')
          )
            throw new Error('Wrong original rotation')
          return result
        },
      }),
    publish: (id: string, purpose: PkiPurpose, publications: Publication[]) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/pki/crls',
        body: {
          operation: uuid(id),
          purpose,
          publications: publications.map((p) => ({
            issuer: sha256(p.issuer),
            crl: encoded(p.crl),
            root_crl: encoded(p.root_crl),
          })),
        },
        successStatus: 204,
      }),
    recover: (id: string, attempt: string, chain: string[]) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/pki/signing/recover',
        body: {
          operation: uuid(id),
          attempt: uuid(attempt),
          chain: chain.map((v) => encoded(v, 45000)),
        },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['attempt', 'fingerprint'])
          if (v['attempt'] !== attempt) throw new Error('Wrong signing attempt')
          return { attempt: uuid(v['attempt']), fingerprint: sha256(v['fingerprint']) }
        },
      }),
    observation: (device: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/pki/agent/trust/devices/{device}/observation',
        pathParams: { device: identifier(device) },
        successStatus: 200,
        decode: installationObservation,
      }),
  }
}
