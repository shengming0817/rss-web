import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import * as schema from '@rss/api/mdm-schemas'
import { nullable, positive, text, uuid, count } from './decode'
import { integer, requestInput } from './inventory-values'
import type { TrustPort, Trust } from '@rss/mdm-task-trust'
export function createTaskTrustAdapter(
  transport: HttpTransport,
  tenant: string,
  serviceId: string,
): TrustPort {
  function trust(value: unknown): Trust {
    if (
      !schema.getApiV1TenantsByTenantTaskSigningTrustResponse.validateRoot(value) ||
      value.version !== 1 ||
      value.tenant !== tenant ||
      value.service_id !== serviceId
    )
      throw new Error('Wrong task signing trust')
    return {
      tenant: uuid(value.tenant),
      serviceId: uuid(value.service_id),
      revision: count(value.revision),
      keys: value.keys.map((key) => ({
        id: text(key.id),
        publicKey: text(key.public_key),
        state: key.state,
      })),
    }
  }
  return {
    trust: () =>
      api.getApiV1TenantsByTenantTaskSigningTrust(transport, { pathParams: { tenant } }, trust),
    changeTrust: (operationId, input) =>
      api.postApiV1TenantsByTenantTaskSigningTrust(
        transport,
        {
          pathParams: { tenant },
          body: requestInput(
            input,
            schema.postApiV1TenantsByTenantTaskSigningTrustBody.validateRoot,
          ),
          headers: { 'Idempotency-Key': operationId },
        },
        trust,
      ),
    trustOperation: (id) =>
      api.getApiV1TenantsByTenantTaskSigningOperationsById(
        transport,
        { pathParams: { tenant, id } },
        trust,
      ),
    trustObservation: (device) =>
      api.getApiV1TenantsByTenantTaskSigningTrustDevicesByDeviceObservation(
        transport,
        { pathParams: { tenant, device } },
        (value) =>
          value === null
            ? null
            : {
                device: value.observation.deviceId,
                state: value.observation.state,
                reason: value.observation.reason,
                targetRevision: nullable(value.observation.target_revision, positive),
                actualRevision: nullable(value.observation.actual_revision, positive),
                receivedAt: integer(value.received_at),
              },
      ),
  }
}
