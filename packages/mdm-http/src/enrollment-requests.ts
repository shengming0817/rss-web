import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { AgentRequest, WindowsRequest, RequestHistoryPort } from '@rss/mdm-enrollment/requests'
function agent(value: unknown): AgentRequest {
  if (!schema.getApiV1TenantsByTenantAgentRequestsByIdResponse.validateRoot(value))
    throw new Error('Invalid original Agent request')
  return value
}
function windows(value: unknown): WindowsRequest {
  if (
    !schema.getApiV1TenantsByTenantDevicesByDeviceWindowsCertificateRequestsByAttemptResponse.validateRoot(
      value,
    )
  )
    throw new Error('Invalid original Windows request')
  return value
}
export function createRequestHistoryAdapter(
  transport: HttpTransport,
  tenant: string,
): RequestHistoryPort {
  return {
    agents: (device, cursor, signal) =>
      api.getApiV1TenantsByTenantDevicesByDeviceAgentRequests(
        transport,
        {
          pathParams: { tenant, device },
          query: queryParameters({ limit: 100, ...(cursor ? { cursor } : {}) }),
          ...(signal ? { signal } : {}),
        },
        (value) => ({ items: value.items.map(agent), nextCursor: nextCursor(value.nextCursor) }),
      ),
    agent: (id, signal) =>
      api.getApiV1TenantsByTenantAgentRequestsById(
        transport,
        { pathParams: { tenant, id }, ...(signal ? { signal } : {}) },
        agent,
      ),
    windows: (device, cursor, signal) =>
      api.getApiV1TenantsByTenantDevicesByDeviceWindowsCertificateRequests(
        transport,
        {
          pathParams: { tenant, device },
          query: queryParameters({ limit: 100, ...(cursor ? { cursor } : {}) }),
          ...(signal ? { signal } : {}),
        },
        (value) => ({ items: value.items.map(windows), nextCursor: nextCursor(value.nextCursor) }),
      ),
    windowsRequest: (device, attempt, signal) =>
      api.getApiV1TenantsByTenantDevicesByDeviceWindowsCertificateRequestsByAttempt(
        transport,
        { pathParams: { tenant, device, attempt }, ...(signal ? { signal } : {}) },
        windows,
      ),
    windowsRecoveries: (device, attempt, cursor, signal) =>
      api.getApiV1TenantsByTenantDevicesByDeviceWindowsCertificateRequestsByAttemptRecoveryOperations(
        transport,
        {
          pathParams: { tenant, device, attempt },
          query: queryParameters({ limit: 100, ...(cursor ? { cursor } : {}) }),
          ...(signal ? { signal } : {}),
        },
        (value) => ({
          items: value.items.map((row) => {
            if (
              typeof row.actor !== 'string' ||
              typeof row.instance !== 'string' ||
              typeof row.operationId !== 'string'
            )
              throw new Error('Incomplete recovery identity')
            return { actor: row.actor, instance: row.instance, operationId: row.operationId }
          }),
          nextCursor: nextCursor(value.nextCursor),
        }),
      ),
    windowsRecovery: (device, attempt, operation) =>
      api.getApiV1TenantsByTenantDevicesByDeviceWindowsCertificateRequestsByAttemptRecoveryOperationsByOperation(
        transport,
        {
          pathParams: { tenant, device, attempt, operation: operation.operationId },
          query: { actor: operation.actor, instance: operation.instance },
        },
        (value) => value,
      ),
  }
}
