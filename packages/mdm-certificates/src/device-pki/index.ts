export type * from './model'
export { purposes } from './model'
import { freeze, identifier, uuid } from '@rss/mdm-inventory'
import { encoded, fingerprint, positive, text } from '../values'
import {
  purposes,
  type Purpose,
  type Trust,
  type DevicePkiPort,
  type Prepare,
  type Transition,
  type RotationReceipt,
  type CrlPublication,
  type SigningRecovery,
  type RegistrationRecovery,
  type IssuanceRecovery,
  type IssuanceCandidate,
} from './model'

export function validatePurpose(value: Purpose): void {
  if (!purposes.includes(value)) throw new Error('Unsupported PKI management purpose')
}
export function validateTrust(
  value: Trust,
  tenant: string,
  service: string,
  purpose: Purpose,
): void {
  validatePurpose(purpose)
  if (
    uuid(value.tenant) !== tenant ||
    uuid(value.serviceId) !== service ||
    value.purpose !== purpose
  )
    throw new Error('Wrong public trust binding')
  const origin = new URL(value.origin)
  if (origin.protocol !== 'https:' || origin.origin !== value.origin)
    throw new Error('Invalid public trust origin')
  positive(value.revision)
  if (
    !value.issuers.length ||
    value.issuers.length > 16 ||
    new Set(value.issuers.map((i) => i.digest)).size !== value.issuers.length ||
    value.issuers.filter((i) => i.mode === 'active').length !== 1
  )
    throw new Error('Invalid issuer set')
  for (const issuer of value.issuers) {
    fingerprint(issuer.digest)
    if (!['active', 'prepared', 'verify_only'].includes(issuer.mode))
      throw new Error('Invalid issuer mode')
    encoded(issuer.certificate, 32768)
    encoded(issuer.root, 32768)
    encoded(issuer.crl, 16 * 1024 * 1024)
    encoded(issuer.rootCrl, 16 * 1024 * 1024)
    identifier(issuer.provisioner)
    text(issuer.kid, 1024)
  }
}
export function validatePublicChain(value: readonly string[]): void {
  if (!value.length || value.length > 4) throw new Error('Invalid public certificate chain')
  value.forEach((certificate) => encoded(certificate, 32768))
}
function receipt(
  value: RotationReceipt,
  id: string,
  state: RotationReceipt['state'],
  expectedRevision: number,
): RotationReceipt {
  if (
    uuid(value.operation) !== id ||
    value.state !== state ||
    positive(value.revision) !== expectedRevision + 1
  )
    throw new Error('Wrong rotation receipt')
  return value
}
function candidate(value: IssuanceCandidate, issuance: string): IssuanceCandidate {
  if (uuid(value.issuanceId) !== issuance) throw new Error('Wrong original signing candidate')
  uuid(value.originalSigningOperationId)
  positive(value.activateBefore)
  validatePublicChain(value.certificateChain)
  return value
}
export function validatePrepare(input: Prepare, tenant: string, service: string): void {
  uuid(input.id)
  positive(input.expectedRevision)
  validateTrust(input.candidate, tenant, service, input.purpose)
  if (input.candidate.revision !== input.expectedRevision + 1)
    throw new Error('Wrong candidate revision')
}

export function validateTransition(input: Transition): void {
  uuid(input.id)
  validatePurpose(input.purpose)
  positive(input.expectedRevision)
  if (!['activate', 'retire'].includes(input.action)) throw new Error('Invalid rotation phase')
}

export function validateCrlPublication(input: CrlPublication): void {
  uuid(input.operation)
  validatePurpose(input.purpose)
  if (
    !input.publications.length ||
    input.publications.length > 16 ||
    new Set(input.publications.map((p) => p.issuer)).size !== input.publications.length
  )
    throw new Error('Invalid CRL publication set')
  for (const publication of input.publications) {
    fingerprint(publication.issuer)
    encoded(publication.crl, 16 * 1024 * 1024)
    encoded(publication.rootCrl, 16 * 1024 * 1024)
  }
}

export function validateSigningRecovery(input: SigningRecovery): void {
  uuid(input.operation)
  uuid(input.attempt)
  validatePublicChain(input.chain)
}

export function validateRegistrationRecovery(input: RegistrationRecovery, secret: string): void {
  identifier(input.device, 256)
  uuid(input.operationId)
  if (!['windows', 'macos'].includes(input.platform))
    throw new Error('Unsupported registration platform')
  encoded(input.csr, 32768)
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(secret) ||
    btoa(atob(secret.replaceAll('-', '+').replaceAll('_', '/') + '='))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '') !== secret
  )
    throw new Error('Invalid recovery bootstrap secret')
}

export function validateIssuanceRecovery(input: IssuanceRecovery): void {
  uuid(input.issuance)
  uuid(input.operationId)
  validatePublicChain(input.certificateChain)
}

/** Every write is explicit. A loaded trust read cannot acknowledge an unknown write. */
export function createDevicePki(port: DevicePkiPort, tenant: string, service: string) {
  uuid(tenant)
  uuid(service)
  return Object.freeze({
    async trust(purpose: Purpose) {
      validatePurpose(purpose)
      const value = await port.trust(purpose)
      validateTrust(value, tenant, service, purpose)
      return value
    },
    async prepare(input: Prepare) {
      validatePrepare(input, tenant, service)
      const original = freeze(input)
      return receipt(
        await port.prepare(original),
        original.id,
        'distributing',
        original.expectedRevision,
      )
    },
    async transition(input: Transition) {
      validateTransition(input)
      const original = freeze(input)
      return receipt(
        await port.transition(original),
        original.id,
        original.action === 'activate' ? 'activated' : 'retired',
        original.expectedRevision,
      )
    },
    publish(input: CrlPublication) {
      validateCrlPublication(input)
      return port.publish(freeze(input))
    },
    async recoverSigning(input: SigningRecovery) {
      validateSigningRecovery(input)
      const original = freeze(input),
        result = await port.recoverSigning(original)
      if (result.attempt !== original.attempt)
        throw new Error('Wrong original Windows signing attempt')
      fingerprint(result.fingerprint)
      return result
    },
    observation: (device: string) => port.observation(identifier(device, 256)),
    registrationRecovery: (device: string, operation: string) => port.registrationRecovery(identifier(device, 256), uuid(operation)),
    async recoverRegistration(input: RegistrationRecovery, secret: string) {
      validateRegistrationRecovery(input, secret)
      const original = freeze({
          device: input.device,
          operationId: input.operationId,
          platform: input.platform,
          csr: input.csr,
        }),
        result = await port.recoverRegistration(original, secret)
      uuid(result.grantId)
      positive(result.expiresAt)
      if (result.platform !== original.platform) throw new Error('Wrong recovery grant platform')
      return result
    },
    async recoverIssuance(input: IssuanceRecovery) {
      validateIssuanceRecovery(input)
      const original = freeze(input)
      return candidate(await port.recoverIssuance(original), original.issuance)
    },
    async issuanceRecovery(issuance: string, administrativeOperationId: string) {
      uuid(issuance)
      uuid(administrativeOperationId)
      const result = await port.issuanceRecovery(issuance, administrativeOperationId)
      return result === null ? null : candidate(result, issuance)
    },
  })
}
export type DevicePki = ReturnType<typeof createDevicePki>
