import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import * as schema from '@rss/api/mdm-schemas'
import { positive, uuid } from './decode'
import { requestInput } from './inventory-values'
import type { ControlPort } from '@rss/mdm-devices/control'
export function createDeviceControlAdapter(transport: HttpTransport, tenant: string): ControlPort {
  return {
    original: (device, id, signal) =>
      api.getApiV1TenantsByTenantDevicesByDeviceOperationsById(
        transport,
        { pathParams: { tenant, device, id }, signal },
        (value) => {
          if (value.owner !== 'device' || value.operationId !== id || value.commandId !== id)
            throw new Error('Wrong original control operation')
          return {
            operationId: id,
            revision: positive(value.revision),
            status: value.commandStatus,
          }
        },
      ),
    create: (input, pin) =>
      api.postApiV1TenantsByTenantDevicesByDeviceOperations(
        transport,
        {
          pathParams: { tenant, device: input.device },
          body: requestInput(
            {
              operationId: input.operationId,
              deadline: input.deadline,
              action: input.action.kind === 'lock' ? { ...input.action, pin } : input.action,
            },
            schema.postApiV1TenantsByTenantDevicesByDeviceOperationsBody.validateRoot,
          ),
        },
        (value) => {
          if (value.operationId !== input.operationId || value.commandId !== input.operationId)
            throw new Error('Wrong control receipt')
          return { operationId: uuid(value.operationId), revision: positive(value.revision) }
        },
      ),
    cancel: (device, id, input) =>
      api.postApiV1TenantsByTenantDevicesByDeviceOperationsByIdCancel(
        transport,
        {
          pathParams: { tenant, device, id },
          body: requestInput(
            { requestId: input.requestId, expectedRevision: input.expectedRevision },
            schema.postApiV1TenantsByTenantDevicesByDeviceOperationsByIdCancelBody.validateRoot,
          ),
        },
        (value) => ({ operationId: uuid(value.operationId), revision: positive(value.revision) }),
      ),
    reauthorize: (device, id, input) =>
      api.postApiV1TenantsByTenantDevicesByDeviceOperationsByIdReauthorize(
        transport,
        {
          pathParams: { tenant, device, id },
          body: requestInput(
            input,
            schema.postApiV1TenantsByTenantDevicesByDeviceOperationsByIdReauthorizeBody
              .validateRoot,
          ),
        },
        (value) => ({ operationId: uuid(value.operationId), revision: positive(value.revision) }),
      ),
  }
}
