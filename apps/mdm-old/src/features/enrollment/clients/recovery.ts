import { comparison, nextCursor, queryParameters } from '@rss/api/mdm-query'
import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
/** Administrator-only continuation of existing registration/signing attempts. No device-key owner. */
import type { HttpTransport } from '@rss/api/mdm'
import { array, enumeration, count, nullable, uuid, string } from '../../../services/decode'
import { encoded } from '../../settings/clients/pki'
import { base64url, platforms } from './packages'
export function publicChain(value: unknown) {
  const chain = array(value, (v) => encoded(v, 43692))
  if (!chain.length || chain.length > 4) throw new Error('Invalid certificate chain')
  return chain
}
export function recoveryGrant(value: unknown) {
  if (!wireSchemas.postApiV1AgentRegistrationsByIdRecoveryBody.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
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
  if (!wireSchemas.postApiV1AgentRequestsByIdCancelResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  if (v['wireVersion'] !== 1 || count(v['expiresAt']) === 0)
    throw new Error('Invalid grant receipt')
  return {
    wireVersion: 1 as const,
    grantId: uuid(v['grantId']),
    state: v['state'],
    expiresAt: count(v['expiresAt']),
    platform: enumeration(v['platform'], platforms),
  }
}
export function issuanceCandidate(value: unknown, issuance: string) {
  if (!wireSchemas.postApiV1AgentIssuancesByIdRecoverResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
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
    operation: async (issuance: string, operation: string) => {
      const page = await api.getApiV1AgentIssuancesByIdRecoveryOperations(
        transport,
        {
          pathParams: { id: uuid(issuance) },
          query: queryParameters({
            filter: comparison('operationId', '==', uuid(operation)),
            fields: ['actor', 'instance', 'operationId'],
            limit: 2,
          }),
        },
        (value) => ({
          items: value.items.map((row) => {
            if (row.operationId !== operation || !row.actor || !row.instance)
              throw new Error('Wrong original recovery identity')
            return { actor: string(row.actor), instance: string(row.instance) }
          }),
          nextCursor: nextCursor(value.nextCursor),
        }),
      )
      if (!page.items.length && !page.nextCursor) return null
      if (page.items.length !== 1 || page.nextCursor)
        throw new Error('Ambiguous original recovery identity')
      return api.getApiV1AgentIssuancesByIdRecoveryOperationsByOperation(
        transport,
        { pathParams: { id: uuid(issuance), operation: uuid(operation) }, query: page.items[0]! },
        (v) => nullable(v, (v) => issuanceCandidate(v, issuance)),
      )
    },
    registration: (registration: string, input: RecoveryGrant) =>
      api.postApiV1AgentRegistrationsByIdRecovery(
        transport,
        { pathParams: { id: uuid(registration) }, body: recoveryGrant(input) },
        grantReceipt,
      ),
    issuance: (issuance: string, operationId: string, certificateChain: string[]) =>
      api.postApiV1AgentIssuancesByIdRecover(
        transport,
        {
          pathParams: { id: uuid(issuance) },
          body: {
            wireVersion: 1,
            operationId: uuid(operationId),
            certificateChain: publicChain(certificateChain),
          },
        },
        (v) => issuanceCandidate(v, issuance),
      ),
  }
}
