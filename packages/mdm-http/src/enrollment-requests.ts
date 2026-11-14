import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { AgentRequest, WindowsRequest, RequestHistoryPort } from '@rss/mdm-enrollment/requests'
function agent(value: unknown): AgentRequest {
  if (!schema.getApiV1AgentRequestsByIdResponse.validateRoot(value))
    throw new Error('Invalid original Agent request')
  return value
}
function windows(value: unknown): WindowsRequest {
  if (
    !schema.getApiV1DevicesByDeviceWindowsCertificateRequestsByAttemptResponse.validateRoot(value)
  )
    throw new Error('Invalid original Windows request')
  return value
}
export function createRequestHistoryAdapter(transport: HttpTransport): RequestHistoryPort {
  return {
    agents: (device, cursor, signal) =>
      api.getApiV1DevicesByDeviceAgentRequests(
        transport,
        {
          pathParams: { device },
          query: queryParameters({ limit: 50, ...(cursor ? { cursor } : {}) }),
          ...(signal ? { signal } : {}),
        },
        (value) => ({ items: value.items.map(agent), nextCursor: nextCursor(value.nextCursor) }),
      ),
    agent: (id, signal) =>
      api.getApiV1AgentRequestsById(
        transport,
        { pathParams: { id }, ...(signal ? { signal } : {}) },
        agent,
      ),
    windows: (device, cursor, signal) =>
      api.getApiV1DevicesByDeviceWindowsCertificateRequests(
        transport,
        {
          pathParams: { device },
          query: queryParameters({ limit: 50, ...(cursor ? { cursor } : {}) }),
          ...(signal ? { signal } : {}),
        },
        (value) => ({ items: value.items.map(windows), nextCursor: nextCursor(value.nextCursor) }),
      ),
    windowsRequest: (device, attempt, signal) =>
      api.getApiV1DevicesByDeviceWindowsCertificateRequestsByAttempt(
        transport,
        { pathParams: { device, attempt }, ...(signal ? { signal } : {}) },
        windows,
      ),
    windowsRecoveries: (device, attempt, cursor, signal) =>
      api.getApiV1DevicesByDeviceWindowsCertificateRequestsByAttemptRecoveryOperations(
        transport,
        {
          pathParams: { device, attempt },
          query: queryParameters({ limit: 50, ...(cursor ? { cursor } : {}) }),
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
      api.getApiV1DevicesByDeviceWindowsCertificateRequestsByAttemptRecoveryOperationsByOperation(
        transport,
        {
          pathParams: { device, attempt, operation: operation.operationId },
          query: { actor: operation.actor, instance: operation.instance },
        },
        (value) => value,
      ),
  }
}
