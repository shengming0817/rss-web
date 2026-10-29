import type {
  AccountMappingInput,
  AccountOrganizationInput,
  AdeCommand,
  AdeConfiguration,
  AppleEnrollmentPort,
} from './model'
import { boundedText, revision, uuid, validateSetup } from './authoring'
function domain(value: string): void {
  boundedText(value, 253)
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value))
    throw new Error('Invalid organization domain')
}
function account(value: string): void {
  boundedText(value, 320)
  if (!/^[^\s@]+@[^\s@]+$/.test(value)) throw new Error('Invalid managed account')
  domain(value.split('@')[1]!)
}
export function validateAccountOrganization(input: AccountOrganizationInput): void {
  revision(input.expectedRevision)
  domain(input.domain)
  uuid(input.serverUuid)
  boundedText(input.signingKey, 128)
  if (!input.signingKey.trim()) throw new Error('Missing signing key alias')
}
export function validateAccountMapping(name: string, input: AccountMappingInput): void {
  account(name)
  uuid(input.principalId)
  uuid(input.instanceId)
  revision(input.expectedRevision)
}
export function validateAdeConfiguration(input: AdeConfiguration): void {
  revision(input.expectedRevision)
  uuid(input.serverUuid)
  boundedText(input.orgId, 256)
  if (!input.orgId.trim()) throw new Error('Missing organization identity')
}
export function validateAdeCommand(command: AdeCommand): void {
  switch (command.kind) {
    case 'token':
      revision(command.expectedRevision)
      boundedText(command.p7m, 262144)
      if (!command.p7m.trim()) throw new Error('Missing ADE token')
      break
    case 'profile':
      uuid(command.id)
      revision(command.expectedRevision)
      validateSetup(command.configuration)
      break
    case 'assign':
      uuid(command.profile)
      if (!revision(command.revision)) throw new Error('Missing profile revision')
      break
    case 'resolve':
      uuid(command.operation)
      uuid(command.remoteProfile)
      break
    case 'reconcile':
      uuid(command.operation)
      break
    case 'sync':
    case 'clear':
      break
    default:
      throw new Error('Invalid ADE command')
  }
  if (command.kind === 'assign' || command.kind === 'clear') {
    if (
      !command.devices.length ||
      command.devices.length > 1000 ||
      new Set(command.devices).size !== command.devices.length
    )
      throw new Error('Invalid ADE devices')
    command.devices.forEach((serial) => {
      boundedText(serial, 128)
      if (!serial.trim()) throw new Error('Invalid device serial')
    })
  }
}
export function createAppleEnrollment(port: AppleEnrollmentPort) {
  return Object.freeze({
    ...port,
    async saveAccountOrganization(
      id: string,
      operationId: string,
      input: AccountOrganizationInput,
    ) {
      uuid(id)
      uuid(operationId)
      validateAccountOrganization(input)
      const result = await port.saveAccountOrganization(id, operationId, input)
      if (result !== input.expectedRevision + 1)
        throw new Error('Wrong account organization receipt')
      return result
    },
    async saveAccount(id: string, name: string, operationId: string, input: AccountMappingInput) {
      uuid(id)
      uuid(operationId)
      validateAccountMapping(name, input)
      const result = await port.saveAccount(id, name, operationId, input)
      if (result !== input.expectedRevision + 1) throw new Error('Wrong managed account receipt')
      return result
    },
    async configureAde(id: string, operationId: string, input: AdeConfiguration) {
      uuid(id)
      uuid(operationId)
      validateAdeConfiguration(input)
      const result = await port.configureAde(id, operationId, input)
      if (
        result.operationId !== operationId ||
        result.revision !== input.expectedRevision + 1 ||
        result.state !== 'succeeded'
      )
        throw new Error('Wrong ADE configuration receipt')
      return result
    },
    async adeCommand(id: string, operationId: string, command: AdeCommand) {
      uuid(id)
      uuid(operationId)
      validateAdeCommand(command)
      const result = await port.adeCommand(id, operationId, command)
      if (result.operationId !== operationId) throw new Error('Wrong ADE operation receipt')
      return result
    },
  })
}
export type AppleEnrollment = ReturnType<typeof createAppleEnrollment>
