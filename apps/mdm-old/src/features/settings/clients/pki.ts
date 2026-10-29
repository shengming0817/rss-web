import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import { array, identifier, string, unique, uuid } from '../../../services/decode'
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
export function pkiTrust(value: unknown, tenant: string, purpose: PkiPurpose, service?: string) {
  if (!wireSchemas.postApiV1PkiRotationsBody.validateTrust(value))
    throw new Error('Invalid contract value')

  const v = value
  if (
    v['version'] !== 1 ||
    v['tenant'] !== tenant ||
    v['purpose'] !== purpose ||
    (service !== undefined && uuid(v['service_id']) !== service)
  )
    throw new Error('Wrong PKI trust binding')
  const issuers = unique(
    array(v['issuers'], (value) => {
      const i = value
      return {
        digest: sha256(i['digest']),
        mode: i['mode'],
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
    service_id: uuid(v['service_id']),
    origin: origin(v['origin']),
    tenant: uuid(tenant),
    purpose,
    revision: positive(v['revision']),
    issuers,
  }
}
export type PkiTrust = ReturnType<typeof pkiTrust>
export function pkiReceipt(value: unknown) {
  if (!wireSchemas.postApiV1PkiRotationsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    operation: uuid(v['operation']),
    revision: positive(v['revision']),
    state: v['state'],
  }
}
export interface Publication {
  issuer: string
  crl: string
  root_crl: string
}
export function pkiPublications(value: unknown): Publication[] {
  const items = unique(
    array(value, (value) => {
      if (!wireSchemas.postApiV1PkiCrlsBody.validatePublication(value))
        throw new Error('Invalid contract value')

      const v = value
      return {
        issuer: sha256(v['issuer']),
        crl: encoded(v['crl']),
        root_crl: encoded(v['root_crl']),
      }
    }),
    (v) => v.issuer,
  )
  if (!items.length || items.length > 16) throw new Error('Invalid publication set')
  return items
}
export function createPkiClient(transport: HttpTransport, tenant: string, service: string) {
  return {
    read: (purpose: PkiPurpose) =>
      api.getApiV1PkiByPurposeTrust(transport, { pathParams: { purpose: purpose } }, (v) =>
        pkiTrust(v, tenant, purpose, service),
      ),
    prepare: (id: string, purpose: PkiPurpose, expectedRevision: number, candidate: PkiTrust) =>
      api.postApiV1PkiRotations(
        transport,
        {
          body: {
            id: uuid(id),
            purpose: purpose,
            expected_revision: positive(expectedRevision),
            candidate: pkiTrust(candidate, tenant, purpose, service),
          },
        },
        (value) => {
          const result = pkiReceipt(value)
          if (result.operation !== id || result.state !== 'distributing')
            throw new Error('Wrong original rotation')
          return result
        },
      ),
    transition: (
      id: string,
      purpose: PkiPurpose,
      expectedRevision: number,
      action: 'activate' | 'retire',
    ) =>
      api.postApiV1PkiByPurposeRotations(
        transport,
        {
          pathParams: { purpose: purpose },
          body: { id: uuid(id), expected_revision: positive(expectedRevision), action },
        },
        (value) => {
          const result = pkiReceipt(value)
          if (
            result.operation !== id ||
            result.state !== (action === 'activate' ? 'activated' : 'retired')
          )
            throw new Error('Wrong original rotation')
          return result
        },
      ),
    publish: (id: string, purpose: PkiPurpose, publications: Publication[]) =>
      api.postApiV1PkiCrls(transport, {
        body: {
          operation: uuid(id),
          purpose,
          publications: pkiPublications(publications),
        },
      }),
    recover: (id: string, attempt: string, chain: string[]) =>
      api.postApiV1PkiSigningRecover(
        transport,
        {
          body: {
            operation: uuid(id),
            attempt: uuid(attempt),
            chain: chain.map((v) => encoded(v, 45000)),
          },
        },
        (value) => {
          const v = value
          if (v['attempt'] !== attempt) throw new Error('Wrong signing attempt')
          return { attempt: uuid(v['attempt']), fingerprint: sha256(v['fingerprint']) }
        },
      ),
    observation: (device: string) =>
      api.getApiV1PkiAgentTrustDevicesByDeviceObservation(
        transport,
        { pathParams: { device: identifier(device) } },
        installationObservation,
      ),
  }
}
