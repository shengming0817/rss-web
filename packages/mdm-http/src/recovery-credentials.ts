import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { allOf, comparison, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  validateConfiguration,
  validateMaterial,
  validateSubject,
  type CredentialOperation,
  type Disclosure,
  type FileVaultConfiguration,
  type Material,
  type MaterialRef,
  type RecoveryCredentialsPort,
  type Subject,
} from '@rss/mdm-recovery-credentials'
import { boolean, nullable, positive, text, uuid } from './decode'
import { integer, requestInput } from './inventory-values'

function subject(value: unknown): Subject {
  if (!schema.getApiV1DevicesByDeviceRecoveryCredentialsResponse.validateSubject(value))
    throw new Error('Invalid recovery credential subject')
  const result = structuredClone(value)
  validateSubject(result)
  return result
}
function binding(value: unknown): Material['binding'] {
  if (!schema.getApiV1DevicesByDeviceRecoveryCredentialsResponse.validateBinding(value))
    throw new Error('Invalid recovery credential binding')
  return {
    device: text(value.device),
    registration: uuid(value.registration),
    generation: positive(value.generation),
    subject: subject(value.subject),
  }
}
function material(value: unknown, target: string | MaterialRef): Material {
  if (
    !schema.postApiV1DevicesByDeviceRecoveryCredentialsByIdVersionsByVersionRevokeResponse.validateRoot(
      value,
    )
  )
    throw new Error('Invalid recovery material')
  const result: Material = {
    id: uuid(value.id),
    binding: binding(value.binding),
    version: positive(value.version),
    current: value.current,
    validity: value.validity,
    escrowed: value.escrowed,
    operation: uuid(value.operation),
    createdAt: integer(value.createdAt),
    invalidatedAt: nullable(value.invalidatedAt, integer),
  }
  validateMaterial(result, typeof target === 'string' ? undefined : target)
  if (typeof target === 'string' && result.binding.device !== target)
    throw new Error('Wrong material device')
  return result
}
function fields(device: string) {
  return {
    id: uuid,
    version: positive,
    current: boolean,
    validity: (value: unknown) => {
      if (!schema.getApiV1DevicesByDeviceRecoveryCredentialsResponse.validateValidity(value))
        throw new Error('Invalid credential validity')
      return value
    },
    escrowed: boolean,
    operation: uuid,
    createdAt: integer,
    invalidatedAt: (value: unknown) => nullable(value, integer),
    binding: (value: unknown) => {
      const result = binding(value)
      if (result.device !== device) throw new Error('Wrong material directory device')
      return result
    },
  }
}
function configuration(value: unknown): FileVaultConfiguration {
  if (
    !schema.getApiV1DevicesByDeviceRecoveryCredentialsFilevaultConfigurationResponse.validateRoot(
      value,
    )
  )
    throw new Error('Invalid FileVault collection configuration')
  const result = {
    ...value,
    revision: integer(value.revision),
    materialRevision: integer(value.materialRevision),
    custodyEpoch: integer(value.custodyEpoch),
    custodyId: nullable(value.custodyId, uuid),
  }
  validateConfiguration(result)
  return result
}
function disclosure(value: unknown, target: MaterialRef): Disclosure {
  if (
    !schema.getApiV1DevicesByDeviceRecoveryCredentialsByIdVersionsByVersionSecretResponse.validateRoot(
      value,
    )
  )
    throw new Error('Invalid recovery disclosure')
  if (
    !value.secret ||
    value.secret.includes('\0') ||
    new TextEncoder().encode(value.secret).length > 4096
  )
    throw new Error('Invalid recovery secret')
  return { material: material(value.material, target), secret: value.secret }
}
const path = (target: MaterialRef) => ({
  device: target.device,
  id: target.id,
  version: target.version,
})
function operation(value: unknown, id: string): CredentialOperation {
  if (
    !schema.getApiV1DevicesByDeviceOperationsByIdResponse.validateRoot(value) ||
    value.operationId !== id ||
    value.commandId !== id ||
    value.inputVersion !== 'recovery-credential/v1' ||
    value.task.platform !== 'macos' ||
    value.target.kind !== 'device'
  )
    throw new Error('Wrong recovery credential operation facts')
  const observation = value.observation
  if (
    observation.protocol !== 'mdm.apple' ||
    (observation.observationScope !== 'native_command' &&
      observation.observationScope !== 'profile_presence')
  )
    throw new Error('Wrong recovery credential observation')
  return {
    operationId: uuid(value.operationId),
    commandId: uuid(value.commandId),
    revision: positive(value.revision),
    inputVersion: value.inputVersion,
    deadline: integer(value.deadline),
    task: value.task.name,
    commandStatus: value.commandStatus,
    authorization: value.authorization.state,
    authorizationReason:
      value.authorization.state === 'blocked' ? value.authorization.reason : null,
    dispatchFailure: value.dispatchFailure?.reason ?? null,
    observation: {
      scope: observation.observationScope,
      progress: observation.progress,
      effect: observation.effect,
      result: observation.result ?? null,
      receipts: observation.receipts.map((receipt) => ({
        phase: receipt.phase,
        state: receipt.state,
        receivedAt: nullable(receipt.receivedAt, integer),
        accepted: receipt.accepted,
      })),
    },
  }
}
export function createRecoveryCredentialsAdapter(
  transport: HttpTransport,
): RecoveryCredentialsPort {
  return {
    list: (device, query) =>
      api.getApiV1DevicesByDeviceRecoveryCredentials(
        transport,
        { pathParams: { device }, query: queryParameters({ limit: 64, ...query }) },
        (value) => {
          const page = projectedPage(value, fields(device), query.fields, ['id', 'version'])
          if (page.items.length > 100) throw new Error('Recovery material page exceeds budget')
          return page
        },
      ),
    material: (target) =>
      api.getApiV1DevicesByDeviceRecoveryCredentials(
        transport,
        {
          pathParams: { device: target.device },
          query: queryParameters({
            filter: allOf(
              comparison('id', '==', target.id),
              comparison('version', '==', target.version),
            ),
            limit: 1,
          }),
        },
        (value) => {
          const page = projectedPage(value, fields(target.device), undefined, ['id', 'version'])
          if (page.items.length !== 1 || page.nextCursor !== null)
            throw new Error('Missing exact recovery material')
          return material(page.items[0], target)
        },
      ),
    configuration: (device, selection) =>
      api.getApiV1DevicesByDeviceRecoveryCredentialsFilevaultConfiguration(
        transport,
        {
          pathParams: { device },
          ...(selection
            ? { query: { registration: selection.registration, generation: selection.generation } }
            : {}),
        },
        configuration,
      ),
    configure: (device, input) =>
      api.postApiV1DevicesByDeviceRecoveryCredentialsFilevaultConfiguration(
        transport,
        {
          pathParams: { device },
          body: {
            operationId: input.operationId,
            registration: input.registration,
            generation: input.generation,
            expectedRevision: input.expectedRevision,
            enabled: input.enabled,
            recipientId: input.recipientId,
          },
        },
        configuration,
      ),
    link: (device, operationId, otherDevice) =>
      api.postApiV1DevicesByDeviceRecoveryCredentialsFilevaultLink(
        transport,
        { pathParams: { device }, body: { operationId, otherDevice } },
        configuration,
      ),
    reveal: (target, signal) =>
      api.getApiV1DevicesByDeviceRecoveryCredentialsByIdVersionsByVersionSecret(
        transport,
        { pathParams: path(target), signal },
        (value) => disclosure(value, target),
      ),
    beginLoginDisclosure: (input, signal) =>
      api.postApiV1DevicesByDeviceDeviceAccessMaterialsByIdVersionsByVersionStepUp(
        transport,
        { pathParams: path(input.target), body: { operationId: input.operationId }, signal },
        (value) => {
          if (
            !schema.postApiV1DevicesByDeviceDeviceAccessMaterialsByIdVersionsByVersionStepUpResponse.validateRoot(
              value,
            )
          )
            throw new Error('Invalid material authorization challenge')
          const publicKey = value.options['publicKey']
          if (!publicKey || typeof publicKey !== 'object' || Array.isArray(publicKey))
            throw new Error('Invalid material public-key options')
          return {
            id: uuid(value.id),
            publicKey: structuredClone(publicKey) as Record<string, unknown>,
          }
        },
      ),
    revealLogin: (input, signal) =>
      api.postApiV1DevicesByDeviceDeviceAccessMaterialsByIdVersionsByVersionSecret(
        transport,
        { pathParams: path(input.target), body: { operationId: input.operationId }, signal },
        (value) => disclosure(value, input.target),
      ),
    revoke: (target) =>
      api.postApiV1DevicesByDeviceRecoveryCredentialsByIdVersionsByVersionRevoke(
        transport,
        { pathParams: path(target) },
        (value) => material(value, target),
      ),
    create: (input, unlockPassword) =>
      api.postApiV1DevicesByDeviceRecoveryCredentialsOperations(
        transport,
        {
          pathParams: { device: input.device },
          body: requestInput(
            {
              operationId: input.operationId,
              registration: input.registration,
              generation: input.generation,
              deadline: input.deadline,
              action:
                input.action.kind === 'rotate_filevault'
                  ? { ...input.action, unlockPassword }
                  : input.action,
            },
            schema.postApiV1DevicesByDeviceRecoveryCredentialsOperationsBody.validateRoot,
          ),
        },
        (value) => {
          if (
            value.operationId !== input.operationId ||
            value.commandId !== input.operationId ||
            !value.accepted
          )
            throw new Error('Wrong recovery credential acceptance')
          return {
            operationId: uuid(value.operationId),
            commandId: uuid(value.commandId),
            revision: positive(value.revision),
            accepted: true,
          }
        },
      ),
    operation: (device, id) =>
      api.getApiV1DevicesByDeviceOperationsById(
        transport,
        { pathParams: { device, id } },
        (value) => operation(value, id),
      ),
  }
}
