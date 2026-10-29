import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import type { HttpTransport } from '@rss/api/mdm'
import {
  validatePublicChain,
  validateTrust,
  type DevicePkiPort,
  type GrantReceipt,
  type IssuanceCandidate,
  type Observation,
  type Purpose,
  type RotationReceipt,
  type Trust,
} from '@rss/mdm-certificates/device-pki'
import { count, nullable, positive, text, uuid } from './decode'
import { integer, requestInput } from './inventory-values'

function trust(value: unknown, tenant: string, service: string, purpose: Purpose): Trust {
  if (!schema.getApiV1PkiByPurposeTrustResponse.validateRoot(value) || value.version !== 1)
    throw new Error('Invalid device public trust')
  const result: Trust = {
    tenant: uuid(value.tenant),
    serviceId: uuid(value.service_id),
    purpose,
    origin: value.origin,
    revision: positive(value.revision),
    issuers: value.issuers.map((issuer) => ({
      digest: issuer.digest,
      mode: issuer.mode,
      certificate: issuer.certificate,
      root: issuer.root,
      crl: issuer.crl,
      rootCrl: issuer.root_crl,
      provisioner: issuer.provisioner,
      kid: issuer.kid,
    })),
  }
  if (value.purpose !== purpose) throw new Error('Wrong trust purpose')
  validateTrust(result, tenant, service, purpose)
  return result
}
function trustInput(value: Trust) {
  return {
    version: 1,
    service_id: value.serviceId,
    tenant: value.tenant,
    origin: value.origin,
    purpose: value.purpose,
    revision: value.revision,
    issuers: value.issuers.map((issuer) => ({
      digest: issuer.digest,
      mode: issuer.mode,
      certificate: issuer.certificate,
      root: issuer.root,
      crl: issuer.crl,
      root_crl: issuer.rootCrl,
      provisioner: issuer.provisioner,
      kid: issuer.kid,
    })),
  }
}
function receipt(value: unknown, operation: string): RotationReceipt {
  if (!schema.postApiV1PkiRotationsResponse.validateRoot(value) || value.operation !== operation)
    throw new Error('Wrong PKI operation receipt')
  return {
    operation: uuid(value.operation),
    revision: positive(value.revision),
    state: value.state,
  }
}
function candidate(value: unknown, issuance: string): IssuanceCandidate {
  if (
    !schema.postApiV1AgentIssuancesByIdRecoverResponse.validateRoot(value) ||
    value.wireVersion !== 1 ||
    value.issuanceId !== issuance
  )
    throw new Error('Wrong original signing candidate')
  validatePublicChain(value.certificateChain)
  return {
    issuanceId: uuid(value.issuanceId),
    originalSigningOperationId: uuid(value.operationId),
    activateBefore: positive(value.activateBefore),
    certificateChain: [...value.certificateChain],
  }
}
function grant(value: unknown): GrantReceipt {
  if (
    !schema.postApiV1AgentRegistrationsByIdRecoveryResponse.validateRoot(value) ||
    value.wireVersion !== 1
  )
    throw new Error('Invalid registration recovery grant')
  return {
    grantId: uuid(value.grantId),
    expiresAt: positive(value.expiresAt),
    platform: value.platform,
    state: value.state,
  }
}
function observation(value: unknown): Observation | null {
  if (!schema.getApiV1PkiAgentTrustDevicesByDeviceObservationResponse.validateRoot(value))
    throw new Error('Invalid Agent installation observation')
  if (value === null) return null
  const item = value.observation
  function coordinates(revision: number | null, digest: string | null) {
    if ((revision === null) !== (digest === null)) throw new Error('Unpaired trust observation')
    return revision === null ? null : { revision: positive(revision), digest: text(digest) }
  }
  if (item.version !== 1) throw new Error('Unsupported trust observation')
  return {
    operation: uuid(item.operation),
    registration: uuid(item.registration),
    generation: positive(item.generation),
    sequence: positive(item.sequence),
    target: coordinates(item.target_revision, item.target_digest),
    actual: coordinates(item.actual_revision, item.actual_digest),
    state: item.state,
    reason: item.reason,
    observedAt: count(item.observed_at),
    receivedAt: integer(value.received_at),
  }
}
/** Management ports only. Device private keys, issuer providers and registration ownership stay out. */
export function createDevicePkiAdapter(
  transport: HttpTransport,
  tenant: string,
  service: string,
): DevicePkiPort {
  return {
    trust: (purpose) =>
      api.getApiV1PkiByPurposeTrust(transport, { pathParams: { purpose } }, (value) =>
        trust(value, tenant, service, purpose),
      ),
    prepare: (input) =>
      api.postApiV1PkiRotations(
        transport,
        {
          body: requestInput(
            {
              id: input.id,
              purpose: input.purpose,
              expected_revision: input.expectedRevision,
              candidate: trustInput(input.candidate),
            },
            schema.postApiV1PkiRotationsBody.validateRoot,
          ),
        },
        (value) => receipt(value, input.id),
      ),
    transition: (input) =>
      api.postApiV1PkiByPurposeRotations(
        transport,
        {
          pathParams: { purpose: input.purpose },
          body: { id: input.id, expected_revision: input.expectedRevision, action: input.action },
        },
        (value) => receipt(value, input.id),
      ),
    publish: (input) =>
      api.postApiV1PkiCrls(transport, {
        body: {
          operation: input.operation,
          purpose: input.purpose,
          publications: input.publications.map((publication) => ({
            issuer: publication.issuer,
            crl: publication.crl,
            root_crl: publication.rootCrl,
          })),
        },
      }),
    recoverSigning: (input) =>
      api.postApiV1PkiSigningRecover(
        transport,
        { body: { operation: input.operation, attempt: input.attempt, chain: [...input.chain] } },
        (value) => {
          if (
            !schema.postApiV1PkiSigningRecoverResponse.validateRoot(value) ||
            value.attempt !== input.attempt
          )
            throw new Error('Wrong original signing attempt')
          return { attempt: uuid(value.attempt), fingerprint: value.fingerprint }
        },
      ),
    observation: (device) =>
      api.getApiV1PkiAgentTrustDevicesByDeviceObservation(
        transport,
        { pathParams: { device } },
        observation,
      ),
    recoverRegistration: (input, secret) =>
      api.postApiV1AgentRegistrationsByIdRecovery(
        transport,
        {
          pathParams: { id: input.registration },
          body: {
            wireVersion: 1,
            operationId: input.operationId,
            secret,
            platform: input.platform,
            csr: input.csr,
          },
        },
        grant,
      ),
    recoverIssuance: (input) =>
      api.postApiV1AgentIssuancesByIdRecover(
        transport,
        {
          pathParams: { id: input.issuance },
          body: {
            wireVersion: 1,
            operationId: input.operationId,
            certificateChain: [...input.certificateChain],
          },
        },
        (value) => candidate(value, input.issuance),
      ),
    issuanceRecovery: (issuance, operation) =>
      api.getApiV1AgentIssuancesByIdRecoveryOperationsByOperation(
        transport,
        { pathParams: { id: issuance, operation } },
        (value) => nullable(value, (value) => candidate(value, issuance)),
      ),
  }
}
