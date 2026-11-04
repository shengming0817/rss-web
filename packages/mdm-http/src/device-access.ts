import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { Binding, DeviceAccessPort, EnterpriseRecord } from '@rss/mdm-device-access'
import { nullable, positive, uuid } from './decode'
function binding(value: unknown, device: string): Binding {
  if (
    !schema.getApiV1DevicesByDeviceDeviceAccessBindingsByIdResponse.validateRoot(value) ||
    value.device !== device
  )
    throw new Error('Wrong device binding')
  return {
    id: uuid(value.id),
    operationId: uuid(value.operationId),
    device,
    registration: uuid(value.registration),
    registrationGeneration: positive(value.registrationGeneration),
    bindingGeneration: positive(value.bindingGeneration),
    factorGeneration: positive(value.factorGeneration),
    revision: positive(value.revision),
    serverState: value.serverState,
    policy: uuid(value.policy),
    policyVersion: uuid(value.policyVersion),
    receivedRevision: nullable(value.receivedRevision, positive),
    appliedRevision: nullable(value.appliedRevision, positive),
    effect: value.effect?.state ?? null,
  }
}
export function createDeviceAccessAdapter(transport: HttpTransport): DeviceAccessPort {
  return {
    bindings: (device, query) =>
      api.getApiV1DevicesByDeviceDeviceAccess(
        transport,
        {
          pathParams: { device },
          query: queryParameters({ limit: 20, ...query }),
        },
        (value) => ({
          items: value.items.map((item) => binding(item, device)),
          nextCursor: nextCursor(value.nextCursor),
        }),
      ),
    binding: (device, id) =>
      api.getApiV1DevicesByDeviceDeviceAccessBindingsById(
        transport,
        { pathParams: { device, id: uuid(id) } },
        (value) => binding(value, device),
      ),
    operation: (device, id) =>
      api.getApiV1DevicesByDeviceDeviceAccessOperationsById(
        transport,
        { pathParams: { device, id: uuid(id) } },
        (value) => binding(value, device),
      ),
    enterprise: (query) =>
      api.getApiV1DeviceAccessEnterpriseConfiguration(
        transport,
        { query: queryParameters({ limit: 20, ...query, fields: ['id', 'kind', 'value'] }) },
        (value) => ({
          items: value.items.map((item): EnterpriseRecord => {
            if (!schema.getApiV1DeviceAccessEnterpriseConfigurationByIdResponse.validateRoot(item))
              throw new Error('Incomplete enterprise record')
            if (item.kind === 'relying_party') {
              if (item.id !== `rp:${item.value.id}`) throw new Error('Wrong relying party')
              return {
                id: item.id,
                kind: item.kind,
                revision: positive(item.value.revision),
                enabled: item.value.enabled,
                reference: item.value.callback,
              }
            }
            if (item.kind === 'subject') {
              if (item.id !== `subject:${item.value.provider}:${item.value.person.principal}`)
                throw new Error('Wrong enterprise subject')
              return {
                id: item.id,
                kind: item.kind,
                revision: positive(item.value.revision),
                enabled: item.value.enabled,
                reference: item.value.username,
              }
            }
            if (item.id !== `windows:${item.value.bindingId}`)
              throw new Error('Wrong Windows source')
            return {
              id: item.id,
              kind: item.kind,
              revision: positive(item.value.version),
              enabled: null,
              reference: item.value.bindingId,
            }
          }),
          nextCursor: nextCursor(value.nextCursor),
        }),
      ),
  }
}
