/** Administrator-only continuation of existing registration/signing attempts. No device-key owner. */
import type { HttpTransport } from '@rss/api/mdm'
import { array, closed, enumeration, count, uuid } from '../../../services/decode'
import { encoded } from '../../settings/clients/pki'
import { base64url, platforms } from './packages'
export function publicChain(value: unknown) {
  const chain = array(value, (v) => encoded(v, 43692))
  if (!chain.length || chain.length > 4) throw new Error('Invalid certificate chain')
  return chain
}
export function recoveryGrant(value: unknown) {
  const v = closed(value, ['wireVersion', 'operationId', 'secret', 'platform', 'csr'])
  if (v['wireVersion'] !== 1) throw new Error('Invalid enrollment version')
  return {
    wireVersion: 1 as const,
    operationId: uuid(v['operationId']),
    secret: base64url(v['secret'], 32),
    platform: enumeration(v['platform'], platforms),
    csr: encoded(v['csr'], 43692),
  }
}
export type RecoveryGrant = ReturnType<typeof recoveryGrant>
export function grantReceipt(value: unknown) {
  const v = closed(value, ['wireVersion', 'grantId', 'state', 'expiresAt', 'platform'])
  if (v['wireVersion'] !== 1 || count(v['expiresAt']) === 0)
    throw new Error('Invalid grant receipt')
  return {
    wireVersion: 1 as const,
    grantId: uuid(v['grantId']),
    state: enumeration(v['state'], [
      'pending',
      'available',
      'consumed',
      'revoked',
      'expired',
    ] as const),
    expiresAt: count(v['expiresAt']),
    platform: enumeration(v['platform'], platforms),
  }
}
export function issuanceCandidate(value: unknown, issuance: string) {
  const v = closed(value, [
    'wireVersion',
    'issuanceId',
    'operationId',
    'certificateChain',
    'activateBefore',
  ])
  if (
    v['wireVersion'] !== 1 ||
    uuid(v['issuanceId']) !== issuance ||
    count(v['activateBefore']) === 0
  )
    throw new Error('Wrong original issuance')
  return {
    wireVersion: 1 as const,
    issuanceId: issuance,
    operationId: uuid(v['operationId']),
    certificateChain: publicChain(v['certificateChain']),
    activateBefore: count(v['activateBefore']),
  }
}
export function createRecoveryClient(transport: HttpTransport) {
  return {
    registration: (registration: string, input: RecoveryGrant) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-registrations/{registration}/recovery',
        pathParams: { registration: uuid(registration) },
        body: recoveryGrant(input),
        successStatus: 200,
        decode: grantReceipt,
      }),
    issuance: (issuance: string, operationId: string, certificateChain: string[]) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/agent-issuances/{issuance}/recover',
        pathParams: { issuance: uuid(issuance) },
        body: {
          wireVersion: 1,
          operationId: uuid(operationId),
          certificateChain: publicChain(certificateChain),
        },
        successStatus: 200,
        decode: (v) => issuanceCandidate(v, issuance),
      }),
  }
}
