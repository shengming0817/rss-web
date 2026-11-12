import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type {
  Binding,
  DeviceAccessPort,
  EnterpriseRecord,
  EnterpriseDetail,
  AuthorizationChallenge,
} from '@rss/mdm-device-access'
import { requestInput } from './inventory-values'
import { nullable, positive, uuid, record, text } from './decode'
function binding(value: unknown, device: string): Binding {
  if (
    !schema.getApiV1DevicesByDeviceDeviceAccessBindingsByIdResponse.validateRoot(value) ||
    value.device !== device
  )
    throw new Error('Wrong device binding')
  return {
    instance: uuid(value.instance),
    principal: uuid(value.principal),
    account: value.account,
    accountIntent: value.accountIntent,
    disposition: value.accountDisposition,
    id: uuid(value.id),
    operationId: uuid(value.operationId),
    device,
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
function challenge(value: { id: string; options: unknown }): AuthorizationChallenge {
  return { id: uuid(value.id), publicKey: record(record(value.options)['publicKey']) }
}
function enterprise(value: unknown, id?: string): EnterpriseDetail {
  if (!schema.getApiV1DeviceAccessEnterpriseConfigurationByIdResponse.validateRoot(value))
    throw new Error('Invalid enterprise detail')
  let result: EnterpriseDetail
  if (value.kind === 'relying_party')
    result = {
      id: value.id,
      revision: positive(value.value.revision),
      configuration: {
        kind: value.kind,
        id: value.value.id,
        enabled: value.value.enabled,
        callback: value.value.callback,
        capabilities: value.value.capabilities,
      },
      targetFingerprint: value.value.targetFingerprint,
    }
  else if (value.kind === 'subject')
    result = {
      id: value.id,
      revision: positive(value.value.revision),
      configuration: {
        kind: value.kind,
        provider: value.value.provider,
        person: value.value.person,
        enabled: value.value.enabled,
        subject: value.value.subject,
        username: value.value.username,
      },
      targetFingerprint: null,
    }
  else
    result = {
      id: value.id,
      revision: positive(value.value.version),
      configuration: null,
      targetFingerprint: null,
    }
  if (id !== undefined && result.id !== id) throw new Error('Wrong enterprise detail')
  return result
}
export function createDeviceAccessAdapter(transport: HttpTransport): DeviceAccessPort {
  return {
    beginBinding: (device, id, input, signal) =>
      api.postApiV1DevicesByDeviceDeviceAccessBindingsByIdStepUp(
        transport,
        {
          pathParams: { device, id },
          body: requestInput(
            input,
            schema.postApiV1DevicesByDeviceDeviceAccessBindingsByIdStepUpBody.validateRoot,
          ),
          signal,
        },
        challenge,
      ),
    changeBinding: (device, id, input) =>
      api.putApiV1DevicesByDeviceDeviceAccessBindingsById(
        transport,
        {
          pathParams: { device, id },
          body: requestInput(
            input,
            schema.putApiV1DevicesByDeviceDeviceAccessBindingsByIdBody.validateRoot,
          ),
        },
        (value) => binding(value, device),
      ),
    enterpriseDetail: (id, signal) =>
      api.getApiV1DeviceAccessEnterpriseConfigurationById(
        transport,
        { signal, pathParams: { id } },
        (value) => enterprise(value, id),
      ),
    beginEnterprise: (input, signal) =>
      api.postApiV1DeviceAccessEnterpriseConfigurationStepUp(
        transport,
        {
          body: requestInput(
            input,
            schema.postApiV1DeviceAccessEnterpriseConfigurationStepUpBody.validateRoot,
          ),
          signal,
        },
        challenge,
      ),
    changeEnterprise: (input) =>
      api.postApiV1DeviceAccessEnterpriseConfiguration(
        transport,
        {
          body: requestInput(
            input,
            schema.postApiV1DeviceAccessEnterpriseConfigurationBody.validateRoot,
          ),
        },
        (value) => {
          const id =
            value.kind === 'relying_party'
              ? `rp:${value.value.id}`
              : value.kind === 'subject'
                ? `subject:${value.value.provider}:${value.value.person.principal}`
                : `windows:${value.value.bindingId}`
          return enterprise({ id, ...value })
        },
      ),
    platformSso: (device) =>
      api.getApiV1ApplePlatformSsoConfiguration(
        transport,
        { query: { deviceId: device } },
        (value) => ({
          teamId: text(value.configuration.teamId),
          extensionId: text(value.configuration.extensionId),
          applicationId: text(value.configuration.applicationId),
          applicationVersion: text(value.configuration.applicationVersion),
          clientId: text(value.configuration.clientId),
          issuer: text(value.endpoints.issuer),
          base: text(value.endpoints.base),
          profileId: text(value.profile.identifier),
          profileUuid: uuid(value.profile.uuid),
          deploymentOrder: value.deploymentOrder,
          registrationTrust: value.registrationTrust,
          hardwareAttested: value.hardwareAttested,
        }),
      ),
    bindings: (device, query, signal) =>
      api.getApiV1DevicesByDeviceDeviceAccess(
        transport,
        { signal, pathParams: { device }, query: queryParameters({ limit: 20, ...query }) },
        (value) => ({
          items: value.items.map((item) => binding(item, device)),
          nextCursor: nextCursor(value.nextCursor),
        }),
      ),
    binding: (device, id, signal) =>
      api.getApiV1DevicesByDeviceDeviceAccessBindingsById(
        transport,
        { signal, pathParams: { device, id: uuid(id) } },
        (value) => binding(value, device),
      ),
    operation: (device, id) =>
      api.getApiV1DevicesByDeviceDeviceAccessOperationsById(
        transport,
        { pathParams: { device, id: uuid(id) } },
        (value) => binding(value, device),
      ),
    enterprise: (query, signal) =>
      api.getApiV1DeviceAccessEnterpriseConfiguration(
        transport,
        {
          signal,
          query: queryParameters({ limit: 20, ...query, fields: ['id', 'kind', 'value'] }),
        },
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
