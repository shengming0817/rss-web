import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { operationReceipt, positive, publicText, sha256 } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, nullable, string, unique, uuid } from '../../../services/decode'
export const applePurposes = ['apns', 'profile', 'managed_account'] as const
export type ApplePurpose = (typeof applePurposes)[number]
export function appleDirectory(value: unknown) {
  if (!wireSchemas.getApiV1AppleMaterialsByPurposeResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  if (v['runtimeObservation'] !== 'separate') throw new Error('Invalid observation boundary')
  const accounts = Object.fromEntries(
    Object.entries(v['accountBindings']).map(([id, v]) => [string(id), positive(v)]),
  )
  return {
    revision: count(v['revision']),
    desiredRevision: nullable(v['desiredRevision'], positive),
    accountBindings: accounts,
    versions: unique(
      array(Object.values(v['materials']), (value) => {
        const m = value
        return {
          revision: positive(m['revision']),
          keyId: uuid(m['keyId']),
          publicKeyDigest: sha256(m['publicKeyDigest']),
          csr: publicText(m['csr']),
          certificateChainPem: nullable(m['certificateChainPem'], (v) => publicText(v)),
          certificateDigest: nullable(m['certificateDigest'], sha256),
          topic: nullable(m['topic'], string),
          expiresAt: nullable(m['expiresAt'], count),
          revoked: m['revoked'],
        }
      }),
      (v) => v.revision,
    ),
  }
}
export function appleReceipt(value: unknown) {
  if (!wireSchemas.getApiV1AppleMaterialOperationsByOperationResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const common = { operationId: uuid(v['operationId']), revision: positive(v['revision']) }
  switch (v.state) {
    case 'awaiting_certificate':
      return {
        ...common,
        state: v.state,
        keyId: uuid(v['keyId']),
        csr: publicText(v['csr']),
        publicKeyDigest: sha256(v['publicKeyDigest']),
      }
    case 'validated':
      return {
        ...common,
        state: v.state,
        keyId: uuid(v['keyId']),
        certificateDigest: sha256(v['certificateDigest']),
        expiresAt: count(v['expiresAt']),
      }
    case 'pending_application':
      return { ...common, state: v.state, desiredRevision: positive(v['desiredRevision']) }
    case 'revoked':
      return { ...common, state: v.state, materialRevision: positive(v['materialRevision']) }
  }
}
export type AppleDirectory = ReturnType<typeof appleDirectory>
export type AppleReceipt = ReturnType<typeof appleReceipt>
export type AppleKeyInput = {
  expectedRevision: number
  source: { kind: 'generate' } | { kind: 'import'; private_key_pem: string }
}
export function createAppleMaterials(transport: HttpTransport) {
  const receiptFor = (id: string) => (value: unknown) => {
    const v = appleReceipt(value)
    if (v.operationId !== id) throw new Error('Wrong operation')
    return v
  }
  return {
    read: (purpose: ApplePurpose) =>
      api.getApiV1AppleMaterialsByPurpose(
        transport,
        { pathParams: { purpose: purpose } },
        appleDirectory,
      ),
    operation: (id: string) =>
      api.getApiV1AppleMaterialOperationsByOperation(
        transport,
        { pathParams: { operation: uuid(id) } },
        operationReceipt(id, appleReceipt),
      ),
    key: (id: string, purpose: ApplePurpose, input: AppleKeyInput) =>
      api.postApiV1AppleMaterialsByPurposeKeys(
        transport,
        {
          pathParams: { purpose: purpose },
          headers: { 'Idempotency-Key': uuid(id) },
          body: input,
        },
        receiptFor(id),
      ),
    certificate: (
      id: string,
      purpose: ApplePurpose,
      input: { expectedRevision: number; keyRevision: number; certificateChainPem: string },
    ) =>
      api.postApiV1AppleMaterialsByPurposeCertificates(
        transport,
        {
          pathParams: { purpose: purpose },
          headers: { 'Idempotency-Key': uuid(id) },
          body: input,
        },
        receiptFor(id),
      ),
    apply: (
      id: string,
      purpose: ApplePurpose,
      input: { expectedRevision: number; materialRevision: number; accountAlias: string | null },
    ) =>
      api.postApiV1AppleMaterialsByPurposeApply(
        transport,
        {
          pathParams: { purpose: purpose },
          headers: { 'Idempotency-Key': uuid(id) },
          body: input,
        },
        receiptFor(id),
      ),
    revoke: (
      id: string,
      purpose: ApplePurpose,
      input: { expectedRevision: number; materialRevision: number },
    ) =>
      api.postApiV1AppleMaterialsByPurposeRevoke(
        transport,
        {
          pathParams: { purpose: purpose },
          headers: { 'Idempotency-Key': uuid(id) },
          body: input,
        },
        receiptFor(id),
      ),
  }
}
