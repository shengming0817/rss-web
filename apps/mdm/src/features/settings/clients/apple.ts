import * as api from '@rss/api/mdm-operations'
import { operationReceipt, positive, publicText, sha256 } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export const applePurposes = ['apns', 'profile', 'managed_account'] as const
export type ApplePurpose = (typeof applePurposes)[number]
export function appleDirectory(value: unknown) {
  const v = closed(value, [
    'revision',
    'desiredRevision',
    'versions',
    'runtimeObservation',
    'accountBindings',
  ])
  if (v['runtimeObservation'] !== 'separate') throw new Error('Invalid observation boundary')
  const accounts = Object.fromEntries(
    Object.entries(record(v['accountBindings'])).map(([id, v]) => [string(id), positive(v)]),
  )
  return {
    revision: count(v['revision']),
    desiredRevision: nullable(v['desiredRevision'], positive),
    accountBindings: accounts,
    versions: unique(
      array(v['versions'], (value) => {
        const m = closed(value, [
          'revision',
          'keyId',
          'publicKeyDigest',
          'csr',
          'certificateChainPem',
          'certificateDigest',
          'topic',
          'expiresAt',
          'revoked',
        ])
        return {
          revision: positive(m['revision']),
          keyId: uuid(m['keyId']),
          publicKeyDigest: sha256(m['publicKeyDigest']),
          csr: publicText(m['csr']),
          certificateChainPem: nullable(m['certificateChainPem'], (v) => publicText(v)),
          certificateDigest: nullable(m['certificateDigest'], sha256),
          topic: nullable(m['topic'], string),
          expiresAt: nullable(m['expiresAt'], count),
          revoked: boolean(m['revoked']),
        }
      }),
      (v) => v.revision,
    ),
  }
}
export function appleReceipt(value: unknown) {
  const state = enumeration(record(value)['state'], [
    'awaiting_certificate',
    'validated',
    'pending_application',
    'revoked',
  ] as const)
  const extra =
    state === 'awaiting_certificate'
      ? ['keyId', 'csr', 'publicKeyDigest']
      : state === 'validated'
        ? ['keyId', 'certificateDigest', 'expiresAt']
        : state === 'pending_application'
          ? ['desiredRevision']
          : ['materialRevision']
  const v = closed(value, ['operationId', 'revision', 'state', ...extra])
  const common = { operationId: uuid(v['operationId']), revision: positive(v['revision']) }
  switch (state) {
    case 'awaiting_certificate':
      return {
        ...common,
        state,
        keyId: uuid(v['keyId']),
        csr: publicText(v['csr']),
        publicKeyDigest: sha256(v['publicKeyDigest']),
      }
    case 'validated':
      return {
        ...common,
        state,
        keyId: uuid(v['keyId']),
        certificateDigest: sha256(v['certificateDigest']),
        expiresAt: count(v['expiresAt']),
      }
    case 'pending_application':
      return { ...common, state, desiredRevision: positive(v['desiredRevision']) }
    case 'revoked':
      return { ...common, state, materialRevision: positive(v['materialRevision']) }
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
        { pathParams: { purpose: enumeration(purpose, applePurposes) } },
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
          pathParams: { purpose: enumeration(purpose, applePurposes) },
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
          pathParams: { purpose: enumeration(purpose, applePurposes) },
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
          pathParams: { purpose: enumeration(purpose, applePurposes) },
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
          pathParams: { purpose: enumeration(purpose, applePurposes) },
          headers: { 'Idempotency-Key': uuid(id) },
          body: input,
        },
        receiptFor(id),
      ),
  }
}
