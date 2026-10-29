export type * from './model'
export { actionKinds } from './model'
export * from './authoring'
import type { DirectoryQuery } from '@rss/mdm-devices'
import { freeze, identifier, revision, uuid } from '@rss/mdm-inventory'
import {
  actionIntent,
  positive,
  readable,
  reference,
  validateConfiguration,
  validateIntent,
  validateMaterial,
  validateReference,
  validateRegistration,
} from './authoring'
import type {
  ConfigureFileVault,
  Disclosure,
  LoginDisclosure,
  Material,
  MaterialRef,
  OperationIntent,
  RecoveryCredentialsPort,
  Registration,
} from './model'

export function credentialIntent(input: OperationIntent): OperationIntent {
  validateIntent(input)
  return freeze({
    device: input.device,
    operationId: input.operationId,
    registration: input.registration,
    generation: input.generation,
    deadline: input.deadline,
    action: actionIntent(input.action),
  })
}
export function disclosureKey(input: LoginDisclosure): string {
  uuid(input.operationId)
  validateReference(input.target)
  return JSON.stringify([
    'mdm.device_access.disclose',
    input.target.device,
    input.target.id,
    input.target.version,
    input.operationId,
  ])
}
function disclosure(result: Disclosure, target: MaterialRef): Disclosure {
  validateMaterial(result.material, target)
  if (
    !readable(result.material) ||
    typeof result.secret !== 'string' ||
    !result.secret ||
    result.secret.includes('\0') ||
    new TextEncoder().encode(result.secret).length > 4096
  )
    throw new Error('Invalid credential disclosure')
  return result
}
/** Credential acceptance and device observation remain separate from escrow and verification. */
export function createRecoveryCredentials(port: RecoveryCredentialsPort) {
  async function exact(target: MaterialRef): Promise<Material> {
    validateReference(target)
    const value = await port.material(target)
    validateMaterial(value, target)
    return value
  }
  return Object.freeze({
    list: (device: string, query: DirectoryQuery<keyof Material> = {}) => {
      if (query.fields && (!query.fields.includes('id') || !query.fields.includes('version')))
        throw new Error('Material projections require exact identity')
      return port.list(identifier(device, 256), query)
    },
    material: exact,
    async configuration(device: string, registration: Registration | null = null) {
      identifier(device, 256)
      if (registration) validateRegistration(registration)
      const result = await port.configuration(device, registration && freeze(registration))
      validateConfiguration(result)
      return result
    },
    async configure(device: string, input: ConfigureFileVault) {
      identifier(device, 256)
      uuid(input.operationId)
      validateRegistration(input)
      revision(input.expectedRevision)
      if (typeof input.enabled !== 'boolean') throw new Error('Invalid FileVault collection choice')
      if (input.enabled) identifier(input.recipientId)
      else if (typeof input.recipientId !== 'string' || input.recipientId.includes('\0'))
        throw new Error('Invalid FileVault recipient input')
      const original = freeze(input),
        result = await port.configure(device, original)
      validateConfiguration(result)
      if (
        result.revision !== original.expectedRevision + 1 ||
        result.enabled !== original.enabled ||
        (original.enabled && result.recipientId !== original.recipientId)
      )
        throw new Error('Wrong FileVault configuration receipt')
      return result
    },
    async link(device: string, operationId: string, otherDevice: string) {
      identifier(device, 256)
      identifier(otherDevice, 256)
      uuid(operationId)
      if (device === otherDevice) throw new Error('Choose a distinct FileVault member')
      const result = await port.link(device, operationId, otherDevice)
      validateConfiguration(result)
      return result
    },
    async reveal(target: MaterialRef, signal?: AbortSignal) {
      validateReference(target)
      const original = freeze(target)
      if (signal?.aborted) throw new Error('Credential disclosure cancelled')
      const result = disclosure(await port.reveal(original, signal), original)
      if (signal?.aborted) throw new Error('Credential disclosure cancelled')
      if (result.material.binding.subject.kind === 'rss_login')
        throw new Error('Wrong ordinary credential disclosure')
      return result
    },
    async beginLoginDisclosure(input: LoginDisclosure, signal?: AbortSignal) {
      disclosureKey(input)
      if (signal?.aborted) throw new Error('Credential authorization cancelled')
      return port.beginLoginDisclosure(freeze(input), signal)
    },
    async revealLogin(input: LoginDisclosure, signal?: AbortSignal) {
      disclosureKey(input)
      const original = freeze(input)
      if (signal?.aborted) throw new Error('Credential disclosure cancelled')
      const result = disclosure(await port.revealLogin(original, signal), original.target)
      if (signal?.aborted) throw new Error('Credential disclosure cancelled')
      if (result.material.binding.subject.kind !== 'rss_login')
        throw new Error('Wrong Device Access disclosure')
      return result
    },
    async revoke(target: MaterialRef) {
      validateReference(target)
      const original = freeze(target),
        result = await port.revoke(original)
      validateMaterial(result, original)
      if (result.validity !== 'revoked') throw new Error('Wrong material revocation receipt')
      return result
    },
    async create(input: OperationIntent, unlockPassword?: string) {
      const intent = credentialIntent(input)
      if (intent.action.kind === 'rotate_filevault') {
        if (
          typeof unlockPassword !== 'string' ||
          !unlockPassword ||
          unlockPassword.includes('\0') ||
          new TextEncoder().encode(unlockPassword).length > 4096
        )
          throw new Error('FileVault rotation requires a local unlock password')
      } else if (unlockPassword !== undefined)
        throw new Error('Unexpected secret for credential operation')
      const result = await port.create(intent, unlockPassword)
      if (
        result.operationId !== intent.operationId ||
        result.commandId !== intent.operationId ||
        result.accepted !== true
      )
        throw new Error('Wrong credential operation acceptance')
      positive(result.revision)
      return result
    },
    async operation(device: string, id: string, original?: OperationIntent) {
      identifier(device, 256)
      uuid(id)
      if (original) {
        validateIntent(original)
        if (original.device !== device || original.operationId !== id)
          throw new Error('Wrong original credential operation')
      }
      const result = await port.operation(device, id)
      if (
        result.operationId !== id ||
        result.commandId !== id ||
        result.inputVersion !== 'recovery-credential/v1' ||
        (original && result.deadline !== original.deadline)
      )
        throw new Error('Wrong original credential operation facts')
      return result
    },
    reference,
  })
}
export type RecoveryCredentials = ReturnType<typeof createRecoveryCredentials>
